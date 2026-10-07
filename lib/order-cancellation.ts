import { type Hex } from 'viem'
import { COW_SETTLEMENT, type AgentOrder } from './agent-trading.ts'

// The non-deprecated CoW API signs a batch, even when cancelling one order.
// Never accept arbitrary domain/type fields or additional order UIDs to sign.
export function cowCancellationTypedData(orderId: string, owner: string) {
  if (!/^0x[a-fA-F0-9]{112}$/.test(orderId) || !/^0x[a-fA-F0-9]{40}$/.test(owner)
    || orderId.slice(66, 106).toLowerCase() !== owner.slice(2).toLowerCase()) throw new Error('invalid_order_payload')
  return { domain: { name: 'Gnosis Protocol', version: 'v2', chainId: 56, verifyingContract: COW_SETTLEMENT },
    types: { OrderCancellations: [{ name: 'orderUids', type: 'bytes[]' }] },
    primaryType: 'OrderCancellations' as const, message: { orderUids: [orderId as Hex] } }
}

// Off-chain cancellation is best effort. A provider-cancelled order still
// needs reconciliation: an already in-flight settlement can fill later.
export const needsOrderCheck = (order: AgentOrder) => !['FILLED', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(order.status)
  || order.status === 'CANCELLED' && order.trade?.source === 'cow-protocol'
