import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clearSignedTrade, clearTradeApproval, readSignedTrades, readTradeReceipts, storeSignedTrade, storeTradeReceipt } from '../lib/trade-storage.ts'

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

test('separate pending trades both survive reload and resolve independently', () => {
  const store = storage()
  storeTradeReceipt(store, owner, receipt('first'))
  storeTradeReceipt(store, owner, receipt('second'))
  assert.deepEqual(readTradeReceipts(store, owner).map(item => item.orderId), ['first', 'second'])
  storeTradeReceipt(store, owner, receipt('first', 'CONFIRMING'))
  assert.deepEqual(readTradeReceipts(store, owner).map(item => item.status), ['CONFIRMING', 'PENDING_VENDOR'])
  storeTradeReceipt(store, owner, receipt('first', 'FILLED'))
  assert.deepEqual(readTradeReceipts(store, owner).map(item => item.orderId), ['second'])
  assert.equal(JSON.parse(store.getItem(`firstbell-agent-order:${owner}`)).orderId, 'second')
  storeTradeReceipt(store, owner, receipt('second', 'EXPIRED'))
  assert.deepEqual(readTradeReceipts(store, owner), [])
})

test('a second independently signed trade retains both exact recoverable signatures', () => {
  const store = storage()
  const attempt = (number, bytes) => ({ signature: `0x${bytes.repeat(65)}`, plan: { requestId: `${number.repeat(8)}-${number.repeat(4)}-${number.repeat(4)}-${number.repeat(4)}-${number.repeat(12)}`, planToken: `ticket-${number}`, route: { walletAddress: owner } } })
  const first = attempt('1', 'aa'), second = attempt('2', 'bb')
  storeSignedTrade(store, owner, first)
  storeSignedTrade(store, owner, second)
  assert.deepEqual(readSignedTrades(store, owner), [first, second])
  clearSignedTrade(store, owner, { ...first, signature: second.signature })
  assert.deepEqual(readSignedTrades(store, owner), [first, second])
  clearSignedTrade(store, owner, first)
  assert.deepEqual(readSignedTrades(store, owner), [second])
  assert.deepEqual(JSON.parse(store.getItem(`firstbell-pending-order:${owner}`)), second)
  clearSignedTrade(store, owner, second)
  assert.deepEqual(readSignedTrades(store, owner), [])
})

test('legacy records migrate into the queues without duplicates or another wallet signature', () => {
  const store = storage()
  store.setItem(`firstbell-agent-order:${owner}`, JSON.stringify(receipt('legacy')))
  storeTradeReceipt(store, owner, receipt('new'))
  assert.deepEqual(readTradeReceipts(store, owner).map(item => item.orderId), ['legacy', 'new'])
  const other = `0x${'22'.repeat(20)}`
  store.setItem(`firstbell-pending-order:${owner}`, JSON.stringify({ signature: `0x${'aa'.repeat(65)}`, plan: { requestId: '11111111-1111-1111-1111-111111111111', planToken: 'ticket', route: { walletAddress: other } } }))
  assert.deepEqual(readSignedTrades(store, owner), [])
})
