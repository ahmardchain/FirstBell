import assert from 'node:assert/strict'
import { test, afterEach } from 'node:test'
import { createHmac } from 'node:crypto'
import { generateKeyPair, exportSPKI, SignJWT } from 'jose'
import { encodeAbiParameters, encodeEventTopics, erc20Abi } from 'viem'
import { tokenAddresses } from '../lib/asset-catalog.ts'
import { tradingClient } from '../worker/binance-trading.ts'
import { BSC_USDT } from '../lib/funding.ts'
import { COW_SETTLEMENT } from '../lib/agent-trading.ts'
import { parseCashActivity, parsePurchaseBasis, walletCashActivity, walletPurchaseBasis, handleWalletActivity } from '../worker/wallet-activity.ts'
import { performanceFromBasis } from '../lib/portfolio-performance.ts'
import { handleApiRequest } from '../worker/router.ts'

const owner = '0x' + '11'.repeat(20), other = '0x' + '22'.repeat(20), hash = '0x' + 'cc'.repeat(32)
const row = (overrides = {}) => ({ binanceChainId: '56', itype: '2', tokenContractAddress: BSC_USDT.address, txHash: hash,
  txStatus: 'success', txTime: String(Date.now()), from: [{ address: other, amount: '5123456789123456789' }], to: [{ address: owner, amount: '5123456789123456789' }], ...overrides })
const page = rows => [{ cursor: 'next==', transactionList: rows }]
const originalFetch = globalThis.fetch
const originals = Object.fromEntries(['getChainId', 'getBlockNumber', 'getTransactionReceipt'].map(key => [key, tradingClient[key]]))
afterEach(() => { globalThis.fetch = originalFetch; Object.assign(tradingClient, originals) })

test('manual/exchange USDT deposits and withdrawals use the exact wallet/contract, raw 18-decimal amounts and provider status', () => {
  const incoming = row(), outgoing = row({ txHash: '0x' + 'dd'.repeat(32), txStatus: 'pending', from: incoming.to, to: incoming.from })
  const result = parseCashActivity(page([incoming, incoming, outgoing]), owner)
  assert.equal(result.transfers.length, 2)
  assert.equal(result.transfers.find(item => item.kind === 'deposit').amount, '5.123456789123456789')
  assert.equal(result.transfers.find(item => item.kind === 'withdrawal').status, 'pending')
  assert.equal(result.cursor, 'next==')
})

test('activity excludes wrong wallets/chains/contracts, token permissions, settlement cash legs and malformed evidence', () => {
  const rows = [row({ binanceChainId: '1' }), row({ tokenContractAddress: other }), row({ itype: '0', methodId: '0x095ea7b3' }), row({ from: [{ address: other, amount: '1' }], to: [{ address: other, amount: '1' }] }),
    row({ from: [{ address: COW_SETTLEMENT, amount: '1' }] }), row({ to: [{ address: owner, amount: '-1' }] }), row({ txTime: '0' }), row({ txStatus: 'unknown' }), row({ txHash: 'bad' }), row({ from: [{ address: owner, amount: '1' }] })]
  assert.deepEqual(parseCashActivity(page(rows), owner).transfers, [])
  assert.throws(() => parseCashActivity([{ cursor: 'bad cursor', transactionList: [] }], owner))
  assert.deepEqual(parseCashActivity([], owner), { transfers: [], cursor: null })
})

test('wallet history signs exact encoded queries, requests BSC USDT only and preserves provider cursor', async () => {
  const credentials = { apiKey: 'fixture-wallet', secretKey: 'fixture-secret' }
  globalThis.fetch = async (url, options) => {
    const u = new URL(url)
    assert.equal(u.pathname, '/build/api/v1/dex/post-transaction/transactions-by-address')
    assert.equal(u.searchParams.get('address'), owner); assert.equal(u.searchParams.get('chains'), '56')
    assert.equal(u.searchParams.get('tokenContractAddress'), BSC_USDT.address); assert.equal(u.searchParams.get('cursor'), 'abc+/==')
    assert.equal(options.headers['X-OC-SIGN'], createHmac('sha256', credentials.secretKey).update(options.headers['X-OC-TIMESTAMP'] + 'GET' + u.pathname + u.search).digest('base64'))
    return Response.json({ code: 0, data: page([row()]) })
  }
  const result = await walletCashActivity(owner, 'abc+/==', credentials)
  assert.equal(result.transfers[0].amount, '5.123456789123456789')
})

test('legacy purchase cost uses remaining basis, rather than cumulative realized PnL, and must match actual holdings', () => {
  const row = { isPnlSupported: true, buyAmount: '0.3', sellAmount: '0.15', tokenBalanceAmount: '0.15', buyTxVolume: '40', sellTxVolume: '24', realizedPnlUsd: '4' }
  const basis = parsePurchaseBasis('NVDAon', row, Date.now())
  assert.equal(basis.cost, 20)
  assert.equal(performanceFromBasis(basis, '0.15', 200).gain, 10)
  assert.equal(performanceFromBasis(basis, '0.15', 200).gainPct, 50)
  assert.equal(performanceFromBasis(basis, '0.16', 200), null)
  assert.equal(parsePurchaseBasis('NVDAon', { ...row, tokenBalanceAmount: '0.2' }, Date.now()), null)
  assert.equal(parsePurchaseBasis('NVDAon', { ...row, isPnlSupported: false }, Date.now()), null)
  assert.equal(parsePurchaseBasis('NVDAon', { ...row, buyAmount: 'NaN' }, Date.now()), null)
  assert.equal(parsePurchaseBasis('NVDAon', row, Date.now() - 20 * 60_000), null)
})

test('purchase-cost fallback uses exact BSC contract/wallet and unavailable tokens supply no invented basis', async () => {
  let calls = 0
  globalThis.fetch = async url => {
    const parsed = new URL(url)
    if (parsed.hostname === 'api.cow.fi') return Response.json([])
    calls++
    assert.equal(parsed.pathname, '/build/api/v1/dex/market/portfolio/token/latest-pnl')
    assert.equal(parsed.searchParams.get('walletAddress'), owner)
    assert.equal(parsed.searchParams.get('binanceChainId'), '56')
    if (parsed.searchParams.get('tokenContractAddress') === tokenAddresses.TSLAon.toLowerCase()) return Response.json({ code: 0, data: { isPnlSupported: false }, timestamp: Date.now() })
    return Response.json({ code: 0, timestamp: Date.now(), data: { isPnlSupported: true, buyAmount: '0.1', sellAmount: '0', tokenBalanceAmount: '0.1', buyTxVolume: '10', sellTxVolume: '0', realizedPnlUsd: '0' } })
  }
  const result = await walletPurchaseBasis(owner, ['NVDAon', 'TSLAon'], { apiKey: 'fixture-cost', secretKey: 'fixture-secret' })
  assert.equal(result.length, 1); assert.equal(result[0].symbol, 'NVDAon'); assert.equal(result[0].cost, 10)
})

test('activity endpoint verifies authentication, original wallet ownership, origin, bounds and rate limits before provider access', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256'), userId = 'did:privy:fixture-activity'
  const env = { PRIVY_APP_ID: 'fixture-activity-app', PRIVY_VERIFICATION_KEY: await exportSPKI(publicKey), BINANCE_WEB3_API_KEY: 'fixture-key', BINANCE_WEB3_SECRET_KEY: 'fixture-secret',
    ACCOUNTS: { idFromName: id => id, get: () => ({ fetch: async () => new Response('{}') }) } }
  const token = linked => new SignJWT({ linked_accounts: JSON.stringify([{ type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: linked }]) })
    .setProtectedHeader({ alg: 'ES256' }).setIssuer('privy.io').setAudience(env.PRIVY_APP_ID).setSubject(userId).setIssuedAt().setExpirationTime('1h').sign(privateKey)
  const access = await token(owner)
  const request = (data, proof = access, origin = 'https://firstbell.example') => new Request('https://firstbell.example/api/wallet/activity', { method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'privy-id-token': proof, 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(data) })
  let calls = 0
  globalThis.fetch = async url => { calls++; return new URL(url).hostname === 'api.cow.fi' ? Response.json([]) : Response.json({ code: 0, data: page([row()]) }) }
  assert.equal((await handleApiRequest(new Request('https://firstbell.example/api/wallet/activity', { method: 'POST' }), env)).status, 401)
  assert.equal((await handleWalletActivity(request({ walletAddress: owner }, await token(other)), env, userId)).status, 403)
  assert.equal((await handleWalletActivity(request({ walletAddress: owner }, access, 'https://other.example'), env, userId)).status, 403)
  assert.equal((await handleWalletActivity(request({ walletAddress: owner, cursor: 'x'.repeat(513) }), env, userId)).status, 400)
  assert.equal(calls, 0)
  const response = await handleApiRequest(request({ walletAddress: owner }), env)
  assert.equal(response.status, 200); assert.equal((await response.json()).transfers[0].kind, 'deposit'); assert.equal(calls, 2)
  env.ACCOUNTS.get = () => ({ fetch: async () => new Response('{}', { status: 429 }) })
  assert.equal((await handleWalletActivity(request({ walletAddress: owner }), env, userId)).status, 429)
  assert.equal(calls, 2)
})


test('empty token-filtered history falls back to all transactions and keeps that pagination scope', async () => {
  const seen = []
  globalThis.fetch = async url => {
    const u = new URL(url); seen.push(u)
    if (u.searchParams.has('tokenContractAddress')) return Response.json({ code: 0, data: [{ transactionList: [], cursor: '' }] })
    return Response.json({ code: 0, data: page([row(), row({ tokenContractAddress: other })]) })
  }
  const credentials = { apiKey: 'fixture-key', secretKey: 'fixture-secret' }
  const result = await walletCashActivity(owner, '', credentials)
  assert.equal(result.transfers.length, 1); assert.equal(result.cursor, 'all-next==')
  await walletCashActivity(owner, result.cursor, credentials)
  assert.equal(seen.length, 3)
  assert.equal(seen[2].searchParams.has('tokenContractAddress'), false)
  assert.equal(seen[2].searchParams.get('cursor'), 'next==')
})

test('outer-call USDT history and transaction-level amounts require a confirmed actual USDT transfer, never permissions or native calls', async () => {
  const amount = 5123456789123456789n
  const candidate = row({ itype: '0', amount: amount.toString(), from: [{ address: other }], to: [{ address: owner }] })
  globalThis.fetch = async () => Response.json({ code: 0, data: page([candidate]) })
  tradingClient.getChainId = async () => 56
  tradingClient.getBlockNumber = async () => 102n
  const receipt = { transactionHash: hash, status: 'success', blockNumber: 100n, logs: [{ address: BSC_USDT.address,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: other, to: owner } }), data: encodeAbiParameters([{ type: 'uint256' }], [amount]) }] }
  tradingClient.getTransactionReceipt = async () => receipt
  const credentials = { apiKey: 'fixture-key', secretKey: 'fixture-secret' }
  assert.equal((await walletCashActivity(owner, '', credentials)).transfers[0].amount, '5.123456789123456789')
  for (const mutate of [r => r.logs = [], r => r.logs[0].address = other, r => r.status = 'reverted', r => r.blockNumber = 102n,
    r => r.transactionHash = '0x' + 'ff'.repeat(32)]) {
    const invalid = structuredClone(receipt); mutate(invalid); tradingClient.getTransactionReceipt = async () => invalid
    assert.deepEqual((await walletCashActivity(owner, '', credentials)).transfers, [])
  }
})
