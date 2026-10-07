import assert from 'node:assert/strict'
import { test, afterEach } from 'node:test'
import { openOrder } from '../lib/agent-trading.ts'
import { orderAmounts, positionPerformance } from '../lib/portfolio-performance.ts'
import { readWalletOrders, storeTradeReceipt } from '../lib/trade-storage.ts'
import { readWithdrawalHistory, storeWithdrawalHistory } from '../lib/withdrawal-history.ts'
import { sevenDayChange, portfolioChanges } from '../worker/portfolio-market.ts'

const owner = '0x' + '11'.repeat(20), tx = '0x' + 'cc'.repeat(32)
const storage = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) } }
const order = (id, side, input, output, at = '2026-10-06T10:00:00Z') => ({ orderId: id, status: 'FILLED', receiptToken: 'receipt-' + id, txHash: tx,
  inputAmount: input, outputAmount: output, createdAt: at, trade: { symbol: 'NVDAon', side, amount: input, inputSymbol: side === 'buy' ? 'USDT' : 'NVDAon',
    outputSymbol: side === 'buy' ? 'NVDAon' : 'USDT', expiresAt: '2026-10-06T10:10:00Z', source: 'cow-protocol', quotedOutputAmount: '0.09' } })

test('filled legacy pointers remain history after reload; confirming fills are not open orders', () => {
  const store = storage(), filled = order('legacy', 'buy', '10', '0.1')
  store.setItem(`firstbell-agent-order:${owner}`, JSON.stringify(filled))
  const restored = readWalletOrders(store, owner)
  assert.equal(restored[0].status, 'FILLED')
  assert.equal(openOrder(restored[0]), false)
  storeTradeReceipt(store, owner, restored[0])
  assert.equal(readWalletOrders(store, owner)[0].status, 'FILLED')
  for (const status of ['FILLED', 'CONFIRMING', 'FAILED', 'CANCELLED', 'EXPIRED']) assert.equal(openOrder({ status }), false)
  for (const status of ['PENDING_VENDOR', 'PENDING_ONCHAIN']) assert.equal(openOrder({ status }), true)
})

test('order quantities distinguish quoted receive from actual fill, for both Buy and Sell', () => {
  const buy = order('buy', 'buy', '10', '0.1'), sell = order('sell', 'sell', '0.1', '11')
  assert.deepEqual(orderAmounts(buy), { input: '10', output: '0.1', inputSymbol: 'USDT', outputSymbol: 'NVDAon', token: '0.1', estimated: false })
  assert.equal(orderAmounts({ ...buy, status: 'PENDING_VENDOR', outputAmount: null }).token, '0.09')
  assert.equal(orderAmounts({ ...buy, status: 'EXPIRED', trade: { ...buy.trade, quotedOutputAmount: undefined } }).output, null)
  assert.equal(orderAmounts(sell).token, '0.1')
  assert.equal(orderAmounts(sell).output, '11')
})

test('remaining holdings use weighted average purchase cost after multiple buys and partial sells', () => {
  const orders = [order('b2', 'buy', '30', '0.2', '2026-10-06T11:00:00Z'), order('sale', 'sell', '0.15', '24', '2026-10-06T12:00:00Z'), order('b1', 'buy', '10', '0.1')]
  const result = positionPerformance('NVDAon', '0.15', 160, orders)
  assert.ok(result)
  assert.ok(Math.abs(result.cost - 20) < 1e-9)
  assert.ok(Math.abs(result.averagePrice - 40 / .3) < 1e-9)
  assert.ok(Math.abs(result.gain - 4) < 1e-9)
  assert.ok(Math.abs(result.gainPct - 20) < 1e-9)
  assert.ok(positionPerformance('NVDAon', '0.15', 100, orders).gain < 0)
})

test('a one-USDT purchase gains or loses value from its actual purchase price', () => {
  const purchase = order('one-usdt', 'buy', '1', '0.005')
  const gain = positionPerformance('NVDAon', '0.005', 202, [purchase])
  const loss = positionPerformance('NVDAon', '0.005', 198, [purchase])
  assert.equal(gain.value, 1.01); assert.ok(Math.abs(gain.gain - .01) < 1e-12); assert.ok(Math.abs(gain.gainPct - 1) < 1e-10)
  assert.equal(loss.value, .99); assert.ok(Math.abs(loss.gain + .01) < 1e-12); assert.ok(Math.abs(loss.gainPct + 1) < 1e-10)
  const flat = positionPerformance('NVDAon', '0.005', 200, [purchase])
  assert.equal(flat.value, 1); assert.equal(flat.gain, 0); assert.equal(flat.gainPct, 0)
})

test('quotes, failed orders, missing purchases and incoming token transfers do not invent gains', () => {
  const filled = order('b1', 'buy', '10', '0.1')
  assert.equal(positionPerformance('NVDAon', '0.1', 150, [{ ...filled, status: 'PENDING_VENDOR' }]), null)
  assert.equal(positionPerformance('NVDAon', '0.2', 150, [filled]), null)
  assert.equal(positionPerformance('NVDAon', '0.1', null, [filled]), null)
  assert.equal(positionPerformance('NVDAon', '0.1', 150, []), null)
  assert.equal(positionPerformance('NVDAon', '0.1', 150, [order('sale-first', 'sell', '0.1', '10')]), null)
  assert.equal(positionPerformance('NVDAon', '0.1', 150, [filled, filled]).cost, 10)
})

test('withdrawal activity survives reload and reset, is wallet-scoped and cannot regress confirmed status', () => {
  const store = storage(), plan = { walletAddress: owner, amount: '5.123456789123456789', recipient: '0x' + '22'.repeat(20) }
  storeWithdrawalHistory(store, plan, { hash: tx, status: 'unknown' })
  const initial = readWithdrawalHistory(store, owner)[0]
  storeWithdrawalHistory(store, plan, { hash: tx, status: 'completed' })
  storeWithdrawalHistory(store, plan, { hash: tx, status: 'pending' })
  const result = readWithdrawalHistory(store, owner)[0]
  assert.equal(result.status, 'completed'); assert.equal(result.recordedAt, initial.recordedAt); assert.equal(result.amount, plan.amount)
  assert.deepEqual(readWithdrawalHistory(store, plan.recipient), [])
  assert.equal(JSON.stringify(result).includes('rawTransaction'), false)
})

test('7d market change requires a completed hourly candle at the seven-day reference, not a future candle or short history', () => {
  const at = Date.now(), target = at - 7 * 86_400_000
  const bar = [80, 110, 70, 100, 1, target - 3_600_000, 2]
  assert.ok(Math.abs(sevenDayChange(120, new Date(at).toISOString(), [bar]) - 20) < 1e-10)
  assert.equal(sevenDayChange(120, new Date(at).toISOString(), [[...bar.slice(0, 5), target, 2]]), null)
  assert.equal(sevenDayChange(120, new Date(at).toISOString(), [[...bar.slice(0, 5), target - 3 * 3_600_000, 2]]), null)
  assert.equal(sevenDayChange(120, new Date(at).toISOString(), [[80, 90, 70, 100, 1, target - 3_600_000, 2]]), null)
  assert.equal(sevenDayChange(120, 'invalid', [bar]), null)
})

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
test('7d provider requests use exact BSC contracts and bounded hourly history without changing the price-only batch', async () => {
  const at = Date.now(), target = at - 7 * 86_400_000, paths = []
  globalThis.fetch = async (url, options) => {
    const u = new URL(url); paths.push(u.pathname)
    if (u.pathname.endsWith('/price-info')) {
      const tokens = JSON.parse(options.body)
      return Response.json({ code: 0, data: tokens.map(token => ({ ...token, price: '120', time: at })) })
    }
    assert.equal(u.searchParams.get('binanceChainId'), '56')
    assert.equal(u.searchParams.get('bar'), '1h'); assert.equal(u.searchParams.get('limit'), '3')
    assert.equal(u.searchParams.get('after'), String(target + 1))
    return Response.json({ code: 0, data: [[80, 110, 70, 100, 1, target - 3_600_000, 2]] })
  }
  const result = await portfolioChanges(['NVDAon'], { apiKey: 'fixture-seven-day', secretKey: 'fixture-secret' })
  assert.equal(result[0].symbol, 'NVDAon'); assert.ok(Math.abs(result[0].change7dPct - 20) < 1e-9)
  assert.equal(paths.length, 2)
})
