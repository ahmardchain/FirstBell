import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { encodeAbiParameters, encodeEventTopics, erc20Abi, parseUnits } from 'viem'
import { exportSPKI, generateKeyPair, SignJWT } from 'jose'
import { BSC_USDT } from '../lib/funding.ts'
import { COW_RELAYER, COW_SETTLEMENT } from '../lib/agent-trading.ts'
import { tokenAddresses } from '../lib/asset-catalog.ts'
import { performanceFromBasis } from '../lib/portfolio-performance.ts'
import { clearTradingMetadataCache, tradingClient } from '../worker/binance-trading.ts'
import { recoverWalletPurchaseBasis, settlementTradeAbi } from '../worker/wallet-purchase-basis.ts'
import { walletPurchaseBasis, handleWalletActivity } from '../worker/wallet-activity.ts'
import { handleApiRequest } from '../worker/router.ts'

// All indexer, analytics, receipt and RPC responses are isolated fixtures.
const owner = '0x' + '11'.repeat(20), other = '0x' + '22'.repeat(20), stock = tokenAddresses.AAPLon
const originalFetch = globalThis.fetch
const originals = Object.fromEntries(['readContract', 'getChainId', 'getTransactionReceipt', 'getBlockNumber'].map(method => [method, tradingClient[method]]))
afterEach(() => { globalThis.fetch = originalFetch; Object.assign(tradingClient, originals) })
beforeEach(() => clearTradingMetadataCache())

function fill(id = 1, side = 'buy', cash = '1', tokens = '0.002948612345') {
  return { owner, orderUid: '0x' + id.toString(16).padStart(64, '0') + owner.slice(2) + 'ffffffff', txHash: '0x' + id.toString(16).padStart(64, '0'),
    blockNumber: 100 + id, logIndex: 5, sellToken: side === 'buy' ? BSC_USDT.address : stock, buyToken: side === 'buy' ? stock : BSC_USDT.address,
    sellAmount: parseUnits(side === 'buy' ? cash : tokens, 18).toString(), buyAmount: parseUnits(side === 'buy' ? tokens : cash, 18).toString() }
}
function receipt(trade) {
  const transfer = (address, from, to, value, logIndex) => ({ address, logIndex, topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from, to } }),
    data: encodeAbiParameters([{ type: 'uint256' }], [value]) })
  return { status: 'success', to: COW_SETTLEMENT, transactionHash: trade.txHash, blockNumber: BigInt(trade.blockNumber), logs: [
    transfer(trade.sellToken, owner, COW_RELAYER, BigInt(trade.sellAmount), 1),
    { address: COW_SETTLEMENT, logIndex: trade.logIndex, topics: encodeEventTopics({ abi: settlementTradeAbi, eventName: 'Trade', args: { owner } }),
      data: encodeAbiParameters([{ type: 'address' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'bytes' }],
        [trade.sellToken, trade.buyToken, BigInt(trade.sellAmount), BigInt(trade.buyAmount), 0n, trade.orderUid]) },
    transfer(trade.buyToken, COW_SETTLEMENT, owner, BigInt(trade.buyAmount), 6),
  ] }
}
function fixture(trades = [fill()]) {
  const state = { trades, receipts: new Map(trades.map(trade => [trade.txHash, receipt(trade)])), calls: [], reads: [], tip: 1000n, chain: 56, analytics: null }
  tradingClient.getChainId = async () => state.chain
  tradingClient.readContract = async args => { assert.equal(args.functionName, 'decimals'); return 18 }
  tradingClient.getBlockNumber = async () => state.tip
  tradingClient.getTransactionReceipt = async ({ hash }) => { state.reads.push(hash); const result = state.receipts.get(hash); if (!result) throw Error('fixture receipt missing'); return result }
  globalThis.fetch = async (url, init) => {
    const u = new URL(url); state.calls.push({ host: u.hostname, method: init.method, path: u.pathname, offset: u.searchParams.get('offset') })
    if (u.hostname === 'web3.binance.com') {
      assert.equal(u.pathname, '/build/api/v1/dex/market/portfolio/token/latest-pnl')
      return state.analytics ? Response.json({ code: 0, success: true, timestamp: Date.now(), data: state.analytics }) : new Response('{}', { status: 503 })
    }
    assert.equal(u.hostname, 'api.cow.fi'); assert.equal(u.pathname, '/bnb/api/v2/trades')
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store')
    assert.equal(u.searchParams.get('owner'), owner); assert.equal(u.searchParams.get('limit'), '50')
    assert.equal(Object.keys(init.headers).some(key => key.startsWith('X-OC-')), false)
    const offset = Number(u.searchParams.get('offset'))
    return Response.json(state.trades.slice(offset, offset + 50))
  }
  return state
}

test('lost local AAPLon purchase recovers actual one-USDT cost and exact tokens even when analytics fails', async () => {
  const state = fixture()
  const [basis] = await walletPurchaseBasis(owner, ['AAPLon'], { apiKey: 'fixture-key', secretKey: 'fixture-secret' })
  assert.equal(basis.cost, 1); assert.equal(basis.quantity, '0.002948612345')
  assert.ok(Date.parse(basis.asOf) >= Date.now() - 1000)
  const buyPrice = 1 / Number(basis.quantity)
  const gain = performanceFromBasis(basis, basis.quantity, buyPrice * 1.01)
  assert.ok(Math.abs(gain.value - 1.01) < 1e-12); assert.ok(Math.abs(gain.gainPct - 1) < 1e-10)
  const loss = performanceFromBasis(basis, basis.quantity, buyPrice * .99)
  assert.ok(Math.abs(loss.value - .99) < 1e-12); assert.ok(Math.abs(loss.gainPct + 1) < 1e-10)
  assert.equal(performanceFromBasis(basis, '0.003', buyPrice), null, 'unrecorded incoming transfer must not acquire this purchase price')
  assert.ok(performanceFromBasis(basis, basis.quantity, 337.82).gain < 0, 'positive market movement cannot replace the buyer’s actual return')
  assert.equal(state.reads.length, 1); assert.ok(state.calls.every(call => call.method === 'GET'))
})

test('verified wallet fills take precedence over a conflicting analytics cost', async () => {
  const state = fixture()
  state.analytics = { isPnlSupported: true, buyAmount: '0.002948612345', sellAmount: '0', tokenBalanceAmount: '0.002948612345', buyTxVolume: '2', sellTxVolume: '0', realizedPnlUsd: '0' }
  const [basis] = await walletPurchaseBasis(owner, ['AAPLon'], { apiKey: 'fixture-key', secretKey: 'fixture-secret' })
  assert.equal(basis.cost, 1)
})

test('chronological raw-unit ledger retains weighted remaining cost after buys, partial sales and repeated partial fills', async () => {
  const buy1 = fill(1, 'buy', '1', '.002'), buy2 = fill(2, 'buy', '2', '.003'), sell = fill(3, 'sell', '2', '.002')
  buy2.orderUid = buy1.orderUid // another confirmed fill of the same partial order still counts
  fixture([sell, buy2, buy1, buy1])
  const [basis] = await recoverWalletPurchaseBasis(owner, ['AAPLon'])
  assert.equal(basis.quantity, '0.003'); assert.ok(Math.abs(basis.cost - 1.8) < 1e-12)
  assert.equal(performanceFromBasis(basis, '0.003', 660).gainPct.toFixed(2), '10.00')
})

test('complete owner history paginates past the first page before assigning cost', async () => {
  const unrelated = Array.from({ length: 52 }, (_, index) => ({ ...fill(index + 10), sellToken: other, buyToken: '0x' + '33'.repeat(20) }))
  const state = fixture([...unrelated, fill()])
  const [basis] = await recoverWalletPurchaseBasis(owner, ['AAPLon'])
  assert.equal(basis.cost, 1); assert.deepEqual(state.calls.map(call => call.offset), ['0', '50']); assert.equal(state.reads.length, 1)
})

test('a history limit is never treated as a complete cost ledger', async () => {
  const state = fixture(Array.from({ length: 200 }, (_, index) => fill(index + 1)))
  assert.deepEqual(await recoverWalletPurchaseBasis(owner, ['AAPLon']), [])
  assert.equal(state.calls.length, 4); assert.equal(state.reads.length, 0)
})

test('a successful indexer response cannot bypass owner, UID, token, transfer, receipt or confirmation checks', async () => {
  const changes = [
    state => { state.trades[0].owner = other },
    state => { state.trades[0].orderUid = '0x' + '44'.repeat(56) },
    state => { state.trades[0].txHash = null },
    state => { state.chain = 1 },
    state => { state.tip = 101n },
    state => { state.receipts.get(fill().txHash).status = 'reverted' },
    state => { state.receipts.get(fill().txHash).to = other },
    state => { state.receipts.get(fill().txHash).transactionHash = fill(2).txHash },
    state => { state.receipts.get(fill().txHash).blockNumber = 102n },
    state => { state.receipts.get(fill().txHash).logs[1].logIndex = 4 },
    state => { state.receipts.get(fill().txHash).logs[1].address = other },
    state => { state.receipts.get(fill().txHash).logs[1].data = receipt(fill(2)).logs[1].data },
    state => { state.receipts.get(fill().txHash).logs[0].data = encodeAbiParameters([{ type: 'uint256' }], [1n]) },
    state => { state.receipts.get(fill().txHash).logs[2].topics = encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: COW_SETTLEMENT, to: other } }) },
    state => { state.receipts.get(fill().txHash).logs.push({ ...state.receipts.get(fill().txHash).logs[1], logIndex: 7 }) },
    state => { state.receipts.delete(fill().txHash) },
    state => { state.trades[0].sellToken = other; state.receipts.set(fill().txHash, receipt(state.trades[0])) },
  ]
  for (let index = 0; index < changes.length; index++) {
    const state = fixture(); changes[index](state)
    assert.deepEqual(await recoverWalletPurchaseBasis(owner, ['AAPLon']), [], `mutation ${index} cannot imply a purchase cost`)
  }
})

test('unknown earlier purchases, fully sold positions and conflicting indexer duplicates have no remaining basis', async () => {
  fixture([fill(1, 'sell', '1', '.001')])
  assert.deepEqual(await recoverWalletPurchaseBasis(owner, ['AAPLon']), [])
  fixture([fill(2, 'sell', '1', '.002'), fill(1, 'buy', '1', '.002')])
  assert.deepEqual(await recoverWalletPurchaseBasis(owner, ['AAPLon']), [])
  fixture([fill(), { ...fill(), buyAmount: '1' }])
  assert.deepEqual(await recoverWalletPurchaseBasis(owner, ['AAPLon']), [])
})

test('cost recovery requires authenticated same-origin wallet ownership and rate limits, even without analytics credentials', async () => {
  const state = fixture(), { privateKey, publicKey } = await generateKeyPair('ES256'), userId = 'did:privy:fixture-cost'
  const env = { PRIVY_APP_ID: 'fixture-cost-app', PRIVY_VERIFICATION_KEY: await exportSPKI(publicKey),
    ACCOUNTS: { idFromName: id => id, get: () => ({ fetch: async () => new Response('{}') }) } }
  const token = linked => new SignJWT({ linked_accounts: JSON.stringify([{ type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: linked }]) })
    .setProtectedHeader({ alg: 'ES256' }).setIssuer('privy.io').setAudience(env.PRIVY_APP_ID).setSubject(userId).setIssuedAt().setExpirationTime('1h').sign(privateKey)
  const access = await token(owner)
  const request = (data = { walletAddress: owner, symbols: ['AAPLon'] }, proof = access, origin = 'https://firstbell.example') => new Request('https://firstbell.example/api/wallet/cost-basis', { method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'privy-id-token': proof, 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(data) })
  assert.equal((await handleApiRequest(new Request('https://firstbell.example/api/wallet/cost-basis', { method: 'POST' }), env)).status, 401)
  assert.equal((await handleWalletActivity(request(undefined, await token(other)), env, userId)).status, 403)
  assert.equal((await handleWalletActivity(request(undefined, access, 'https://other.example'), env, userId)).status, 403)
  assert.equal((await handleWalletActivity(request({ walletAddress: owner, symbols: ['FAKE'] }), env, userId)).status, 400)
  assert.equal(state.calls.length, 0)
  const response = await handleApiRequest(request(), env)
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal((await response.json()).costs[0].cost, 1)
  assert.ok(state.calls.every(call => call.host === 'api.cow.fi' && call.method === 'GET'))
  const before = state.calls.length
  env.ACCOUNTS.get = () => ({ fetch: async () => new Response('{}', { status: 429 }) })
  assert.equal((await handleWalletActivity(request(), env, userId)).status, 429)
  assert.equal(state.calls.length, before)
})
