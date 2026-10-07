import { validateAgentTradePlan, type AgentOrder, type AgentTradePlan } from '../lib/agent-trading.ts'
import type { WalletSession } from '../lib/wallet-session.ts'
import { PREPARE_TIMEOUT_MS } from '../lib/quote-timeout.ts'
import { TradeRequestError } from '../lib/trade-error.ts'
import { keccak256, type Hex } from 'viem'
import type { PaymentToken } from '../lib/trade-assets.ts'
import { cowCancellationTypedData } from '../lib/order-cancellation.ts'
import { tokenAddresses } from '../lib/asset-catalog.ts'

async function post(path: 'prepare' | 'submit' | 'status' | 'recover' | 'cancel' | 'approval/submit' | 'approval/refresh', body: Record<string, unknown>, session: WalletSession, signal?: AbortSignal): Promise<Record<string, unknown>> {
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
    if (timeout.aborted && !signal?.aborted) throw new Error(path === 'submit' ? 'submission_unknown' : path === 'cancel' ? 'cancellation_unknown' : path === 'approval/submit' ? 'approval_submission_unknown' : 'quote_timeout')
    if (path === 'cancel' && !(error instanceof TradeRequestError)) throw new Error('cancellation_unknown')
    throw error
  }
}

export async function prepareTrade(input: { symbol: string; side: 'buy' | 'sell'; amount: string; walletAddress: string; paymentToken?: PaymentToken; sponsorApproval?: boolean }, session: WalletSession, signal?: AbortSignal): Promise<AgentTradePlan> {
  const result = await post('prepare', input, session, signal)
  return validateAgentTradePlan(result.plan, input)
}

export async function relayApproval(plan: AgentTradePlan, rawTransaction: Hex, session: WalletSession, retry = false): Promise<Hex> {
  const result = await post('approval/submit', { planToken: plan.planToken, walletAddress: plan.route.walletAddress, rawTransaction, retry }, session)
  const approval = result.approval as { hash?: string; status?: string } | undefined
  const hash = keccak256(rawTransaction)
  if (approval?.hash?.toLowerCase() !== hash.toLowerCase() || !['pending', 'unknown'].includes(approval.status ?? '')) throw new Error('approval_submission_unknown')
  // Even 'pending' is only an acknowledgement. A real receipt is still required.
  return hash
}

export async function refreshApproval(plan: AgentTradePlan, session: WalletSession): Promise<AgentTradePlan> {
  const result = await post('approval/refresh', { planToken: plan.planToken, walletAddress: plan.route.walletAddress }, session)
  const paymentToken = (plan.route.side === 'buy' ? plan.route.inputSymbol : plan.route.outputSymbol) as PaymentToken
  const next = validateAgentTradePlan(result.plan, { symbol: plan.route.symbol, side: plan.route.side, amount: plan.route.inputAmount, walletAddress: plan.route.walletAddress, paymentToken })
  if (next.typedDataHash !== plan.typedDataHash || next.requestId !== plan.requestId || next.orderQuoteId !== plan.orderQuoteId || next.expiresAt !== plan.expiresAt) throw new Error('invalid_order_payload')
  return next
}

function orderResponse(value: unknown): AgentOrder {
  const order = value as AgentOrder
  if (!order || !/^[A-Za-z0-9_-]{1,256}$/.test(order.orderId)
    || !['PENDING_VENDOR', 'PENDING_ONCHAIN', 'CONFIRMING', 'FILLED', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(order.status)
    || typeof order.receiptToken !== 'string' || !order.receiptToken || order.receiptToken.length > 20_000
    || (order.txHash !== null && !/^0x[a-fA-F0-9]{64}$/.test(order.txHash))
    || (order.status === 'FILLED' && (!order.txHash || !/^\d+(?:\.\d+)?$/.test(order.inputAmount ?? '') || !/^\d+(?:\.\d+)?$/.test(order.outputAmount ?? '')))) throw new Error('invalid_provider_response')
  const trade = order.trade
  if (trade && (!Object.hasOwn(tokenAddresses, trade.symbol) || !['buy', 'sell'].includes(trade.side)
    || !/^\d+(?:\.\d+)?$/.test(trade.amount) || !['USDT', 'USDC'].includes(trade.side === 'buy' ? trade.inputSymbol : trade.outputSymbol)
    || (trade.side === 'buy' ? trade.outputSymbol : trade.inputSymbol) !== trade.symbol
    || !['binance-web3', 'cow-protocol'].includes(trade.source) || !Number.isFinite(Date.parse(trade.expiresAt)))) throw new Error('invalid_provider_response')
  if (trade?.quotedOutputAmount !== undefined && !/^\d+(?:\.\d+)?$/.test(trade.quotedOutputAmount)
    || trade?.requestId !== undefined && !/^[a-f0-9-]{36}$/.test(trade.requestId)
    || order.createdAt !== undefined && (!Number.isFinite(Date.parse(order.createdAt)) || Date.parse(order.createdAt) > Date.now() + 120_000)) throw new Error('invalid_provider_response')
  if (order.canCancel !== undefined && typeof order.canCancel !== 'boolean'
    || order.cancellationRequested !== undefined && typeof order.cancellationRequested !== 'boolean'
    || order.canCancel && (!trade || trade.source !== 'cow-protocol' || order.status !== 'PENDING_VENDOR')) throw new Error('invalid_provider_response')
  return order
}
export async function cancelTradeOrder(order: AgentOrder, walletAddress: string, signature: string, session: WalletSession): Promise<AgentOrder> {
  cowCancellationTypedData(order.orderId, walletAddress)
  const result = await post('cancel', { receiptToken: order.receiptToken, walletAddress, signature }, session)
  const checked = orderResponse(result.order)
  if (checked.orderId !== order.orderId || checked.receiptToken !== order.receiptToken) throw new Error('invalid_provider_response')
  return checked
}
export async function submitTrade(plan: AgentTradePlan, signature: string, session: WalletSession): Promise<AgentOrder> {
  const result = await post('submit', { planToken: plan.planToken, signature, walletAddress: plan.route.walletAddress }, session)
  return orderResponse(result.order)
}
export async function recoverTrade(plan: AgentTradePlan, signature: string, session: WalletSession): Promise<AgentOrder | null> {
  const result = await post('recover', { planToken: plan.planToken, signature, walletAddress: plan.route.walletAddress }, session)
  return result.order === null ? null : orderResponse(result.order)
}
export async function checkTrade(order: AgentOrder, walletAddress: string, session: WalletSession, signal?: AbortSignal): Promise<AgentOrder> {
  const result = await post('status', { receiptToken: order.receiptToken, walletAddress }, session, signal)
  const checked = orderResponse(result.order)
  if (checked.orderId !== order.orderId || checked.receiptToken !== order.receiptToken) throw new Error('invalid_provider_response')
  return checked
}
