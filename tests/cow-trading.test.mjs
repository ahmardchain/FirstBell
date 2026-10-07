import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { privateKeyToAccount } from 'viem/accounts'
import { concatHex, encodeAbiParameters, encodeEventTopics, erc20Abi, hashStruct, hashTypedData, keccak256 } from 'viem'
import { exportSPKI, generateKeyPair, SignJWT } from 'jose'
import { handleApiRequest } from '../worker/router.ts'
import { BSC_USDT } from '../lib/funding.ts'
import { tokenAddresses } from '../lib/asset-catalog.ts'
import { COW_SETTLEMENT, COW_RELAYER, validateAgentTradePlan } from '../lib/agent-trading.ts'
import { clearTradingMetadataCache, tradingClient } from '../worker/binance-trading.ts'
import { prepareAgentTrade, submitAgentTrade, checkAgentOrder, recoverAgentTrade, cancelAgentOrder, sealTradeTicket } from '../worker/agent-trading.ts'
import { cowCancellationTypedData } from '../lib/order-cancellation.ts'
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
    balance: 10n ** 20n, allowance: 10n ** 20n, quoteMutation: null, quoteRejection: null, binanceMode: 'RFQ', status: 'open', acknowledged: true,
    stored: null, plan: null, badUid: false, duplicate: false, rejection: null, trades: 'valid', confirmations: 2, mismatch: false, mined: true, cancelledQuote: false,
    cancelOutcome: 'cancelled', cancelError: null, cancelUnknown: false, cancelStatusUnknown: false }
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
      return Response.json(envelope(s.binance === 'empty' ? [] : [{ quoteId: 'fixture-pcs', vendorName: 'PcsXRfq', executionMode: s.binanceMode, binanceChainId: '56',
        fromTokenAmount: s.raw.toString(), toTokenAmount: s.output.toString(), fromToken: { tokenContractAddress: sellToken, decimal: '18' }, toToken: { tokenContractAddress: buyToken, decimal: '18' } }]))
    }
    assert.equal(u.hostname, 'api.cow.fi')
    assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store')
    assert.equal(Object.values(init.headers).some(value => String(value).includes(credentials.secretKey)), false)
    if (u.pathname.endsWith('/quote')) {
      assert.equal(body.sellToken.toLowerCase(), sellToken.toLowerCase()); assert.equal(body.buyToken.toLowerCase(), buyToken.toLowerCase())
      assert.equal(body.sellAmountBeforeFee, s.raw.toString()); assert.equal(body.from, owner); assert.equal(body.receiver, owner)
      assert.equal(body.appData, '{}'); assert.equal(body.validFor, 120); assert.equal(body.signingScheme, 'eip712')
      if (s.quoteRejection) return Response.json({ errorType: s.quoteRejection, description: 'private fixture' }, { status: 400 })
      if (s.cancelledQuote) return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
      const value = { id: 123, from: owner, expiration: new Date(Date.now() + 120_000).toISOString(), quote: { sellToken, buyToken, receiver: owner,
        sellAmount: (s.raw - s.fee).toString(), buyAmount: s.output.toString(), feeAmount: s.fee.toString(), validTo: Math.floor(Date.now() / 1000) + 120,
        appData: '{}', kind: 'sell', partiallyFillable: false, sellTokenBalance: 'erc20', buyTokenBalance: 'erc20', signingScheme: 'eip712' } }
      s.quoteMutation?.(value)
      return Response.json(value)
    }
    if (u.pathname.endsWith('/orders')) {
      if (init.method === 'DELETE') {
        assert.deepEqual(body.orderUids, [cowOrderUid(s.plan)]); assert.equal(body.signingScheme, 'eip712')
        assert.match(body.signature, /^0x[a-fA-F0-9]{130}$/)
        if (s.cancelError) { s.status = s.cancelOutcome; return Response.json({ errorType: s.cancelError, description: 'redacted fixture' }, { status: 400 }) }
        s.status = s.cancelOutcome
        if (s.cancelUnknown) throw new Error('fixture lost cancellation acknowledgement')
        return side === 'sell' ? new Response(null, { status: 200 }) : Response.json('Cancelled')
      }
      // Current CoW orderbook rejects the quote's legacy fee in signed orders.
      if (body.feeAmount !== '0') return Response.json({ errorType: 'NonZeroFee', description: 'Fee must be zero' }, { status: 400 })
      assert.equal(body.from, owner); assert.equal(body.quoteId, 123); assert.equal(body.appData, '{}')
      assert.equal(body.appDataHash, s.plan.typedData.message.appData); assert.equal(body.signature, s.signature)
      assert.equal(body.sellAmount, s.raw.toString()); assert.equal(body.buyAmount, s.plan.minimumReceive)
      if (s.rejection) return Response.json({ errorType: s.rejection.type, description: `private ${credentials.secretKey} ${owner} ${body.signature}` }, { status: s.rejection.status })
      s.stored = order()
      if (!s.acknowledged) throw new Error('fixture lost acknowledgement after acceptance')
      if (s.duplicate) return Response.json({ errorType: 'DuplicatedOrder' }, { status: 400 })
      return Response.json(s.badUid ? `0x${'aa'.repeat(56)}` : cowOrderUid(s.plan))
    }
    if (u.pathname.includes('/orders/')) {
      if (s.cancelStatusUnknown && s.calls.some(call => call.method === 'DELETE')) throw new Error('fixture status unavailable')
      return s.stored ? Response.json(order()) : new Response('', { status: 404 })
    }
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
  assert.equal(plan.typedData.message.sellAmount, s.raw.toString()); assert.equal(plan.typedData.message.feeAmount, '0')
  assert.equal(plan.feeAmount, '0'); assert.equal(plan.estimatedFeeAmount, s.fee.toString())
  assert.equal(plan.route[side === 'buy' ? 'inputSymbol' : 'outputSymbol'], 'USDT')
  validateAgentTradePlan({ ...plan, planToken: 'fixture-sealed-ticket' }, { symbol: 'NVDAon', side, amount: '5', walletAddress: owner })
  for (const estimatedFeeAmount of ['-1', '00', '1.5', s.raw.toString(), (s.raw + 1n).toString()]) {
    assert.throws(() => validateAgentTradePlan({ ...plan, estimatedFeeAmount, planToken: 'fixture-sealed-ticket' }, { symbol: 'NVDAon', side, amount: '5', walletAddress: owner }), /invalid_order_payload/)
  }
  assert.equal(s.calls.some(call => call.path.endsWith('/orders')), false, 'quoting neither signs nor submits')
})

test('fixture: Binance minimums do not become a universal minimum or increase a one-USDT fallback trade', async () => {
  const s = fixture('buy', '1'); s.binance = 40375
  const plan = await s.prepare()
  assert.equal(plan.route.inputAmount, '1'); assert.equal(plan.rawAmount, '1000000000000000000')
  assert.equal(s.calls.filter(call => call.host === 'api.cow.fi').length, 1)
})

test('a Binance SWAP quote can still use the existing safe CoW fallback without broadcasting a raw swap', async () => {
  const s = fixture('buy', '1'); s.binanceMode = 'SWAP'
  const plan = await s.prepare()
  assert.equal(plan.route.source, 'cow-protocol'); assert.equal(plan.route.executionMode, 'RFQ')
  assert.equal(plan.rawAmount, '1000000000000000000')
  assert.equal(s.calls.some(call => call.path.endsWith('/swap') || call.path.endsWith('/orders')), false)
})

test('failed fallback preserves unsupported execution, and empty quotes expose liquidity or token failures', async () => {
  for (const [mode, binance, rejection, reason] of [
    ['SWAP', 'other-vendor', 'NoLiquidity', 'unsupported_execution_mode'],
    ['SWAP', 'other-vendor', 'UnsupportedToken', 'unsupported_execution_mode'],
    ['RFQ', 'other-vendor', 'NoLiquidity', 'unsupported_route_vendor'],
    ['RFQ', 'empty', 'NoLiquidity', 'liquidity_unavailable'],
    ['RFQ', 'empty', 'UnsupportedToken', 'token_unavailable'],
    ['SWAP', 'other-vendor', 'InvalidQuote', 'stale_quote'],
  ]) {
    const s = fixture(); s.binanceMode = mode; s.binance = binance; s.quoteRejection = rejection
    await assert.rejects(s.prepare, error => error.reason === reason)
    assert.equal(s.calls.filter(call => call.host === 'api.cow.fi').length, 1)
    assert.equal(s.calls.some(call => call.path.endsWith('/orders')), false)
  }
})

test('provider liquidity codes retain the direct fallback without changing the requested amount', async () => {
  for (const code of [40374, 40421, 40441]) {
    const s = fixture('buy', '1'); s.binance = code
    const plan = await s.prepare()
    assert.equal(plan.rawAmount, '1000000000000000000')
    assert.equal(plan.route.source, 'cow-protocol')
  }
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
    value => value.quote.sellAmount = '0', value => value.quote.sellAmount = '00', value => value.quote.feeAmount = '-1',
    value => value.quote.feeAmount = '00', value => value.quote.feeAmount = '1.5',
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

test('an old nonzero-fee signature is checked by exact UID but never rewritten or resubmitted', async () => {
  const s = fixture(); await s.prepare()
  s.plan.typedData.message.sellAmount = (s.raw - s.fee).toString()
  s.plan.typedData.message.feeAmount = s.fee.toString()
  s.plan.feeAmount = s.fee.toString(); delete s.plan.estimatedFeeAmount
  s.plan.typedDataHash = hashTypedData(s.plan.typedData)
  const original = structuredClone(s.plan)
  await assert.rejects(() => s.submit({ started: true, orderId: null, beforeDispatch: async () => {} }), /order_fee_changed/)
  assert.deepEqual(s.plan, original)
  assert.equal(s.calls.filter(call => call.path.includes('/orders/')).length, 1)
  assert.equal(s.calls.some(call => call.path.endsWith('/orders')), false)
  s.stored = {}; s.balance = 0n; s.allowance = 0n
  assert.equal((await s.submit({ started: true, orderId: null, beforeDispatch: async () => {} })).orderId, cowOrderUid(original))
  assert.deepEqual(s.plan, original)
  assert.equal(s.calls.some(call => call.path.endsWith('/orders')), false)
  const recovered = await recoverAgentTrade(s.plan, s.signature, credentials, { started: true, orderId: null })
  assert.equal(recovered.status, 'PENDING_VENDOR')
})

test('CoW rejections expose only known error types, while write failures remain unknown', async t => {
  const warnings = []
  t.mock.method(console, 'warn', (...args) => warnings.push(args))
  for (const [type, status, reason] of [
    ['NonZeroFee', 400, 'order_fee_changed'], ['QuoteNotFound', 400, 'stale_quote'], ['InvalidQuote', 400, 'stale_quote'],
    ['InsufficientValidTo', 400, 'stale_quote'], ['WrongOwner', 400, 'invalid_order_signature'], ['InvalidSignature', 400, 'invalid_order_signature'],
    ['InvalidAppData', 400, 'invalid_order_payload'], ['AppDataHashMismatch', 400, 'invalid_order_payload'],
    ['UnsupportedToken', 400, 'token_unavailable'], ['InsufficientBalance', 400, 'insufficient_balance'], ['InsufficientAllowance', 400, 'approval_required'],
    [`private-${credentials.secretKey}`, 400, 'provider_error'], ['NonZeroFee', 503, 'submission_unknown'], ['DuplicatedOrder', 503, 'submission_unknown'],
  ]) {
    const s = fixture(); await s.prepare(); s.rejection = { type, status }
    await assert.rejects(s.submit, new RegExp(reason))
    const last = warnings.at(-1)
    assert.equal(last[0], 'TRADE_COW_REJECTION'); assert.equal(last[1].stage, 'submit'); assert.equal(last[1].httpStatus, status)
    assert.equal(last[1].errorType, type.startsWith('private-') ? 'Other' : type)
    assert.equal(Object.hasOwn(last[1], 'description'), false)
    assert.equal(JSON.stringify(last).includes(credentials.secretKey), false)
    assert.equal(JSON.stringify(last).includes(owner), false)
    assert.equal(JSON.stringify(last).includes(s.signature), false)
    assert.equal(s.stored, null)
  }
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

test('read-only reconciliation finds an expired signed order by its exact UID without another dispatch', async t => {
  const s = fixture(); await s.prepare(); s.acknowledged = false
  await assert.rejects(s.submit, /submission_unknown/)
  const elapsed = Date.now() + 180_000
  t.mock.method(Date, 'now', () => elapsed)
  s.balance = 0n; s.allowance = 0n; s.status = 'fulfilled'
  const recovered = await recoverAgentTrade(s.plan, s.signature, credentials, { started: true, orderId: null })
  assert.equal(recovered.orderId, cowOrderUid(s.plan)); assert.equal(recovered.status, 'FILLED')
  assert.equal(s.calls.filter(call => call.path.endsWith('/orders')).length, 1)
})

test('a missing signed order remains unknown and is never automatically submitted or marked filled', async () => {
  const s = fixture(); await s.prepare()
  const signature = await signer.signTypedData(s.plan.typedData)
  assert.equal(await recoverAgentTrade(s.plan, signature, credentials, { started: true, orderId: null }), null)
  assert.equal(s.calls.some(call => call.path.endsWith('/orders')), false)
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

test('cancellation hashing matches the published CoW model type hash, with exactly one owned UID', async () => {
  const s = fixture(), plan = await s.prepare(), uid = cowOrderUid(plan)
  const data = cowCancellationTypedData(uid, owner)
  // CoW model::order::OrderCancellations::TYPE_HASH, rather than a hash derived
  // from the application's own chosen field names (the Rust comment is stale).
  const typeHash = '0x4c89efb91ae246f78d2fe68b47db2fa1444a121a4f2dc3fda7a5a408c2e3588e'
  const expected = keccak256(concatHex([typeHash, keccak256(concatHex([keccak256(uid)]))]))
  assert.equal(hashStruct({ data: data.message, primaryType: data.primaryType, types: data.types }), expected)
  assert.deepEqual(data.message.orderUids, [uid]); assert.equal(data.domain.chainId, 56); assert.equal(data.domain.verifyingContract, COW_SETTLEMENT)
  assert.throws(() => cowCancellationTypedData(uid, `0x${'22'.repeat(20)}`), /invalid_order_payload/)
  assert.throws(() => cowCancellationTypedData('oc-o-provider-id', owner), /invalid_order_payload/)
})

for (const side of ['buy', 'sell']) test(`fixture: ${side} cancellation signs the original UID, uses DELETE and checks the actual result`, async () => {
  const s = fixture(side), plan = await s.prepare(); await s.submit()
  const before = s.calls.length, uid = cowOrderUid(plan), signature = await signer.signTypedData(cowCancellationTypedData(uid, owner))
  const result = await cancelAgentOrder(uid, plan, signature, credentials)
  assert.equal(result.status, 'CANCELLED'); assert.equal(result.txHash, null); assert.equal(result.cancellationRequested, true)
  assert.deepEqual(s.calls.slice(before).map(c => c.method), ['GET', 'DELETE', 'GET'])
  assert.deepEqual(s.calls.find(c => c.method === 'DELETE').body, { orderUids: [uid], signature, signingScheme: 'eip712' })
})

test('another signer, UID, batch, domain or original trade signature cannot cancel', async () => {
  const s = fixture(), plan = await s.prepare(); await s.submit()
  const uid = cowOrderUid(plan), before = s.calls.length, data = cowCancellationTypedData(uid, owner)
  const other = privateKeyToAccount(`0x${'22'.repeat(32)}`)
  for (const signature of [await other.signTypedData(data), await signer.signTypedData(plan.typedData),
    await signer.signTypedData({ ...data, domain: { ...data.domain, chainId: 1 } }),
    await signer.signTypedData({ ...data, message: { orderUids: [uid, uid] } })]) await assert.rejects(() => cancelAgentOrder(uid, plan, signature, credentials), /invalid_order_signature/)
  await assert.rejects(() => cancelAgentOrder(`0x${'aa'.repeat(56)}`, plan, '0x' + 'aa'.repeat(65), credentials), /invalid_order_payload/)
  await assert.rejects(() => cancelAgentOrder(uid, { ...plan, route: { ...plan.route, source: 'binance-web3' } }, '0x', credentials), /cancellation_unavailable/)
  assert.equal(s.calls.length, before)
})

test('filled, expired and already cancelled orders return their actual status without another cancellation', async () => {
  const s = fixture(), plan = await s.prepare(); await s.submit()
  const uid = cowOrderUid(plan), signature = await signer.signTypedData(cowCancellationTypedData(uid, owner))
  for (const [provider, expected] of [['fulfilled', 'FILLED'], ['expired', 'EXPIRED'], ['cancelled', 'CANCELLED']]) {
    s.status = provider
    assert.equal((await cancelAgentOrder(uid, plan, signature, credentials)).status, expected)
  }
  assert.equal(s.calls.some(c => c.method === 'DELETE'), false)
})

test('a cancellation racing settlement returns the verified fill or confirming state, never an invented cancellation', async () => {
  const s = fixture(), plan = await s.prepare(); await s.submit()
  const uid = cowOrderUid(plan), signature = await signer.signTypedData(cowCancellationTypedData(uid, owner))
  s.cancelOutcome = 'fulfilled'
  let result = await cancelAgentOrder(uid, plan, signature, credentials)
  assert.equal(result.status, 'FILLED'); assert.equal(result.inputAmount, '5'); assert.equal(result.outputAmount, '0.025')
  s.status = 'open'; s.confirmations = 1
  result = await cancelAgentOrder(uid, plan, signature, credentials)
  assert.equal(result.status, 'CONFIRMING'); assert.equal(result.inputAmount, null)
})

test('lost cancellation acknowledgements and unreadable follow-up statuses preserve an unknown outcome', async () => {
  const s = fixture(), plan = await s.prepare(); await s.submit()
  const uid = cowOrderUid(plan), signature = await signer.signTypedData(cowCancellationTypedData(uid, owner))
  s.cancelUnknown = true
  await assert.rejects(() => cancelAgentOrder(uid, plan, signature, credentials), /cancellation_unknown/)
  assert.equal((await checkAgentOrder(uid, plan, credentials)).status, 'CANCELLED')
  s.status = 'open'; s.cancelUnknown = false; s.cancelStatusUnknown = true
  // Clear previous calls so this fixture fails only after this cancellation.
  s.calls = []
  await assert.rejects(() => cancelAgentOrder(uid, plan, signature, credentials), /cancellation_unknown/)
  assert.equal(s.calls.filter(c => c.method === 'DELETE').length, 1)
})

test('a missing order is unknown, and a provider fill-race rejection is reconciled read-only', async () => {
  const s = fixture(), plan = await s.prepare(), uid = cowOrderUid(plan), signature = await signer.signTypedData(cowCancellationTypedData(uid, owner))
  await assert.rejects(() => cancelAgentOrder(uid, plan, signature, credentials), /order_not_found/)
  assert.equal(s.calls.some(c => c.method === 'DELETE'), false)
  await s.submit(); s.cancelError = 'OrderFullyExecuted'; s.cancelOutcome = 'fulfilled'
  assert.equal((await cancelAgentOrder(uid, plan, signature, credentials)).status, 'FILLED')
})

test('authenticated cancellation uses only the account-bound receipt and write limit, rejecting invalid ownership and tickets', async () => {
  const s = fixture(), plan = await s.prepare(); await s.submit()
  const uid = cowOrderUid(plan), signature = await signer.signTypedData(cowCancellationTypedData(uid, owner))
  const pair = await generateKeyPair('ES256'), app = 'fixture-cancellation-app', user = 'did:privy:canceltest'
  const identity = await new SignJWT({ linked_accounts: JSON.stringify([{ type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: owner }]) })
    .setProtectedHeader({ alg: 'ES256' }).setSubject(user).setIssuer('privy.io').setAudience(app).setExpirationTime('1h').sign(pair.privateKey)
  let allowed = true, lastRatePath
  const env = { PRIVY_APP_ID: app, PRIVY_VERIFICATION_KEY: await exportSPKI(pair.publicKey), BINANCE_WEB3_API_KEY: credentials.apiKey, BINANCE_WEB3_SECRET_KEY: credentials.secretKey,
    ACCOUNTS: { idFromName: id => id, get: () => ({ fetch: async req => { lastRatePath = new URL(req.url).pathname; return Response.json({ allowed }, { status: allowed ? 200 : 429 }) } }) } }
  const receiptToken = await sealTradeTicket({ plan, orderId: uid }, user, credentials.secretKey, 'receipt')
  const call = (body = {}, headers = {}) => handleApiRequest(new Request('https://firstbell.test/api/trade/cancel', { method: 'POST',
    headers: { Origin: 'https://firstbell.test', 'Content-Type': 'application/json', Authorization: `Bearer ${identity}`, 'privy-id-token': identity, ...headers },
    body: JSON.stringify({ walletAddress: owner, receiptToken, signature, orderId: 'ignored-client-id', ...body }) }), env)
  assert.equal((await call({}, { Authorization: '' })).status, 401)
  assert.equal((await call({}, { Origin: 'https://attacker.test' })).status, 403)
  assert.equal((await call({ walletAddress: `0x${'22'.repeat(20)}` })).status, 403)
  assert.equal((await call({ receiptToken: await sealTradeTicket({ plan, orderId: uid }, 'did:privy:other', credentials.secretKey, 'receipt') })).status, 403)
  const key = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`firstbell-agent-orders-v1:${credentials.secretKey}`)))
  const expired = await new SignJWT({ plan, orderId: uid, kind: 'receipt' }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer('firstbell-agent')
    .setAudience('firstbell-receipt').setSubject(user).setIssuedAt(Math.floor(Date.now()/1000)-200).setExpirationTime(Math.floor(Date.now()/1000)-100).sign(key)
  assert.equal((await call({ receiptToken: expired })).status, 403)
  allowed = false; assert.equal((await call()).status, 429)
  assert.equal(s.calls.some(c => c.method === 'DELETE'), false)
  allowed = true; const response = await call(); assert.equal(response.status, 200); assert.equal(lastRatePath, '/trade-write-rate')
  const result = (await response.json()).order
  assert.equal(result.orderId, uid); assert.equal(result.status, 'CANCELLED'); assert.equal(result.canCancel, false)
  assert.equal(result.trade.symbol, 'NVDAon'); assert.equal(result.trade.amount, '5'); assert.equal(result.trade.inputSymbol, 'USDT')
  assert.equal(s.calls.filter(c => c.method === 'DELETE').length, 1)
})
