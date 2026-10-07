import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { privateKeyToAccount } from 'viem/accounts'
import { encodeAbiParameters, encodeEventTopics, erc20Abi, keccak256, toHex } from 'viem'
import { BSC_USDT } from '../lib/funding.ts'
import { tokenAddresses } from '../lib/asset-catalog.ts'
import { COW_SETTLEMENT, COW_RELAYER, validateAgentTradePlan } from '../lib/agent-trading.ts'
import { clearTradingMetadataCache, tradingClient } from '../worker/binance-trading.ts'
import { prepareAgentTrade, submitAgentTrade, checkAgentOrder } from '../worker/agent-trading.ts'
import { cowOrderUid, getCowTrade } from '../worker/cow-trading.ts'

// Every provider/RPC call is mocked; this unfunded signer is a public fixture.
const signer = privateKeyToAccount(`0x${'11'.repeat(32)}`), owner = signer.address
const credentials = { apiKey: 'fixture-api-key', secretKey: 'fixture-secret-key' }
const stock = tokenAddresses.NVDAon, txHash = `0x${'ab'.repeat(32)}`
const originalFetch = globalThis.fetch
const methods = ['readContract', 'getChainId', 'getTransactionReceipt', 'getBlockNumber']
const originals = Object.fromEntries(methods.map(key => [key, tradingClient[key]]))
afterEach(() => { globalThis.fetch = originalFetch; Object.assign(tradingClient, originals) })
beforeEach(() => clearTradingMetadataCache())
const envelope = data => ({ code: 0, success: true, timestamp: Date.now(), data })
function fixture(side = 'buy', amount = '5') {
  const s = { raw: BigInt(amount) * 10n ** 18n, fee: 10n ** 15n, output: 25n * 10n ** 15n, calls: [], binance: 'other-vendor',
    balance: 10n ** 20n, allowance: 10n ** 20n, quoteMutation: null, status: 'open', acknowledged: true,
    stored: null, plan: null, badUid: false, duplicate: false, trades: 'valid', confirmations: 2, mismatch: false, mined: true, cancelledQuote: false }
  const sellToken = side === 'buy' ? BSC_USDT.address : stock, buyToken = side === 'buy' ? stock : BSC_USDT.address
  const order = () => ({ ...s.plan.typedData.message, uid: cowOrderUid(s.plan), owner, status: s.status })
  tradingClient.readContract = async args => args.functionName === 'decimals' ? 18 : args.functionName === 'balanceOf' ? s.balance : s.allowance
  tradingClient.getChainId = async () => 56
  tradingClient.getBlockNumber = async () => s.confirmations > 1 ? 101n : 100n
  tradingClient.getTransactionReceipt = async () => {
    if (!s.mined) throw new Error('fixture receipt not indexed')
    const transfer = (address, from, to, value) => ({ address, topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from, to } }), data: encodeAbiParameters([{ type: 'uint256' }], [value]) })
    return { status: 'success', to: COW_SETTLEMENT, blockNumber: 100n,
      logs: [transfer(sellToken, owner, COW_RELAYER, s.raw), transfer(buyToken, COW_SETTLEMENT, owner, s.mismatch ? 1n : s.output)] }
  }
  globalThis.fetch = async (url, init) => {
    const u = new URL(url), body = init.body ? JSON.parse(init.body) : null
    s.calls.push({ host: u.hostname, path: u.pathname, method: init.method, body })
    if (u.hostname === 'web3.binance.com') {
      if (u.pathname.endsWith('/supported/chain')) return Response.json(envelope([{ binanceChainId: '56' }]))
      assert.ok(u.pathname.endsWith('/quote'), 'direct fallback must not build or submit a different Binance order')
      if (typeof s.binance === 'number') return Response.json({ code: s.binance, success: false, msg: 'Minimum order amount is 20 USD.' })
      if (s.binance === 'auth') return new Response('', { status: 403 })
      return Response.json(envelope(s.binance === 'empty' ? [] : [{ quoteId: 'fixture-pcs', vendorName: 'PcsXRfq', executionMode: 'RFQ', binanceChainId: '56',
        fromTokenAmount: s.raw.toString(), toTokenAmount: s.output.toString(), fromToken: { tokenContractAddress: sellToken, decimal: '18' }, toToken: { tokenContractAddress: buyToken, decimal: '18' } }]))
    }
    assert.equal(u.hostname, 'api.cow.fi')
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store')
    assert.equal(Object.values(init.headers).some(value => String(value).includes(credentials.secretKey)), false)
    if (u.pathname.endsWith('/quote')) {
      assert.equal(body.sellToken.toLowerCase(), sellToken.toLowerCase()); assert.equal(body.buyToken.toLowerCase(), buyToken.toLowerCase())
      assert.equal(body.sellAmountBeforeFee, s.raw.toString()); assert.equal(body.from, owner); assert.equal(body.receiver, owner)
      assert.equal(body.appData, '{}'); assert.equal(body.validFor, 120); assert.equal(body.signingScheme, 'eip712')
      if (s.cancelledQuote) return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
      const value = { id: 123, from: owner, expiration: new Date(Date.now() + 120_000).toISOString(), quote: { sellToken, buyToken, receiver: owner,
        sellAmount: (s.raw - s.fee).toString(), buyAmount: s.output.toString(), feeAmount: s.fee.toString(), validTo: Math.floor(Date.now() / 1000) + 120,
        appData: '{}', kind: 'sell', partiallyFillable: false, sellTokenBalance: 'erc20', buyTokenBalance: 'erc20', signingScheme: 'eip712' } }
      s.quoteMutation?.(value)
      return Response.json(value)
    }
    if (u.pathname.endsWith('/orders')) {
      assert.equal(body.from, owner); assert.equal(body.quoteId, 123); assert.equal(body.appData, '{}')
      assert.equal(body.appDataHash, s.plan.typedData.message.appData); assert.equal(body.signature, s.signature)
      assert.equal(body.sellAmount, s.plan.typedData.message.sellAmount); assert.equal(body.buyAmount, s.plan.minimumReceive)
      s.stored = order()
      if (!s.acknowledged) throw new Error('fixture lost acknowledgement after acceptance')
      if (s.duplicate) return Response.json({ errorType: 'DuplicatedOrder' }, { status: 400 })
      return Response.json(s.badUid ? `0x${'aa'.repeat(56)}` : cowOrderUid(s.plan))
    }
    if (u.pathname.includes('/orders/')) return s.stored ? Response.json(order()) : new Response('', { status: 404 })
    assert.equal(u.pathname, '/bnb/api/v2/trades')
    assert.equal(u.searchParams.get('orderUid'), cowOrderUid(s.plan)); assert.equal(u.searchParams.get('limit'), '2')
    return Response.json(s.trades === 'missing' ? [] : [{ orderUid: s.trades === 'wrong' ? `0x${'aa'.repeat(56)}` : cowOrderUid(s.plan), owner, sellToken, buyToken, txHash }])
  }
  s.prepare = async () => {
    s.plan = await prepareAgentTrade('NVDAon', side, amount, owner, credentials)
    return s.plan
  }
  s.submit = async recovery => {
    s.signature = await signer.signTypedData(s.plan.typedData)
    return submitAgentTrade(s.plan, s.signature, credentials, recovery)
  }
  return s
}

for (const side of ['buy', 'sell']) test(`fixture: a ${side} quote uses the direct CoW route when Binance returns only another RFQ vendor`, async () => {
  const s = fixture(side), plan = await s.prepare()
  assert.equal(plan.route.source, 'cow-protocol'); assert.equal(plan.route.vendor, 'CowSwap')
  assert.equal(plan.rawAmount, s.raw.toString()); assert.equal(plan.minimumReceive, '24875000000000000')
  assert.equal(plan.route[side === 'buy' ? 'inputSymbol' : 'outputSymbol'], 'USDT')
  validateAgentTradePlan({ ...plan, planToken: 'fixture-sealed-ticket' }, { symbol: 'NVDAon', side, amount: '5', walletAddress: owner })
  assert.equal(s.calls.some(call => call.path.endsWith('/orders')), false, 'quoting neither signs nor submits')
})

test('fixture: Binance minimums do not become a universal minimum or increase a one-USDT fallback trade', async () => {
  const s = fixture('buy', '1'); s.binance = 40375
  const plan = await s.prepare()
  assert.equal(plan.route.inputAmount, '1'); assert.equal(plan.rawAmount, '1000000000000000000')
  assert.equal(s.calls.filter(call => call.host === 'api.cow.fi').length, 1)
})

test('fallback never bypasses provider access, market-closed, configuration or malformed response errors', async () => {
  for (const failure of [40304, 40367, 40369, 40462, 'auth']) {
    const s = fixture(); s.binance = failure
    await assert.rejects(s.prepare)
    assert.equal(s.calls.some(call => call.host === 'api.cow.fi'), false)
  }
})

test('direct quotes reject changed tokens, receiver, signer, spend, fee, hidden app data, schema and expired fee', async () => {
  for (const mutate of [value => value.from = COW_RELAYER, value => value.quote.receiver = COW_RELAYER,
    value => value.quote.buyToken = BSC_USDT.address, value => value.quote.sellToken = COW_SETTLEMENT,
    value => value.quote.sellAmount = '999999999999999999999', value => value.quote.feeAmount = '999999999999999999999',
    value => value.quote.partiallyFillable = true, value => value.quote.kind = 'buy', value => value.quote.sellTokenBalance = 'internal',
    value => value.quote.appData = `0x${'ab'.repeat(32)}`, value => value.quote.signingScheme = 'ethsign',
    value => value.id = 1.5, value => value.expiration = new Date(Date.now() - 1000).toISOString(),
    value => value.quote.validTo = Math.floor(Date.now() / 1000) + 1800]) {
    const s = fixture(); s.quoteMutation = mutate
    await assert.rejects(s.prepare, /invalid_provider_response|invalid_order_payload/)
    assert.equal(s.calls.some(call => call.path.endsWith('/orders')), false)
  }
})

test('cancelled direct fallback quotes stop without a plan, signature or submission', async () => {
  const s = fixture(), cancel = new AbortController(); s.cancelledQuote = true
  const pending = prepareAgentTrade('NVDAon', 'buy', '5', owner, credentials, cancel.signal)
  while (!s.calls.some(call => call.host === 'api.cow.fi')) await new Promise(resolve => setImmediate(resolve))
  cancel.abort()
  await assert.rejects(pending)
  assert.equal(s.calls.some(call => call.path.endsWith('/orders')), false)
})

test('reviewed direct orders submit the verified signature and deterministic UID exactly once', async () => {
  const s = fixture(); await s.prepare()
  const wrong = privateKeyToAccount(`0x${'22'.repeat(32)}`)
  const wrongSignature = await wrong.signTypedData(s.plan.typedData)
  await assert.rejects(() => submitAgentTrade(s.plan, wrongSignature, credentials), /invalid_order_signature/)
  const submitted = await s.submit()
  assert.equal(submitted.orderId, cowOrderUid(s.plan)); assert.equal(submitted.status, 'PENDING_VENDOR'); assert.equal(submitted.txHash, null)
  assert.equal(s.calls.filter(call => call.path.endsWith('/orders')).length, 1)
})

test('lost acknowledgement recovers the same direct order after expiry without spending or submitting again', async t => {
  const s = fixture(); await s.prepare(); s.acknowledged = false
  let starts = 0
  await assert.rejects(() => s.submit({ started: false, orderId: null, beforeDispatch: async () => { starts++ } }), /submission_unknown/)
  const uid = cowOrderUid(s.plan), elapsed = Date.now() + 180_000
  s.balance = 0n; s.allowance = 0n
  t.mock.method(Date, 'now', () => elapsed)
  const recovered = await s.submit({ started: true, orderId: null, beforeDispatch: async () => { starts++ } })
  assert.equal(recovered.orderId, uid); assert.equal(s.calls.filter(call => call.path.endsWith('/orders')).length, 1)
})

test('a duplicate order is recovered only by its exact UID, while a mismatched acknowledgement stays unknown', async () => {
  const s = fixture(); await s.prepare(); s.duplicate = true
  assert.equal((await s.submit()).orderId, cowOrderUid(s.plan))
  s.duplicate = false; s.badUid = true
  await assert.rejects(s.submit, /submission_unknown/)
})

test('direct fill requires its own trade, a matching on-chain receipt and two confirmations', async () => {
  const s = fixture(); await s.prepare(); const submitted = await s.submit()
  const check = () => checkAgentOrder(submitted.orderId, s.plan, credentials)
  assert.equal((await check()).status, 'PENDING_VENDOR')
  s.status = 'fulfilled'; s.trades = 'missing'; assert.equal((await check()).status, 'CONFIRMING')
  s.trades = 'wrong'; await assert.rejects(check, /settlement_not_verified/)
  s.trades = 'valid'; s.mined = false; assert.equal((await check()).status, 'CONFIRMING')
  s.mined = true; s.confirmations = 1; assert.equal((await check()).status, 'CONFIRMING')
  s.confirmations = 2; s.mismatch = true; await assert.rejects(check, /settlement_not_verified/)
  s.mismatch = false
  const filled = await check()
  assert.equal(filled.status, 'FILLED'); assert.equal(filled.txHash, txHash); assert.equal(filled.inputAmount, '5'); assert.equal(filled.outputAmount, '0.025')
})

test('direct quote construction remains read-only and fresh across repeated calls', async () => {
  const s = fixture()
  await getCowTrade('NVDAon', 'buy', '5', owner)
  await getCowTrade('NVDAon', 'buy', '5', owner)
  assert.equal(s.calls.filter(call => call.path.endsWith('/quote')).length, 2)
  assert.equal(s.calls.some(call => call.path.endsWith('/orders')), false)
})
