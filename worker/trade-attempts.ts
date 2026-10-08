import { keccak256, type Hex } from 'viem'
import { RouteError } from './binance-trading.ts'
import type { AccountNamespace } from './env.ts'
import { rejectedTradeReason } from '../lib/trade-execution.ts'

export async function tradeAttempt(accounts: AccountNamespace, userId: string, plan: { requestId: string; typedDataHash: Hex }, signature: string,
  action: 'get' | 'start' | 'complete' | 'fail', orderId?: string, failureReason?: string): Promise<{ started: boolean; orderId: string | null; failureReason?: string }> {
  if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) throw new RouteError('invalid_order_signature', 400)
  const response = await accounts.get(accounts.idFromName(userId)).fetch(new Request('https://account.internal/trade-attempt', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Privy-DID': userId },
    body: JSON.stringify({ action, requestId: plan.requestId, typedDataHash: plan.typedDataHash, signatureHash: keccak256(signature as Hex), ...(orderId ? { orderId } : {}), ...(failureReason ? { failureReason } : {}) }),
  }))
  if (!response.ok) throw new RouteError('submission_unknown')
  const value = await response.json() as { started?: boolean; orderId?: string | null; failureReason?: string }
  if (typeof value.started !== 'boolean' || value.orderId !== null && (typeof value.orderId !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(value.orderId))) throw new RouteError('submission_unknown')
  if (value.failureReason !== undefined && !rejectedTradeReason(value.failureReason)) throw new RouteError('submission_unknown')
  return { started: value.started, orderId: value.orderId, ...(value.failureReason ? { failureReason: value.failureReason } : {}) }
}
