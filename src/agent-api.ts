import { validateAgentTradePlan, type AgentOrder, type AgentTradePlan } from '../lib/agent-trading.ts'
import type { WalletSession } from '../lib/wallet-session.ts'
import { PREPARE_TIMEOUT_MS } from '../lib/quote-timeout.ts'
import { TradeRequestError } from '../lib/trade-error.ts'

async function post(path: 'prepare' | 'submit' | 'status', body: Record<string, unknown>, session: WalletSession, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const timeout = AbortSignal.timeout(path === 'prepare' ? PREPARE_TIMEOUT_MS : 30_000)
  try {
    const response = await fetch(`/api/trade/${path}`, { method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}`, 'privy-id-token': session.identityToken },
      body: JSON.stringify(body), signal: signal ? AbortSignal.any([timeout, signal]) : timeout })
    const raw: unknown = await response.json()
    const result = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null
    if (!response.ok) throw new TradeRequestError(typeof result?.error === 'string' ? result.error : 'provider_error', result?.minimumUsd)
    if (!result) throw new Error('invalid_provider_response')
    return result
  } catch (error) {
    if (timeout.aborted && !signal?.aborted) throw new Error(path === 'submit' ? 'submission_unknown' : 'quote_timeout')
    throw error
  }
}

export async function prepareTrade(input: { symbol: string; side: 'buy' | 'sell'; amount: string; walletAddress: string }, session: WalletSession, signal?: AbortSignal): Promise<AgentTradePlan> {
  const result = await post('prepare', input, session, signal)
  return validateAgentTradePlan(result.plan, input)
}

function orderResponse(value: unknown): AgentOrder {
  const order = value as AgentOrder
  if (!order || !/^[A-Za-z0-9_-]{1,256}$/.test(order.orderId)
    || !['PENDING_VENDOR', 'PENDING_ONCHAIN', 'CONFIRMING', 'FILLED', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(order.status)
    || typeof order.receiptToken !== 'string' || !order.receiptToken || order.receiptToken.length > 20_000
    || (order.txHash !== null && !/^0x[a-fA-F0-9]{64}$/.test(order.txHash))
    || (order.status === 'FILLED' && (!order.txHash || !/^\d+(?:\.\d+)?$/.test(order.inputAmount ?? '') || !/^\d+(?:\.\d+)?$/.test(order.outputAmount ?? '')))) throw new Error('invalid_provider_response')
  return order
}
export async function submitTrade(plan: AgentTradePlan, signature: string, session: WalletSession): Promise<AgentOrder> {
  const result = await post('submit', { planToken: plan.planToken, signature, walletAddress: plan.route.walletAddress }, session)
  return orderResponse(result.order)
}
export async function checkTrade(order: AgentOrder, walletAddress: string, session: WalletSession, signal?: AbortSignal): Promise<AgentOrder> {
  const result = await post('status', { receiptToken: order.receiptToken, walletAddress }, session, signal)
  const checked = orderResponse(result.order)
  if (checked.orderId !== order.orderId || checked.receiptToken !== order.receiptToken) throw new Error('invalid_provider_response')
  return checked
}
