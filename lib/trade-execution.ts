import { validateAgentTradePlan, type AgentOrder, type AgentTradePlan, type OrderTypedData } from './agent-trading.ts'
import type { Hex } from 'viem'

export type ReviewedTrade = { symbol: string; side: 'buy' | 'sell'; amount: string; walletAddress: string }
export type SignedTradeAttempt = { plan: AgentTradePlan; signature: string }
type ExecutionPorts = {
  assertWallet: (owner: string) => void
  switchChain: () => Promise<void>
  approve: (approval: NonNullable<AgentTradePlan['approval']>) => Promise<Hex>
  waitApproval: (hash: Hex) => Promise<{ status: string }>
  signing: (data: OrderTypedData) => Promise<string>
  onApproval: () => void
  onSigned: (attempt: SignedTradeAttempt) => void
  submit: (attempt: SignedTradeAttempt) => Promise<AgentOrder>
}

// Called only by an explicit Confirm action. Preparation never uses these ports.
// Revalidate against the user's input, rather than deriving consent from the plan.
export async function executeReviewedTrade(value: unknown, request: ReviewedTrade, ports: ExecutionPorts): Promise<
  { kind: 'approval' } | { kind: 'order'; order: AgentOrder }
> {
  const plan = validateAgentTradePlan(value, request)
  ports.assertWallet(request.walletAddress)
  await ports.switchChain()
  ports.assertWallet(request.walletAddress)
  if (plan.approval) {
    const hash = await ports.approve(plan.approval)
    ports.assertWallet(request.walletAddress)
    ports.onApproval()
    const receipt = await ports.waitApproval(hash)
    ports.assertWallet(request.walletAddress)
    if (receipt.status !== 'success') throw new Error('approval_failed')
    // Approval changes wallet state. A fresh quote and another explicit review
    // are required; never sign an order automatically after approving a token.
    return { kind: 'approval' }
  }
  const reviewed = validateAgentTradePlan(plan, request)
  const signature = await ports.signing(reviewed.typedData)
  ports.assertWallet(request.walletAddress)
  const attempt = { plan: reviewed, signature }
  ports.onSigned(attempt)
  const order = await ports.submit(attempt)
  ports.assertWallet(request.walletAddress)
  return { kind: 'order', order }
}
