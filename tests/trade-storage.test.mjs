import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clearSignedTrade, clearTradeApproval, storeTradeReceipt } from '../lib/trade-storage.ts'

const owner = `0x${'11'.repeat(20)}`
function storage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}
const receipt = (id, status = 'PENDING_VENDOR') => ({ orderId: id, status, receiptToken: `receipt-${id}`, txHash: null, inputAmount: null, outputAmount: null })

test('a late response from a closed view cannot overwrite or clear a newer receipt', () => {
  const store = storage(), key = `firstbell-agent-order:${owner}`
  storeTradeReceipt(store, owner, receipt('new-trade'))
  storeTradeReceipt(store, owner, receipt('old-trade'))
  storeTradeReceipt(store, owner, receipt('old-trade', 'FILLED'))
  assert.equal(JSON.parse(store.getItem(key)).orderId, 'new-trade')
  storeTradeReceipt(store, owner, receipt('new-trade', 'CONFIRMING'))
  assert.equal(JSON.parse(store.getItem(key)).status, 'CONFIRMING')
  storeTradeReceipt(store, owner, receipt('new-trade', 'FILLED'))
  assert.equal(store.getItem(key), null)
})

test('a late approval receipt only clears its own exact transaction hash', () => {
  const store = storage(), key = `firstbell-pending-approval:${owner}`
  store.setItem(key, JSON.stringify({ hash: 'new-hash' }))
  clearTradeApproval(store, owner, 'old-hash')
  assert.equal(JSON.parse(store.getItem(key)).hash, 'new-hash')
  clearTradeApproval(store, owner, 'new-hash')
  assert.equal(store.getItem(key), null)
})

test('signed trade cleanup preserves a newer request even with the same signature', () => {
  const store = storage(), key = `firstbell-pending-order:${owner}`
  const latest = { signature: 'fixture-signature', plan: { requestId: 'new-request' } }
  store.setItem(key, JSON.stringify(latest))
  clearSignedTrade(store, owner, { signature: 'fixture-signature', plan: { requestId: 'old-request' } })
  assert.deepEqual(JSON.parse(store.getItem(key)), latest)
  clearSignedTrade(store, owner, latest)
  assert.equal(store.getItem(key), null)
})

test('receipt and recovery cleanup remain scoped to the original wallet', () => {
  const store = storage(), other = `0x${'22'.repeat(20)}`
  storeTradeReceipt(store, owner, receipt('first-wallet'))
  storeTradeReceipt(store, other, receipt('second-wallet'))
  storeTradeReceipt(store, owner.toUpperCase(), receipt('first-wallet', 'FILLED'))
  assert.equal(store.getItem(`firstbell-agent-order:${owner}`), null)
  assert.equal(JSON.parse(store.getItem(`firstbell-agent-order:${other}`)).orderId, 'second-wallet')
})
