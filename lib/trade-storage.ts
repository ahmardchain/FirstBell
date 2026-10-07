import { terminalOrder, type AgentOrder } from './agent-trading.ts'
import type { SignedTradeAttempt } from './trade-execution.ts'

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const read = (storage: StoragePort, key: string) => { try { return JSON.parse(storage.getItem(key) ?? 'null') } catch { return null } }

export function mergeTradeOrder(previous: AgentOrder | undefined, next: AgentOrder): AgentOrder {
  // A late status/cancel response cannot erase a verified fill, its amounts or
  // the description received with the original acknowledgement.
  if (previous?.status === 'FILLED') return previous
  return { ...previous, ...next, trade: next.trade ?? previous?.trade,
    cancellationRequested: next.cancellationRequested || previous?.cancellationRequested }
}

export function readTradeHistory(storage: StoragePort, owner: string): AgentOrder[] {
  const saved = read(storage, `firstbell-order-history:${owner.toLowerCase()}`)
  if (!Array.isArray(saved)) return []
  return saved.filter((order): order is AgentOrder => order && /^[A-Za-z0-9_-]{1,256}$/.test(order.orderId)
    && terminalOrder(order.status) && typeof order.receiptToken === 'string' && order.receiptToken.length <= 20_000
    && (order.txHash === null || /^0x[a-fA-F0-9]{64}$/.test(order.txHash))
    && (order.status !== 'FILLED' || order.txHash && /^\d+(?:\.\d+)?$/.test(order.inputAmount ?? '') && /^\d+(?:\.\d+)?$/.test(order.outputAmount ?? ''))).slice(-100)
}

export function readTradeReceipts(storage: StoragePort, owner: string): AgentOrder[] {
  const suffix = owner.toLowerCase()
  const saved = read(storage, `firstbell-agent-orders:${suffix}`)
  const legacy = read(storage, `firstbell-agent-order:${suffix}`)
  const receipts = new Map<string, AgentOrder>()
  for (const receipt of [...(Array.isArray(saved) ? saved : []), ...(legacy ? [legacy] : [])]) {
    if (receipt && /^[A-Za-z0-9_-]{1,256}$/.test(receipt.orderId) && typeof receipt.receiptToken === 'string' && receipt.receiptToken.length <= 20_000) receipts.set(receipt.orderId, receipt)
  }
  return [...receipts.values()]
}

export function readSignedTrades(storage: StoragePort, owner: string): SignedTradeAttempt[] {
  const suffix = owner.toLowerCase()
  const saved = read(storage, `firstbell-pending-orders:${suffix}`)
  const legacy = read(storage, `firstbell-pending-order:${suffix}`)
  const attempts = new Map<string, SignedTradeAttempt>()
  for (const attempt of [...(Array.isArray(saved) ? saved : []), ...(legacy ? [legacy] : [])]) {
    if (typeof attempt?.plan?.route?.walletAddress === 'string' && attempt.plan.route.walletAddress.toLowerCase() === suffix
      && /^[a-f0-9-]{36}$/.test(attempt.plan.requestId) && typeof attempt.plan.planToken === 'string' && attempt.plan.planToken.length <= 20_000
      && /^0x[a-fA-F0-9]{130}$/.test(attempt.signature)) attempts.set(attempt.plan.requestId, attempt)
  }
  return [...attempts.values()]
}

export function storeSignedTrade(storage: StoragePort, owner: string, attempt: SignedTradeAttempt) {
  const key = `firstbell-pending-order:${owner.toLowerCase()}`
  const attempts = readSignedTrades(storage, owner)
  if (!attempts.some(item => item.signature === attempt.signature && item.plan.requestId === attempt.plan.requestId)) attempts.push(attempt)
  storage.setItem(`firstbell-pending-orders:${owner.toLowerCase()}`, JSON.stringify(attempts))
  if (!read(storage, key)) storage.setItem(key, JSON.stringify(attempt))
}

// A late response from a closed view must not overwrite a newer trade's receipt.
export function storeTradeReceipt(storage: StoragePort, owner: string, receipt: AgentOrder) {
  const key = `firstbell-agent-order:${owner.toLowerCase()}`
  const current = read(storage, key)
  const existing = readTradeReceipts(storage, owner)
  const historyKey = `firstbell-order-history:${owner.toLowerCase()}`
  const history = readTradeHistory(storage, owner)
  receipt = mergeTradeOrder(history.find(item => item.orderId === receipt.orderId) ?? existing.find(item => item.orderId === receipt.orderId), receipt)
  const remainingHistory = terminalOrder(receipt.status)
    ? history.some(item => item.orderId === receipt.orderId) ? history.map(item => item.orderId === receipt.orderId ? receipt : item) : [...history, receipt]
    : history.filter(item => item.orderId !== receipt.orderId)
  if (remainingHistory.length) storage.setItem(historyKey, JSON.stringify(remainingHistory.slice(-100)))
  else storage.removeItem(historyKey)
  const receipts = terminalOrder(receipt.status) ? existing.filter(item => item.orderId !== receipt.orderId)
    : existing.some(item => item.orderId === receipt.orderId) ? existing.map(item => item.orderId === receipt.orderId ? receipt : item) : [...existing, receipt]
  const queueKey = `firstbell-agent-orders:${owner.toLowerCase()}`
  if (receipts.length) storage.setItem(queueKey, JSON.stringify(receipts))
  else storage.removeItem(queueKey)
  if (terminalOrder(receipt.status)) {
    if (current?.orderId === receipt.orderId) {
      if (receipts.length) storage.setItem(key, JSON.stringify(receipts[0]))
      else storage.removeItem(key)
    }
  } else if (!current || current.orderId === receipt.orderId) storage.setItem(key, JSON.stringify(receipt))
}

export function clearTradeApproval(storage: StoragePort, owner: string, hash: string | undefined) {
  const key = `firstbell-pending-approval:${owner.toLowerCase()}`
  if (hash && read(storage, key)?.hash === hash) storage.removeItem(key)
}

export function clearSignedTrade(storage: StoragePort, owner: string, attempt: SignedTradeAttempt | null) {
  const key = `firstbell-pending-order:${owner.toLowerCase()}`
  const current = read(storage, key)
  if (!attempt) return
  const matches = (item: SignedTradeAttempt) => item.signature === attempt.signature && item.plan.requestId === attempt.plan.requestId
  const remaining = readSignedTrades(storage, owner).filter(item => !matches(item))
  const queueKey = `firstbell-pending-orders:${owner.toLowerCase()}`
  if (remaining.length) storage.setItem(queueKey, JSON.stringify(remaining))
  else storage.removeItem(queueKey)
  if (current?.signature === attempt.signature && current?.plan?.requestId === attempt.plan.requestId) {
    if (remaining.length) storage.setItem(key, JSON.stringify(remaining[0]))
    else storage.removeItem(key)
  }
}
