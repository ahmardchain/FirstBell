import assert from 'node:assert/strict'
import { test } from 'node:test'
import { positionsPerformance } from '../lib/portfolio-performance.ts'

const holdings = [{ symbol: 'NVDAon', quantity: '0.1', price: 200 }, { symbol: 'TSLAon', quantity: '0.5', price: 200 }]
const basis = { NVDAon: { symbol: 'NVDAon', quantity: '0.1', cost: 10 }, TSLAon: { symbol: 'TSLAon', quantity: '0.5', cost: 100 } }

test('combined position return is weighted by remaining purchase cost, not averaged percentages', () => {
  const performance = positionsPerformance(holdings, [], basis)
  assert.equal(performance.value, 120); assert.equal(performance.cost, 110); assert.equal(performance.gain, 10)
  assert.ok(Math.abs(performance.gainPct - 100 / 11) < 1e-12)
  assert.notEqual(performance.gainPct, 50) // Individual returns are +100% and 0%.
  assert.equal(positionsPerformance(holdings.map(holding => ({ ...holding, price: 100 })), [], basis).gain, -50)
})

test('mixed receipt and recovered costs use only remaining holdings after sales', () => {
  const buy = { orderId: 'b', status: 'FILLED', createdAt: '2026-10-07T10:00:00Z', inputAmount: '20', outputAmount: '0.2',
    trade: { symbol: 'NVDAon', side: 'buy', inputSymbol: 'USDT' } }
  const sell = { orderId: 's', status: 'FILLED', createdAt: '2026-10-07T11:00:00Z', inputAmount: '0.1', outputAmount: '50',
    trade: { symbol: 'NVDAon', side: 'sell', inputSymbol: 'NVDAon' } }
  const result = positionsPerformance(holdings, [buy, sell], { TSLAon: basis.TSLAon })
  assert.equal(result.cost, 110); assert.equal(result.gain, 10)
})

test('missing price or any unmatched purchase evidence prevents a misleading full return', () => {
  assert.equal(positionsPerformance(holdings, [], { NVDAon: basis.NVDAon }), null)
  assert.equal(positionsPerformance(holdings.map((holding, i) => i ? { ...holding, price: null } : holding), [], basis), null)
  assert.equal(positionsPerformance(holdings, [], { ...basis, TSLAon: { ...basis.TSLAon, quantity: '1' } }), null)
  assert.equal(positionsPerformance([], [], basis), null)
})
