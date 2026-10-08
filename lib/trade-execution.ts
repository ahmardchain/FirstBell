import { validateAgentTradePlan, type AgentOrder, type AgentTradePlan, type OrderTypedData } from './agent-trading.ts'
import type { Hex } from 'viem'
import type { PaymentToken } from './trade-assets.ts'

export type ReviewedTrade = { symbol: string; side: 'buy' | 'sell'; amount: string; walletAddress: string; paymentToken?: PaymentToken }
export type SignedTradeAttempt = { plan: AgentTradePlan; signature: string }

// These responses explicitly reject this signed order. Timeouts, server faults,
// missing acknowledgements and missing status rows never imply failure.
export const rejectedTradeReason = (reason: unknown): reason is string => typeof reason === 'string' && [
  'order_fee_changed', 'stale_quote', 'insufficient_balance', 'approval_required', 'invalid_order_signature', 'invalid_order_payload',
  'minimum_order_not_met', 'liquidity_unavailable', 'token_unavailable',
  'skill_checks_unavailable', 'skill_security_blocked', 'skill_asset_unavailable', 'skill_checks_changed',
].includes(reason)
type ExecutionPorts = {
  assertWallet: (owner: string) => void
  switchChain: () => Promise<void>
  approve: (approval: NonNullable<AgentTradePlan['approval']>, plan: AgentTradePlan) => Promise<Hex>
  waitApproval: (hash: Hex) => Promise<{ status: string }>
  signing: (data: OrderTypedData) => Promise<string>
  onApproval: () => void
  onSigned: (attempt: SignedTradeAttempt) => void
  submit: (attempt: SignedTradeAttempt) => Promise<AgentOrder>
  continueAfterApproval?: boolean
  nextApproval?: (plan: AgentTradePlan) => Promise<AgentTradePlan>
}

// Called only by an explicit Confirm action. Preparation never uses these ports.
// Revalidate against the user's input, rather than deriving consent from the plan.
export async function executeReviewedTrade(value: unknown, request: ReviewedTrade, ports: ExecutionPorts): Promise<
  { kind: 'approval' } | { kind: 'order'; order: AgentOrder }
> {
  let plan = validateAgentTradePlan(value, request)
  ports.assertWallet(request.walletAddress)
  await ports.switchChain()
  ports.assertWallet(request.walletAddress)
  for (let step = 0; plan.approval && step < 2; step++) {
    const hash = await ports.approve(plan.approval, plan)
    ports.assertWallet(request.walletAddress)
    ports.onApproval()
    const receipt = await ports.waitApproval(hash)
    ports.assertWallet(request.walletAddress)
    if (receipt.status !== 'success') throw new Error('approval_failed')
    if (!ports.continueAfterApproval) return { kind: 'approval' }
    if (!plan.approval.reset) break
    if (!ports.nextApproval) throw new Error('approval_required')
    const next = validateAgentTradePlan(await ports.nextApproval(plan), request)
    ports.assertWallet(request.walletAddress)
    // Approval refresh can only change permission/nonce, never the consented order.
    if (next.typedDataHash !== plan.typedDataHash || next.requestId !== plan.requestId || next.orderQuoteId !== plan.orderQuoteId
      || next.expiresAt !== plan.expiresAt || next.approval?.reset) throw new Error('invalid_order_payload')
    plan = next
  }
  if (Date.parse(plan.expiresAt) <= Date.now() + 5_000) throw new Error('stale_quote')
  const reviewed = validateAgentTradePlan(plan, request)
  const signature = await ports.signing(reviewed.typedData)
  ports.assertWallet(request.walletAddress)
  const attempt = { plan: reviewed, signature }
  ports.onSigned(attempt)
  const order = await ports.submit(attempt)
  ports.assertWallet(request.walletAddress)
  return { kind: 'order', order }
}
