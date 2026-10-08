import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { request } from 'node:http'
import { createBinanceAgent } from '../agent-runtime/core.mjs'
import { createOrderJournal } from '../agent-runtime/orders.mjs'
import { createReviewServer } from '../agent-runtime/review.mjs'
import { BinanceCliError } from '../agent-runtime/cli.mjs'
import { tokenAddresses } from '../lib/asset-catalog.ts'
import { BSC_USDT } from '../lib/funding.ts'

const wallet = '0x' + '11'.repeat(20)
test('CLI failures never echo provider text or quoted/unlabeled credentials', () => {
  const error = new BinanceCliError({ name: 'SESSION_EXPIRED', code: 401, message: 'sessionToken="fixture-secret" or unlabeled fixture-secret' })
  assert.match(error.message, /SESSION_EXPIRED.*401/)
  assert.equal(error.message.includes('fixture-secret'), false)
})
const report = () => ({ source: 'binance-wallet-skills', checkedAt: new Date().toISOString(), stock: { symbol: 'AAPLon', address: tokenAddresses.AAPLon, chainId: 56, market: { open: true, reason: 'TRADING', detail: null } }, audit: { available: true, level: 1, label: 'LOW', buyTax: 0, sellTax: 0, verified: true, risks: [] }, trace: [] })
function fixture() {
  const calls = [], rows = new Map(), state = { connected: true, wallet, pending: 'PENDING', swapError: false, changedRisk: false, unsupportedAudit: false, received: '0.005', now: Date.now(), quote: '0.005' }
  const journal = { get: async id => structuredClone(rows.get(id) ?? null), list: async () => [...rows.values()].map(v => structuredClone(v)), save: async row => { rows.set(row.reviewId, structuredClone(row)) } }
  const runCli = async args => {
    calls.push(args)
    if (args[0] === 'cli-check') return { needUpdateCli: false }
    if (args[0] === 'skill-check') return { needUpdateSkill: false }
    if (args[0] === 'auth') {
      if (args[1] === 'signin') return { urlForWeb: 'https://web3.binance.com/en/agent-login?expireAt=123&url=verbatim', qrCodeId: 'fixture-qr', expireAt: String(state.now + 300_000), pairingCode: '654321', sessionToken: 'must-not-leak', clientId: 'must-not-leak' }
      if (args[1] === 'verify') return { status: 'SUCCESS' }
      if (args[1] === 'signout') return { status: 'LOGGED_OUT' }
    }
    if (args[1] === 'status') return { status: state.connected ? 'CONNECTED' : 'UNCONNECTED', sessionToken: 'must-not-leak' }
    if (args[1] === 'address') return { addresses: [{ binanceChainId: '56', address: state.wallet }] }
    if (args[1] === 'settings') return { dailyLimit: 20, quotaLeft: 20, sessionExpireTime: '2026-10-09T01:00:00Z', clientId: 'must-not-leak' }
    if (args[1] === 'balance') return [{ binanceChainId: '56', address: BSC_USDT.address, balance: '10' }, { binanceChainId: '56', address: tokenAddresses.AAPLon, balance: '1' }]
    if (args[1] === 'quote') return { fromCoinSymbol: args.includes(BSC_USDT.address) && args[args.indexOf('--fromToken') + 1] === BSC_USDT.address ? 'USDT' : 'AAPLon', fromCoinAmount: args[args.indexOf('--fromTokenQty') + 1], toCoinSymbol: args[args.indexOf('--toToken') + 1] === BSC_USDT.address ? 'USDT' : 'AAPLon', toCoinAmount: state.quote }
    if (args[1] === 'swap') { if (state.swapError) throw new Error('network unavailable'); return { orderId: 'baw-order-1' } }
    if (args[1] === 'list') return { list: [{ orderId: 'baw-order-1', chain: '56', fromToken: BSC_USDT.address, toToken: tokenAddresses.AAPLon, fromTokenQty: '1.0', status: state.pending, txHash: state.pending === 'FINISHED' ? '0x' + 'ab'.repeat(32) : null }] }
    throw new Error('Unexpected CLI command ' + args.join(' '))
  }
  const agent = createBinanceAgent({ runCli, journal, research: async () => { const value = report(); if (state.unsupportedAudit) value.audit = { available: false, reason: 'unsupported', level: null, label: null, buyTax: null, sellTax: null, verified: null, risks: [] }; return value }, check: async () => { const value = report(); if (state.unsupportedAudit) value.audit = { available: false, reason: 'unsupported', level: null, label: null, buyTax: null, sellTax: null, verified: null, risks: [] }; if (state.changedRisk) value.audit.buyTax = 7; return value },
    verifySettlement: async (_, hash) => state.received ? { txHash: hash, inputAmount: '1', outputAmount: state.received } : null, now: () => state.now })
  return { agent, state, calls, rows, journal }
}
test('Agentic Wallet research/quote never executes; preparation uses pinned BSC USDT, exact amount and slippage', async () => {
  const { agent, calls } = fixture(), plan = await agent.prepareTrade({ symbol: 'AAPLon', side: 'buy', amount: '1' })
  assert.equal(plan.fromToken, BSC_USDT.address); assert.equal(plan.toToken, tokenAddresses.AAPLon); assert.equal(plan.amount, '1'); assert.equal(plan.slippagePercent, '0.5')
  assert.equal(calls.some(c => c[1] === 'swap'), false)
  assert.equal(calls.find(c => c[1] === 'quote').at(-1), '0.5')
  assert.equal(JSON.stringify(await agent.walletStatus()).includes('must-not-leak'), false)
  assert.equal(JSON.stringify(await agent.walletBalance()).includes('must-not-leak'), false)
})
test('invalid names, arbitrary addresses, negative/scientific amounts and absent connections never reach swap', async () => {
  const { agent, calls, state } = fixture()
  for (const input of [{ symbol: wallet, side: 'buy', amount: '1' }, { symbol: 'AAPLon', side: 'buy', amount: '-1' }, { symbol: 'AAPLon', side: 'buy', amount: '1e3' }, { symbol: 'AAPLon', side: 'buy', amount: '0' }]) await assert.rejects(agent.prepareTrade(input), /invalid_trade_request/)
  state.connected = false; await assert.rejects(agent.prepareTrade({ symbol: 'AAPLon', side: 'buy', amount: '1' }), /Sign in/)
  assert.equal(calls.some(c => c[1] === 'swap'), false)
})
test('one reviewed confirmation dispatches once; PENDING is never FILLED and replay is rejected', async () => {
  const { agent, calls } = fixture(), plan = await agent.prepareTrade({ symbol: 'AAPLon', side: 'buy', amount: '1' })
  const order = await agent.executeReviewed(plan.reviewId)
  assert.equal(order.status, 'PENDING'); assert.equal(order.txHash, null); assert.equal(order.outputAmount, null)
  await assert.rejects(agent.executeReviewed(plan.reviewId), /already confirmed/)
  assert.equal(calls.filter(c => c[1] === 'swap').length, 1)
})
test('Binance FINISHED requires receipt verification before FILLED and actual received quantities', async () => {
  const { agent, state } = fixture(), plan = await agent.prepareTrade({ symbol: 'AAPLon', side: 'buy', amount: '1' })
  await agent.executeReviewed(plan.reviewId); state.pending = 'FINISHED'; state.received = null
  assert.equal((await agent.orderStatus(plan.reviewId)).status, 'CONFIRMING')
  state.received = '0.00499'; const filled = await agent.orderStatus(plan.reviewId)
  assert.equal(filled.status, 'FILLED'); assert.equal(filled.outputAmount, '0.00499'); assert.equal(filled.inputAmount, '1')
})
test('failed orders stay in history and unknown dispatches are never resumed', async () => {
  const { agent, state, calls } = fixture(), plan = await agent.prepareTrade({ symbol: 'AAPLon', side: 'buy', amount: '1' })
  await agent.executeReviewed(plan.reviewId); state.pending = 'FAILED'
  assert.equal((await agent.orderStatus(plan.reviewId)).status, 'FAILED')
  assert.equal((await agent.orderHistory())[0].status, 'FAILED')
  await assert.rejects(agent.executeReviewed(plan.reviewId), /already confirmed/)
  const other = fixture(), unknown = await other.agent.prepareTrade({ symbol: 'AAPLon', side: 'buy', amount: '1' }); other.state.swapError = true
  assert.equal((await other.agent.executeReviewed(unknown.reviewId)).status, 'UNKNOWN')
  await assert.rejects(other.agent.executeReviewed(unknown.reviewId), /already confirmed/)
  assert.equal(other.calls.filter(c => c[1] === 'swap').length, 1); assert.equal(calls.filter(c => c[1] === 'swap').length, 1)
})
test('wallet changes, changed security, adverse re-quotes and expired reviews prevent dispatch', async () => {
  for (const change of [f => f.state.wallet = '0x' + '22'.repeat(20), f => f.state.changedRisk = true, f => f.state.quote = '0.004']) {
    const f = fixture(), plan = await f.agent.prepareTrade({ symbol: 'AAPLon', side: 'buy', amount: '1' }); change(f)
    assert.equal((await f.agent.executeReviewed(plan.reviewId)).status, 'FAILED'); assert.equal(f.calls.some(c => c[1] === 'swap'), false)
  }
  const f = fixture(), plan = await f.agent.prepareTrade({ symbol: 'AAPLon', side: 'buy', amount: '1' }); f.state.now += 120_001
  await assert.rejects(f.agent.executeReviewed(plan.reviewId), /expired/); assert.equal(f.calls.some(c => c[1] === 'swap'), false)
})
test('Binance signin link/pairing code stay verbatim; session/client IDs never enter responses and expired QR is not reused', async () => {
  const f = fixture(), signin = await f.agent.signIn()
  assert.equal(signin.urlForWeb, 'https://web3.binance.com/en/agent-login?expireAt=123&url=verbatim'); assert.equal(signin.pairingCode, '654321')
  assert.equal(JSON.stringify(signin).includes('must-not-leak'), false)
  assert.equal((await f.agent.verifySignIn(signin.qrCodeId)).status, 'CONNECTED')
  await assert.rejects(f.agent.verifySignIn(signin.qrCodeId), /expired/)
})
test('loopback review GET is read-only; cross-origin and non-browser confirmation cannot spend; token is single-use', async () => {
  const f = fixture(), plan = await f.agent.prepareTrade({ symbol: 'AAPLon', side: 'buy', amount: '1' }), server = await createReviewServer(f.agent)
  try {
    const url = server.add(plan), origin = new URL(url).origin, confirm = url.replace('/review/', '/confirm/')
    const review = await fetch(url)
    assert.equal(review.status, 200); assert.equal(review.headers.get('referrer-policy'), 'same-origin'); assert.equal(f.calls.some(c => c[1] === 'swap'), false)
    assert.equal((await fetch(confirm, { method: 'POST', headers: { Origin: 'https://attacker.example' } })).status, 403)
    assert.equal((await fetch(confirm, { method: 'POST', headers: { Origin: origin } })).status, 403)
    assert.equal(f.calls.some(c => c[1] === 'swap'), false)
    // Node fetch overwrites Sec-Fetch-Mode with "cors". Send the documented
    // navigation headers directly; browser QA also clicks the actual form.
    const response = await new Promise((resolve, reject) => {
      const req = request(confirm, { method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-User': '?1', 'Sec-Fetch-Dest': 'document' } }, res => {
        let body = ''; res.setEncoding('utf8'); res.on('data', chunk => body += chunk); res.on('end', () => resolve({ status: res.statusCode, body }))
      }); req.on('error', reject); req.end()
    })
    assert.equal(response.status, 200); assert.match(response.body, /PENDING/)
    assert.equal((await fetch(confirm, { method: 'POST' })).status, 404)
    assert.equal(f.calls.filter(c => c[1] === 'swap').length, 1)
  } finally { await server.close() }
})
test('local journal survives restart with UNKNOWN/FAILED status and original wallet without storing credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'firstbell-agent-'))
  try {
    const row = { reviewId: 'fixture-review', wallet, status: 'UNKNOWN', orderId: null }
    await createOrderJournal(directory).save(row)
    assert.deepEqual(await createOrderJournal(directory).get(row.reviewId), row)
    await createOrderJournal(directory).save({ ...row, status: 'FAILED' })
    assert.equal((await createOrderJournal(directory).list())[0].status, 'FAILED')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
test('personal wallet unsupported audit needs acknowledgement and fresh checks before exactly one execution', async () => {
  const f = fixture(); f.state.unsupportedAudit = true
  const plan = await f.agent.prepareTrade({ symbol: 'AAPLon', side: 'buy', amount: '1' })
  await assert.rejects(f.agent.executeReviewed(plan.reviewId), /skill_audit_acknowledgement_required/)
  assert.ok(f.agent.getReview(plan.reviewId)); assert.equal(f.calls.some(c => c[1] === 'swap'), false)
  assert.equal((await f.agent.executeReviewed(plan.reviewId, { auditAcknowledged: true })).status, 'PENDING')
  assert.equal(f.calls.filter(c => c[1] === 'swap').length, 1)
  const changed = fixture(); changed.state.unsupportedAudit = true
  const old = await changed.agent.prepareTrade({ symbol: 'AAPLon', side: 'buy', amount: '1' })
  changed.state.unsupportedAudit = false
  assert.equal((await changed.agent.executeReviewed(old.reviewId, { auditAcknowledged: true })).status, 'FAILED')
  assert.equal(changed.calls.some(c => c[1] === 'swap'), false)
})
test('loopback unsupported audit uses the browser checkbox; missing or malformed consent leaves the review unspent', async () => {
  const f = fixture(); f.state.unsupportedAudit = true
  const plan = await f.agent.prepareTrade({ symbol: 'AAPLon', side: 'buy', amount: '1' }), server = await createReviewServer(f.agent)
  try {
    const url = server.add(plan), origin = new URL(url).origin, confirm = url.replace('/review/', '/confirm/')
    assert.match(await (await fetch(url)).text(), /name="auditAcknowledged".*required/)
    const click = body => new Promise((resolve, reject) => {
      const req = request(confirm, { method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-User': '?1', 'Sec-Fetch-Dest': 'document',
        'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, res => {
        let text = ''; res.setEncoding('utf8'); res.on('data', chunk => text += chunk); res.on('end', () => resolve({ status: res.statusCode, body: text }))
      }); req.on('error', reject); req.end(body)
    })
    for (const body of ['', 'auditAcknowledged=false', 'auditAcknowledged=on&extra=true']) assert.equal((await click(body)).status, 400)
    assert.equal(f.calls.some(c => c[1] === 'swap'), false)
    assert.equal((await fetch(url)).status, 200)
    assert.equal((await click('auditAcknowledged=on')).status, 200)
    assert.equal((await click('auditAcknowledged=on')).status, 404)
    assert.equal(f.calls.filter(c => c[1] === 'swap').length, 1)
  } finally { await server.close() }
})
