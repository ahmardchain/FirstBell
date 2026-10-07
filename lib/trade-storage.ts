import { terminalOrder, type AgentOrder } from './agent-trading.ts'
import type { SignedTradeAttempt } from './trade-execution.ts'

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const read = (storage: StoragePort, key: string) => JSON.parse(storage.getItem(key) ?? 'null')

// A late response from a closed view must not overwrite a newer trade's receipt.
export function storeTradeReceipt(storage: StoragePort, owner: string, receipt: AgentOrder) {
  const key = `firstbell-agent-order:${owner.toLowerCase()}`
  const current = read(storage, key)
  if (terminalOrder(receipt.status)) {
    if (current?.orderId === receipt.orderId) storage.removeItem(key)
  } else if (!current || current.orderId === receipt.orderId) storage.setItem(key, JSON.stringify(receipt))
}

export function clearTradeApproval(storage: StoragePort, owner: string, hash: string | undefined) {
  const key = `firstbell-pending-approval:${owner.toLowerCase()}`
  if (hash && read(storage, key)?.hash === hash) storage.removeItem(key)
}

export function clearSignedTrade(storage: StoragePort, owner: string, attempt: SignedTradeAttempt | null) {
  const key = `firstbell-pending-order:${owner.toLowerCase()}`
  const current = read(storage, key)
  if (attempt && current?.signature === attempt.signature && current?.plan?.requestId === attempt.plan.requestId) storage.removeItem(key)
}
