import { decodeFunctionData, erc20Abi, keccak256, parseTransaction, recoverTransactionAddress, toHex, type Address, type Hex, type TransactionSerializedLegacy } from 'viem'
import { COW_RELAYER, type AgentTradePlan } from '../lib/agent-trading.ts'
import { tokenAddresses } from '../lib/asset-catalog.ts'
import { isPaymentToken, tradeCash } from '../lib/trade-assets.ts'
import { RouteError, tradingClient } from './binance-trading.ts'
import type { ApiEnv } from './env.ts'
import { validateWithdrawalPlan, type WithdrawalPlan } from '../lib/withdrawal.ts'

type Plan = Omit<AgentTradePlan, 'planToken'>
type Approval = NonNullable<Plan['approval']>
const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()
export function megaFuelConfigured(env: ApiEnv) {
  return /^[A-Za-z0-9_-]{8,256}$/.test(env.MEGAFUEL_API_KEY ?? '') && /^[a-fA-F0-9-]{36}$/.test(env.MEGAFUEL_POLICY_UUID ?? '')
}

// Private policy only. Never expose the endpoint key/UUID or provide an RPC proxy.
async function rpc(env: ApiEnv, method: string, params: unknown[], signal?: AbortSignal): Promise<unknown> {
  if (!megaFuelConfigured(env)) throw new RouteError('sponsorship_not_configured')
  try {
    const response = await fetch(`https://open-platform-ap.nodereal.io/${env.MEGAFUEL_API_KEY}/megafuel/56`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'FirstBell/0.1.0', 'X-MegaFuel-Policy-Uuid': env.MEGAFUEL_POLICY_UUID! },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000),
    })
    if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 12_000) throw new Error('rpc')
    const text = await response.text()
    if (text.length > 12_000) throw new Error('rpc')
    const result = JSON.parse(text)
    if (result?.jsonrpc !== '2.0' || result.id !== 1 || result.error || !Object.hasOwn(result, 'result')) throw new Error('rpc')
    return result.result
  } catch {
    // Provider messages can contain endpoint credentials. Return fixed errors only.
    throw new RouteError(method === 'eth_sendRawTransaction' ? 'approval_submission_unknown' : 'sponsorship_unavailable')
  }
}

export function validateApprovalAction(plan: Plan, approval: Approval) {
  const cashSymbol = plan.route.side === 'buy' ? plan.route.inputSymbol : plan.route.outputSymbol
  if (!isPaymentToken(cashSymbol)) throw new RouteError('invalid_order_payload', 400)
  const token = plan.route.side === 'buy' ? tradeCash(cashSymbol).address : tokenAddresses[plan.route.symbol]
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: approval.data })
    if (!token || approval.chainId !== 56 || approval.value !== '0' || !same(approval.to, token) || !same(approval.spender, COW_RELAYER)
      || approval.data.length !== 138 || decoded.functionName !== 'approve' || !same(decoded.args[0], COW_RELAYER)
      || decoded.args[1] !== BigInt(approval.reset ? '0' : plan.rawAmount) || approval.amount !== decoded.args[1].toString()) throw new Error('action')
  } catch { throw new RouteError('invalid_sponsored_transaction', 400) }
}

async function checkPolicy(approval: { to: string; data: Hex; sponsorship: { gas: string } }, owner: string, env: ApiEnv, signal?: AbortSignal) {
  const gas = BigInt(approval.sponsorship.gas)
  const response = await rpc(env, 'pm_isSponsorable', [{ from: owner, to: approval.to, data: approval.data, value: '0x0', gas: toHex(gas) }], signal)
  if (!response || typeof response !== 'object' || Array.isArray(response)) throw new RouteError('sponsorship_unavailable')
  const result = response as Record<string, unknown>
  // MegaFuel's live response uses lowercase; BNB's API spec and the older
  // NodeReal SDK use uppercase. Require an explicit, unambiguous boolean.
  const lower = Object.hasOwn(result, 'sponsorable'), legacy = Object.hasOwn(result, 'Sponsorable')
  if ((!lower && !legacy) || (lower && typeof result.sponsorable !== 'boolean')
    || (legacy && typeof result.Sponsorable !== 'boolean')
    || (lower && legacy && result.sponsorable !== result.Sponsorable)) throw new RouteError('sponsorship_unavailable')
  if (!(lower ? result.sponsorable : result.Sponsorable)) throw new RouteError('sponsorship_rejected', 409)
}

export async function sponsorApproval(approval: Approval, owner: Address, estimatedGas: bigint, env: ApiEnv, signal?: AbortSignal): Promise<Approval> {
  const gas = (estimatedGas * 12n + 9n) / 10n
  if (gas < 21_000n || gas > 200_000n) throw new RouteError('invalid_sponsored_transaction', 400)
  const prepared: Approval = { ...approval, gasFeeBnb: '0', sponsorship: { provider: 'megafuel', gas: gas.toString(), nonce: 0 } }
  // MegaFuel's pending nonce includes its own transaction pool; a normal RPC does not.
  const [, nonceHex] = await Promise.all([checkPolicy({ ...prepared, sponsorship: prepared.sponsorship! }, owner, env, signal), rpc(env, 'eth_getTransactionCount', [owner, 'pending'], signal)])
  if (typeof nonceHex !== 'string' || !/^0x[0-9a-fA-F]+$/.test(nonceHex) || BigInt(nonceHex) > BigInt(Number.MAX_SAFE_INTEGER)) throw new RouteError('sponsorship_unavailable')
  return { ...prepared, sponsorship: { ...prepared.sponsorship!, nonce: Number(BigInt(nonceHex)) } }
}

export async function validateSignedApproval(plan: Plan, raw: unknown): Promise<{ raw: Hex; hash: Hex }> {
  const approval = plan.approval
  if (!approval?.sponsorship || typeof raw !== 'string' || !/^0x[0-9a-fA-F]+$/.test(raw) || raw.length > 1_024) throw new RouteError('invalid_sponsored_transaction', 400)
  validateApprovalAction(plan, approval)
  try {
    const tx = parseTransaction(raw as Hex)
    if (tx.type !== 'legacy' || tx.chainId !== 56 || tx.nonce !== approval.sponsorship.nonce || !same(tx.to, approval.to)
      // Legacy RLP encodes zero as an empty integer; viem omits that field.
      || tx.data?.toLowerCase() !== approval.data.toLowerCase() || (tx.value ?? 0n) !== 0n || (tx.gasPrice ?? 0n) !== 0n
      || tx.gas !== BigInt(approval.sponsorship.gas) || tx.gas < 21_000n || tx.gas > 200_000n
      || !same(await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerializedLegacy }), plan.route.walletAddress)) throw new Error('transaction')
    return { raw: raw as Hex, hash: keccak256(raw as Hex) }
  } catch { throw new RouteError('invalid_sponsored_transaction', 400) }
}

export async function relaySponsoredApproval(plan: Plan, raw: unknown, env: ApiEnv, retry = false) {
  const signed = await validateSignedApproval(plan, raw)
  if (retry) {
    // A lost acknowledgement must not make a mined transaction depend on an
    // expired quote or a subsequently empty sponsor. The client still checks receipt.
    try { await tradingClient.getTransactionReceipt({ hash: signed.hash }); return { hash: signed.hash, status: 'pending' as const } }
    catch { /* A missing receipt is not success; retry only the identical signed bytes. */ }
  }
  if (Date.parse(plan.expiresAt) <= Date.now() + 5_000) throw new RouteError('stale_quote', 409)
  const [, nonce] = await Promise.all([checkPolicy({ ...plan.approval!, sponsorship: plan.approval!.sponsorship! }, plan.route.walletAddress, env), retry ? Promise.resolve(null) : rpc(env, 'eth_getTransactionCount', [plan.route.walletAddress, 'pending'])])
  if (!retry && (typeof nonce !== 'string' || !/^0x[0-9a-fA-F]+$/.test(nonce) || BigInt(nonce) !== BigInt(plan.approval!.sponsorship!.nonce))) throw new RouteError('approval_nonce_changed', 409)
  try {
    const result = await rpc(env, 'eth_sendRawTransaction', [signed.raw])
    if (!same(result, signed.hash)) throw new Error('hash')
    return { hash: signed.hash, status: 'pending' as const }
  } catch {
    // A timeout/RPC error after dispatch is ambiguous. Never replace nonce or
    // charge BNB as a fallback. Recovery keeps this deterministic transaction hash.
    return { hash: signed.hash, status: 'unknown' as const }
  }
}

// Withdrawal-specific exports keep the private RPC from becoming a generic gas
// sponsor. Both callers validate the fixed USDT transfer, not arbitrary calldata.
export async function sponsorWithdrawal(plan: WithdrawalPlan, env: ApiEnv, signal?: AbortSignal) {
  validateWithdrawalPlan(plan, plan)
  if (!plan.sponsored) throw new RouteError('invalid_withdrawal_plan', 400)
  const [, nonceHex] = await Promise.all([
    checkPolicy({ to: plan.tokenAddress, data: plan.data, sponsorship: { gas: plan.gas } }, plan.walletAddress, env, signal),
    rpc(env, 'eth_getTransactionCount', [plan.walletAddress, 'pending'], signal),
  ])
  if (typeof nonceHex !== 'string' || !/^0x[0-9a-fA-F]+$/.test(nonceHex) || BigInt(nonceHex) > BigInt(Number.MAX_SAFE_INTEGER)) throw new RouteError('sponsorship_unavailable')
  return Number(BigInt(nonceHex))
}

export async function relayMegaFuelWithdrawal(plan: WithdrawalPlan, raw: Hex, retry: boolean, env: ApiEnv, beforeDispatch: () => Promise<void>) {
  // Signed bytes are also independently validated by the withdrawal handler.
  const nonce = await sponsorWithdrawal(plan, env)
  if (!retry && nonce !== plan.nonce) throw new RouteError('withdrawal_nonce_changed', 409)
  await beforeDispatch()
  try {
    const result = await rpc(env, 'eth_sendRawTransaction', [raw])
    return same(result, keccak256(raw)) ? 'pending' as const : 'unknown' as const
  } catch { return 'unknown' as const }
}
