import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { exportSPKI, generateKeyPair, SignJWT } from 'jose'
import { after, beforeEach, test } from 'node:test'
import { privateKeyToAccount } from 'viem/accounts'
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, erc20Abi, hashTypedData } from 'viem'
import { fractionOfQuantity, parseAgentIntent } from '../lib/agent-intent.ts'
import { COW_ORDER_FIELDS, COW_RELAYER, COW_SETTLEMENT, validateAgentTradePlan, validateOrderTypedData } from '../lib/agent-trading.ts'
import { prepareAgentTrade, submitAgentTrade, checkAgentOrder, recoverAgentTrade, sealTradeTicket, openTradeTicket, handleAgentTrade } from '../worker/agent-trading.ts'
import { handleApiRequest } from '../worker/router.ts'
import { clearTradingMetadataCache } from '../worker/binance-trading.ts'
import { BSC_USDT } from '../lib/funding.ts'
import { tokenAddresses } from '../lib/asset-catalog.ts'
import { handleAccountRequest } from '../worker/account-store.ts'

const originalFetch = globalThis.fetch
after(() => { globalThis.fetch = originalFetch })
beforeEach(() => clearTradingMetadataCache())
// Public, unfunded test signer; all provider and RPC calls below are fixtures.
const signer = privateKeyToAccount(`0x${'11'.repeat(32)}`), wallet = signer.address
const credentials = { apiKey: 'fixture-key', secretKey: 'fixture-secret' }
const amount = '5000000000000000000', output = '25000000000000000', txHash = `0x${'ab'.repeat(32)}`
const now = () => Math.floor(Date.now() / 1000)
const typed = () => ({ domain: { name: 'Gnosis Protocol', version: 'v2', chainId: 56, verifyingContract: COW_SETTLEMENT }, types: { Order: COW_ORDER_FIELDS.map(field => ({ ...field })) }, primaryType: 'Order', message: {
  sellToken: tradeSide === 'buy' ? BSC_USDT.address : tokenAddresses.NVDAon, buyToken: tradeSide === 'buy' ? tokenAddresses.NVDAon : BSC_USDT.address, receiver: wallet, sellAmount: amount, buyAmount: output, validTo: now() + 600,
  appData: `0x${'00'.repeat(32)}`, feeAmount: '0', kind: 'sell', partiallyFillable: false, sellTokenBalance: 'erc20', buyTokenBalance: 'erc20',
} })
const envelope = data => ({ code: 0, success: true, timestamp: Date.now(), data })
const token = address => ({ tokenContractAddress: address, decimal: '18' })
const route = () => ({ quoteId: 'route-id', vendorName: 'CowSwap', binanceChainId: '56', executionMode: 'RFQ', fromTokenAmount: amount, toTokenAmount: output,
  fromToken: token(tradeSide === 'buy' ? BSC_USDT.address : tokenAddresses.NVDAon), toToken: token(tradeSide === 'buy' ? tokenAddresses.NVDAon : BSC_USDT.address), approveTarget: COW_RELAYER })
let calls, allowance, balance, orderState, confirmations, typedOverride, simulationState, receiptMismatch, tradeSide
const log = (address, from, to, value, index) => ({ address, data: encodeAbiParameters([{ type: 'uint256' }], [value]), topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from, to } }),
  blockHash: `0x${'bc'.repeat(32)}`, blockNumber: '0x64', transactionHash: txHash, transactionIndex: '0x0', logIndex: `0x${index}`, removed: false })
const receipt = () => ({ transactionHash: txHash, transactionIndex: '0x0', blockHash: `0x${'bc'.repeat(32)}`, blockNumber: '0x64', from: wallet, to: COW_SETTLEMENT,
  cumulativeGasUsed: '0x5208', gasUsed: '0x5208', effectiveGasPrice: '0x1', contractAddress: null, logsBloom: `0x${'00'.repeat(256)}`, status: '0x1', type: '0x0', logs: [
    log(BSC_USDT.address, wallet, COW_RELAYER, BigInt(amount), 0), log(tokenAddresses.NVDAon, COW_SETTLEMENT, wallet, receiptMismatch ? 1n : BigInt(output), 1),
  ] })
function mock(side = 'buy') {
  tradeSide = side
  calls = []; allowance = BigInt(amount); balance = BigInt(amount); orderState = 'PENDING_VENDOR'; confirmations = 2; typedOverride = null; simulationState = 'SUCCESS'; receiptMismatch = false
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    if (parsed.hostname === 'api.cow.fi' && parsed.pathname.includes('/orders/')) return new Response('', { status: 404 })
    if (parsed.hostname === 'bsc-dataseed.bnbchain.org') {
      const input = JSON.parse(options.body)
      const rpc = input => {
        let result
        if (input.method === 'eth_chainId') result = '0x38'
        else if (input.method === 'eth_getBalance') result = '0xde0b6b3a7640000'
        else if (input.method === 'eth_gasPrice') result = '0x3b9aca00'
        else if (input.method === 'eth_estimateGas') result = '0x186a0'
        else if (input.method === 'eth_blockNumber') result = confirmations > 1 ? '0x65' : '0x64'
        else if (input.method === 'eth_getTransactionReceipt') result = receipt()
        else if (input.method === 'eth_call') {
          const decoded = decodeFunctionData({ abi: erc20Abi, data: input.params[0].data })
          result = `0x${(decoded.functionName === 'decimals' ? 18n : decoded.functionName === 'allowance' ? allowance : balance).toString(16).padStart(64, '0')}`
        } else throw new Error(`Unexpected RPC ${input.method}`)
        return { jsonrpc: '2.0', id: input.id, result }
      }
      return Response.json(Array.isArray(input) ? input.map(rpc) : rpc(input))
    }
    assert.equal(parsed.hostname, 'web3.binance.com')
    assert.equal(options.headers['X-OC-SIGN'], createHmac('sha256', credentials.secretKey).update(options.headers['X-OC-TIMESTAMP'] + options.method + parsed.pathname + parsed.search + (options.body ?? '')).digest('base64'))
    calls.push({ method: options.method, path: parsed.pathname, body: options.body ? JSON.parse(options.body) : null })
    if (parsed.pathname.endsWith('/supported/chain')) return Response.json(envelope([{ binanceChainId: '56' }]))
    if (parsed.pathname.endsWith('/quote')) return Response.json(envelope([route()]))
    if (parsed.pathname.endsWith('/swap')) {
      assert.equal(parsed.searchParams.get('quoteId'), 'route-id')
      return Response.json(envelope({ executionMode: 'RFQ', routerResult: route(), rfq: { vendor: 'CowSwap', orderId: 'vendor-order-id', signingScheme: 'EIP712', typedDataToSign: typedOverride ?? JSON.stringify(typed()) } }))
    }
    if (parsed.pathname.endsWith('/simulate')) return Response.json(envelope({ status: simulationState }))
    if (parsed.pathname.endsWith('/order/submit')) return Response.json(envelope({ orderId: 'oc-o-fixture', status: 'PENDING_VENDOR' }))
    if (parsed.pathname.endsWith('/order/oc-o-fixture')) return Response.json(envelope({ orderId: 'oc-o-fixture', status: orderState, txHash: orderState === 'FILLED' ? txHash : null }))
    throw new Error(`Unexpected provider endpoint ${parsed.pathname}`)
  }
}
test('plain-language requests bind one catalog token, explicit spend, or a precise wallet fraction', () => {
  assert.deepEqual(parseAgentIntent('Buy $10 of Nvidia'), { kind: 'trade', symbol: 'NVDAon', side: 'buy', amount: '10', fraction: null, quoteOnly: false })
  assert.equal(parseAgentIntent('Buy AAPL with 1,000 USDT').amount, '1000')
  assert.equal(parseAgentIntent('Sell 0.1 TSLAon for USDT').amount, '0.1')
  assert.equal(parseAgentIntent('Sell half my Tesla').fraction, 'half'); assert.equal(parseAgentIntent('Sell all my Nvidia').fraction, 'all')
  assert.equal(parseAgentIntent('用 10 USDT 买入 NVDAon').symbol, 'NVDAon'); assert.equal(parseAgentIntent('卖出一半特斯拉').fraction, 'half')
  assert.equal(parseAgentIntent('Buy $10 Nvidia, quote only').quoteOnly, true)
  assert.equal(parseAgentIntent('Show my balance').kind, 'balance'); assert.equal(parseAgentIntent('Check order status').kind, 'status')
  assert.equal(fractionOfQuantity('0.123456789012345679', 'half'), '0.061728394506172839'); assert.equal(fractionOfQuantity('100.00', 'half'), '50')
  assert.throws(() => fractionOfQuantity('0', 'all'), /insufficient_balance/)
})
test('ambiguous, negated, conditional, unknown and transfer requests never become immediate trades', () => {
  for (const prompt of ['Do not buy $5 Nvidia', 'Should I buy 5 Nvidia?', 'If Nvidia falls buy $10 NVDA', 'Buy Nvidia daily for $10', 'Buy $10 NVDAon and Tesla',
    'Buy $10 of anunknownstock', 'Sell $10 of Tesla', 'Buy -10 Nvidia', 'Buy $0 Nvidia', 'Buy 1e5 Nvidia', 'Buy 1,50 Nvidia', 'Buy all my Nvidia', 'Buy 10 Nvidia then transfer to 0x123456789', 'Buy 5 shares of Apple', 'Buy 10 USDC of Nvidia', 'Buy €10 Nvidia', 'Buy 10 Nvidia tokens'])
    assert.equal(parseAgentIntent(prompt).kind, 'help', prompt)
})
test('preparation checks live-wallet balances and exact BSC CoW order without submitting', async () => {
  mock(); const prepared = await prepareAgentTrade('NVDAon', 'buy', '5', wallet, credentials)
  assert.equal(prepared.approval, null); assert.equal(prepared.orderQuoteId, 'vendor-order-id'); assert.equal(prepared.typedDataHash, hashTypedData(prepared.typedData))
  assert.equal(calls.some(call => call.path.endsWith('/order/submit')), false)
  assert.equal(validateAgentTradePlan({ ...prepared, planToken: 'fixture-ticket' }, { symbol: 'NVDAon', side: 'buy', amount: '5', walletAddress: wallet }).rawAmount, amount)
  const reorderedFields = structuredClone(prepared.typedData)
  reorderedFields.types.Order = reorderedFields.types.Order.map(({ name, type }) => ({ type, name }))
  assert.equal(hashTypedData(validateOrderTypedData(reorderedFields, prepared)), prepared.typedDataHash, 'JSON property order cannot reject the same EIP-712 schema')
  balance = 1n; await assert.rejects(() => prepareAgentTrade('NVDAon', 'buy', '5', wallet, credentials), /insufficient_balance/)
  balance = BigInt(amount); typedOverride = '0x1901deadbeef'; await assert.rejects(() => prepareAgentTrade('NVDAon', 'buy', '5', wallet, credentials), /unsupported_order_schema/)
})
test('order validation rejects unsafe schema, chain, recipient, spend and receive values', async () => {
  mock(); const prepared = await prepareAgentTrade('NVDAon', 'buy', '5', wallet, credentials)
  for (const mutate of [data => data.domain.chainId = 97, data => data.domain.verifyingContract = wallet, data => data.message.receiver = COW_RELAYER,
    data => data.message.sellAmount = '10000000000000000000', data => data.message.buyAmount = '1', data => data.message.partiallyFillable = true,
    data => data.primaryType = 'Permit', data => data.message.extra = 'unexpected', data => data.types.Order[0].type = 'bytes32', data => data.message.sellToken = COW_SETTLEMENT, data => data.message.validTo = now() - 1]) {
    const data = structuredClone(prepared.typedData); mutate(data); assert.throws(() => validateOrderTypedData(data, prepared), /unsupported_order_schema|invalid_order_payload/)
  }
})
test('approval is simulated and capped to this spend and pinned relayer; reset permission is separate', async () => {
  mock(); allowance = 0n; const prepared = await prepareAgentTrade('NVDAon', 'buy', '5', wallet, credentials)
  const decoded = decodeFunctionData({ abi: erc20Abi, data: prepared.approval.data })
  assert.equal(decoded.functionName, 'approve'); assert.equal(decoded.args[0].toLowerCase(), COW_RELAYER.toLowerCase()); assert.equal(decoded.args[1], BigInt(amount))
  assert.equal(prepared.approval.simulated, true); assert.equal(calls.find(call => call.path.endsWith('/simulate')).body.evmTx.to, BSC_USDT.address)
  assert.equal(calls.some(call => call.path.endsWith('/order/submit')), false)
  await assert.rejects(async () => submitAgentTrade(prepared, await signer.signTypedData(prepared.typedData), credentials), /approval_required/)
  allowance = 1n; const reset = await prepareAgentTrade('NVDAon', 'buy', '5', wallet, credentials); assert.equal(reset.approval.reset, true); assert.equal(reset.approval.amount, '0')
  simulationState = 'FAILED'; await assert.rejects(() => prepareAgentTrade('NVDAon', 'buy', '5', wallet, credentials), /simulation_failed/)
})

test('approval simulation starts while the unsigned RFQ build is still pending', { timeout: 1500 }, async () => {
  mock(); allowance = 0n
  const fixtureFetch = globalThis.fetch
  let release, simulationStarted
  const buildGate = new Promise(resolve => { release = resolve })
  const simulationGate = new Promise(resolve => { simulationStarted = resolve })
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname
    if (path.endsWith('/swap')) await buildGate
    if (path.endsWith('/simulate')) simulationStarted()
    return fixtureFetch(url, options)
  }
  const pending = prepareAgentTrade('NVDAon', 'buy', '5', wallet, credentials)
  try {
    await simulationGate
    release()
    const prepared = await pending
    assert.equal(prepared.approval.simulated, true)
    assert.equal(prepared.orderQuoteId, 'vendor-order-id')
    assert.equal(calls.some(call => call.path.endsWith('/order/submit')), false)
  } finally { release() }
})

for (const side of ['buy', 'sell']) test(`${side} approval checks finish while the provider quote is still pending`, { timeout: 1500 }, async () => {
  mock(side); allowance = 0n
  const fixtureFetch = globalThis.fetch
  let release, simulated, completed = false
  const quoteGate = new Promise(resolve => { release = resolve })
  const simulationGate = new Promise(resolve => { simulated = resolve })
  globalThis.fetch = async (url, options) => {
    const path = new URL(url).pathname
    if (path.endsWith('/quote')) await quoteGate
    const response = await fixtureFetch(url, options)
    if (path.endsWith('/simulate')) simulated()
    return response
  }
  const pending = prepareAgentTrade('NVDAon', side, '5', wallet, credentials).then(plan => { completed = true; return plan })
  try {
    await simulationGate
    assert.equal(completed, false, 'a permission check alone cannot authorize a trade')
    assert.equal(calls.some(call => call.path.endsWith('/swap')), false, 'order build still awaits a fresh quote')
    release()
    const prepared = await pending
    assert.equal(prepared.approval.to, side === 'buy' ? BSC_USDT.address : tokenAddresses.NVDAon)
    assert.equal(prepared.approval.amount, amount)
    assert.equal(validateAgentTradePlan({ ...prepared, planToken: 'fixture-ticket' }, { symbol: 'NVDAon', side, amount: '5', walletAddress: wallet }).rawAmount, amount)
    assert.equal(calls.some(call => call.path.endsWith('/order/submit')), false)
  } finally { release() }
})

test('completed early approval checks cannot bypass an invalid order build', async () => {
  mock(); allowance = 0n
  typedOverride = { ...typed(), domain: { ...typed().domain, chainId: 97 } }
  await assert.rejects(() => prepareAgentTrade('NVDAon', 'buy', '5', wallet, credentials), /unsupported_order_schema|invalid_order_payload/)
  assert.equal(calls.some(call => call.path.endsWith('/order/submit')), false)
})

test('an unfunded wallet stops preparation without waiting for a stalled quote', { timeout: 1500 }, async () => {
  mock(); balance = 0n
  const fixtureFetch = globalThis.fetch
  let quoteStarted, aborted = false
  const quoteGate = new Promise(resolve => { quoteStarted = resolve })
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    if (parsed.pathname.endsWith('/quote')) {
      quoteStarted()
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => { aborted = true; reject(options.signal.reason) }, { once: true })
      })
    }
    if (parsed.hostname === 'bsc-dataseed.bnbchain.org') {
      const input = JSON.parse(options.body)
      const requests = Array.isArray(input) ? input : [input]
      if (requests.some(item => item.method === 'eth_call' && decodeFunctionData({ abi: erc20Abi, data: item.params[0].data }).functionName === 'balanceOf')) await quoteGate
    }
    return fixtureFetch(url, options)
  }
  await assert.rejects(() => prepareAgentTrade('NVDAon', 'buy', '5', wallet, credentials), /insufficient_balance/)
  assert.equal(aborted, true)
  assert.equal(calls.some(call => /\/swap$|\/simulate$|\/order\/submit$/.test(call.path)), false)
})
test('signed tickets reject account changes, tampering and cross-use', async () => {
  const ticket = await sealTradeTicket({ plan: { walletAddress: wallet } }, 'did:privy:fixture123', credentials.secretKey, 'plan')
  assert.equal((await openTradeTicket(ticket, 'did:privy:fixture123', credentials.secretKey, 'plan')).kind, 'plan')
  await assert.rejects(() => openTradeTicket(ticket, 'did:privy:another123', credentials.secretKey, 'plan'), /invalid_order_ticket/)
  await assert.rejects(() => openTradeTicket(ticket.slice(0, -5) + 'abcde', 'did:privy:fixture123', credentials.secretKey, 'plan'), /invalid_order_ticket/)
  await assert.rejects(() => openTradeTicket(ticket, 'did:privy:fixture123', credentials.secretKey, 'receipt'), /invalid_order_ticket/)
})
test('authentic expired tickets allow only historical reads, preserving owner, kind and signature checks', async () => {
  const user = 'did:privy:fixture123'
  const key = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`firstbell-agent-orders-v1:${credentials.secretKey}`)))
  for (const kind of ['plan', 'receipt']) {
    const ticket = await new SignJWT({ kind, orderId: 'oc-o-fixture' }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer('firstbell-agent').setAudience(`firstbell-${kind}`).setSubject(user).setIssuedAt(now() - 172_800).setExpirationTime(now() - 86_400).sign(key)
    await assert.rejects(() => openTradeTicket(ticket, user, credentials.secretKey, kind), /invalid_order_ticket/)
    assert.equal((await openTradeTicket(ticket, user, credentials.secretKey, kind, true)).orderId, 'oc-o-fixture')
    await assert.rejects(() => openTradeTicket(ticket, 'did:privy:another123', credentials.secretKey, kind, true), /invalid_order_ticket/)
    await assert.rejects(() => openTradeTicket(ticket, user, credentials.secretKey, kind === 'plan' ? 'receipt' : 'plan', true), /invalid_order_ticket/)
    await assert.rejects(() => openTradeTicket(ticket.slice(0, -5) + 'abcde', user, credentials.secretKey, kind, true), /invalid_order_ticket/)
  }
})

test('reconciliation reads a recorded order after expiry without resubmitting or requiring unspent balance', async t => {
  mock()
  const prepared = await prepareAgentTrade('NVDAon', 'buy', '5', wallet, credentials)
  const signature = await signer.signTypedData(prepared.typedData)
  const elapsed = Date.now() + 1_800_000
  t.mock.method(Date, 'now', () => elapsed)
  balance = 0n; allowance = 0n
  const recovered = await recoverAgentTrade(prepared, signature, credentials, { started: true, orderId: 'oc-o-fixture' })
  assert.equal(recovered.status, 'PENDING_VENDOR')
  assert.equal(calls.some(call => call.path.endsWith('/order/submit')), false)
  assert.equal(await recoverAgentTrade(prepared, signature, credentials, { started: true, orderId: null }), null)
  const wrong = privateKeyToAccount(`0x${'22'.repeat(32)}`)
  const wrongSignature = await wrong.signTypedData(prepared.typedData)
  await assert.rejects(() => recoverAgentTrade(prepared, wrongSignature, credentials, { started: true, orderId: 'oc-o-fixture' }), /invalid_order_signature/)
})
test('only the owned wallet can submit; retry keeps the same requestId and RFQ order ID', async () => {
  mock(); const prepared = await prepareAgentTrade('NVDAon', 'buy', '5', wallet, credentials)
  const wrongSigner = privateKeyToAccount(`0x${'22'.repeat(32)}`), wrongSignature = await wrongSigner.signTypedData(prepared.typedData)
  await assert.rejects(() => submitAgentTrade(prepared, wrongSignature, credentials), /invalid_order_signature/)
  assert.equal(calls.some(call => call.path.endsWith('/order/submit')), false)
  const signature = await signer.signTypedData(prepared.typedData), submitted = await submitAgentTrade(prepared, signature, credentials)
  await submitAgentTrade(prepared, signature, credentials)
  const writes = calls.filter(call => call.path.endsWith('/order/submit'))
  assert.equal(writes.length, 2); assert.equal(writes[0].body.requestId, writes[1].body.requestId); assert.equal(writes[0].body.quoteId, 'vendor-order-id')
  assert.equal(writes[0].body.vendor, 'CowSwap'); assert.equal(submitted.status, 'PENDING_VENDOR'); assert.equal(submitted.txHash, null)
})
test('filled requires provider settlement, two confirmations and correct wallet token transfers', async () => {
  mock(); const prepared = await prepareAgentTrade('NVDAon', 'buy', '5', wallet, credentials)
  assert.equal((await checkAgentOrder('oc-o-fixture', prepared, credentials)).status, 'PENDING_VENDOR')
  orderState = 'FILLED'; confirmations = 1; assert.equal((await checkAgentOrder('oc-o-fixture', prepared, credentials)).status, 'CONFIRMING')
  confirmations = 2; const filled = await checkAgentOrder('oc-o-fixture', prepared, credentials)
  assert.equal(filled.status, 'FILLED'); assert.equal(filled.inputAmount, '5'); assert.equal(filled.outputAmount, '0.025'); assert.equal(filled.txHash, txHash)
  receiptMismatch = true; await assert.rejects(() => checkAgentOrder('oc-o-fixture', prepared, credentials), /settlement_not_verified/)
})
test('unauthenticated, oversized and cross-origin requests fail before reaching a provider', async () => {
  mock(); const env = { PRIVY_APP_ID: 'fixture-app', BINANCE_WEB3_API_KEY: credentials.apiKey, BINANCE_WEB3_SECRET_KEY: credentials.secretKey, ACCOUNTS: {} }
  for (const path of ['prepare', 'submit', 'status', 'recover', 'approval/submit', 'approval/refresh']) assert.equal((await handleApiRequest(new Request(`https://firstbell.test/api/trade/${path}`, { method: 'POST', body: '{}' }), env)).status, 401)
  const cross = await handleAgentTrade(new Request('https://firstbell.test/api/trade/prepare', { method: 'POST', headers: { Origin: 'https://attacker.test', 'Content-Type': 'application/json' }, body: '{}' }), env, 'did:privy:fixture123')
  assert.equal(cross.status, 403)
  const big = await handleAgentTrade(new Request('https://firstbell.test/api/trade/prepare', { method: 'POST', headers: { Origin: 'https://firstbell.test', 'Content-Type': 'application/json' }, body: 'a'.repeat(24_001) }), env, 'did:privy:fixture123')
  assert.equal(big.status, 413); assert.equal(calls.length, 0)
})

async function skillTradeFixture() {
  mock()
  const providerFetch = globalThis.fetch, state = { risk: 1, buyTax: '0', open: true, auditSupported: true, auditAvailable: true, skillCalls: 0 }
  globalThis.fetch = async (input, init) => {
    const url = new URL(input)
    if (!url.pathname.includes('/bapi/defi/')) return providerFetch(input, init)
    state.skillCalls++
    assert.equal(init.headers['X-OC-APIKEY'], undefined)
    const data = url.pathname.endsWith('/audit')
      ? { requestId: JSON.parse(init.body).requestId, hasResult: state.auditAvailable, isSupported: state.auditSupported, riskLevel: state.risk, riskLevelEnum: state.risk <= 1 ? 'LOW' : 'HIGH', extraInfo: { buyTax: state.buyTax, sellTax: '0', isVerified: true }, riskItems: [] }
      : url.pathname.endsWith('detail/list/ai') ? [{ symbol: 'NVDAon', ticker: 'NVDA', chainId: '56', type: 1, contractAddress: tokenAddresses.NVDAon, multiplier: '1' }]
      : url.pathname.includes('status/ai') ? { openState: state.open, reasonCode: state.open ? 'TRADING' : 'ASSET_PAUSED' }
      : url.pathname.includes('dynamic/ai') ? { symbol: 'NVDAon', tokenInfo: { price: '200', sharesMultiplier: '1' }, stockInfo: { price: '200' } }
      : { symbol: 'NVDAon' }
    return Response.json({ code: '000000', success: true, data })
  }
  const pair = await generateKeyPair('ES256'), user = 'did:privy:skills-trade', app = 'fixture-skills-trade'
  const identity = await new SignJWT({ linked_accounts: JSON.stringify([{ type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: wallet }]) })
    .setProtectedHeader({ alg: 'ES256' }).setSubject(user).setIssuer('privy.io').setAudience(app).setExpirationTime('1h').sign(pair.privateKey)
  const values = new Map(), storage = { get: async key => structuredClone(values.get(key)), put: async (key, value) => { values.set(key, structuredClone(value)) } }
  const env = { PRIVY_APP_ID: app, PRIVY_VERIFICATION_KEY: await exportSPKI(pair.publicKey), BINANCE_WEB3_API_KEY: credentials.apiKey, BINANCE_WEB3_SECRET_KEY: credentials.secretKey,
    ACCOUNTS: { idFromName: id => id, get: () => ({ fetch: req => handleAccountRequest(req, {}, storage) }) } }
  const headers = { Origin: 'https://firstbell.test', 'Content-Type': 'application/json', 'privy-id-token': identity }
  const call = (path, body) => handleAgentTrade(new Request(`https://firstbell.test/api/trade/${path}`, { method: 'POST', headers, body: JSON.stringify({ walletAddress: wallet, ...body }) }), env, user)
  return { state, call, user }
}
test('Wallet Skills are checked before quoting, sealed into the owned plan, and rechecked before one dispatch', async () => {
  const f = await skillTradeFixture()
  const response = await f.call('prepare', { symbol: 'NVDAon', side: 'buy', amount: '5', walletSkills: true })
  assert.equal(response.status, 200)
  const { plan } = await response.json()
  assert.equal(plan.walletSkills.stock.address, tokenAddresses.NVDAon); assert.equal(plan.walletSkills.audit.level, 1)
  assert.deepEqual((await openTradeTicket(plan.planToken, f.user, credentials.secretKey, 'plan')).plan.walletSkills, plan.walletSkills)
  assert.equal(f.state.skillCalls, 5); assert.equal(calls.some(c => c.path.endsWith('/order/submit')), false)
  const signature = await signer.signTypedData(plan.typedData)
  const submitted = await f.call('submit', { planToken: plan.planToken, signature })
  assert.equal(submitted.status, 200); assert.equal((await submitted.json()).order.status, 'PENDING_VENDOR')
  assert.equal(f.state.skillCalls, 10); assert.equal(calls.filter(c => c.path.endsWith('/order/submit')).length, 1)
  await f.call('recover', { planToken: plan.planToken, signature })
  assert.equal(f.state.skillCalls, 10); assert.equal(calls.filter(c => c.path.endsWith('/order/submit')).length, 1)
})
test('blocked research reaches no quote; a changed audit after review becomes a durable failed order without dispatch', async () => {
  const f = await skillTradeFixture(); f.state.risk = 5
  const blocked = await f.call('prepare', { symbol: 'NVDAon', side: 'buy', amount: '5', walletSkills: true })
  assert.equal((await blocked.json()).error, 'skill_security_blocked'); assert.equal(calls.length, 0)
  f.state.risk = 1
  const { plan } = await (await f.call('prepare', { symbol: 'NVDAon', side: 'buy', amount: '5', walletSkills: true })).json()
  const signature = await signer.signTypedData(plan.typedData)
  f.state.buyTax = '8'
  const failed = await f.call('submit', { planToken: plan.planToken, signature })
  assert.equal(failed.status, 200)
  const { order } = await failed.json()
  assert.equal(order.status, 'FAILED'); assert.equal(order.failureReason, 'skill_checks_changed')
  const skillCalls = f.state.skillCalls
  assert.equal((await (await f.call('submit', { planToken: plan.planToken, signature })).json()).order.status, 'FAILED')
  assert.equal((await (await f.call('status', { receiptToken: order.receiptToken })).json()).order.status, 'FAILED')
  assert.equal(f.state.skillCalls, skillCalls); assert.equal(calls.some(c => c.path.endsWith('/order/submit')), false)
})
test('unsupported Binance audit requires explicit acknowledgement of the sealed report before any dispatch', async () => {
  const f = await skillTradeFixture(); f.state.auditSupported = false; f.state.auditAvailable = false
  const prepared = await f.call('prepare', { symbol: 'NVDAon', side: 'buy', amount: '5', walletSkills: true })
  assert.equal(prepared.status, 200)
  const { plan } = await prepared.json()
  assert.equal(plan.walletSkills.audit.reason, 'unsupported'); assert.equal(plan.walletSkills.audit.level, null)
  const signature = await signer.signTypedData(plan.typedData)
  for (const auditAcknowledged of [undefined, false, 'true']) {
    const refused = await f.call('submit', { planToken: plan.planToken, signature, auditAcknowledged })
    assert.equal(refused.status, 400); assert.equal((await refused.json()).error, 'skill_audit_acknowledgement_required')
  }
  assert.equal(calls.some(c => c.path.endsWith('/order/submit')), false)
  const result = await f.call('submit', { planToken: plan.planToken, signature, auditAcknowledged: true })
  assert.equal(result.status, 200); assert.equal((await result.json()).order.status, 'PENDING_VENDOR')
  assert.equal(calls.filter(c => c.path.endsWith('/order/submit')).length, 1)
})
test('an unavailable status or newly available audit after an unsupported review cannot dispatch using old consent', async () => {
  for (const changed of ['audit', 'market']) {
    const f = await skillTradeFixture(); f.state.auditSupported = false; f.state.auditAvailable = false
    const { plan } = await (await f.call('prepare', { symbol: 'NVDAon', side: 'buy', amount: '5', walletSkills: true })).json()
    const signature = await signer.signTypedData(plan.typedData)
    if (changed === 'audit') { f.state.auditSupported = true; f.state.auditAvailable = true }
    else f.state.open = false
    const result = await f.call('submit', { planToken: plan.planToken, signature, auditAcknowledged: true })
    assert.equal((await result.json()).order.status, 'FAILED')
    assert.equal(calls.some(c => c.path.endsWith('/order/submit')), false)
  }
})
