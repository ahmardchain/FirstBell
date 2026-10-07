import * as React from 'react'
import { getIdentityToken, useIdentityToken, usePrivy, useSignTransaction, type ConnectedWallet } from '@privy-io/react-auth'
import { keccak256 } from 'viem'
import { withWalletSession, type WalletSession } from '../lib/wallet-session.ts'
import { sameAddress, validateWithdrawalPlan, validateWithdrawalResult, withdrawalInput, type WithdrawalAttempt, type WithdrawalInput, type WithdrawalPlan, type WithdrawalResult } from '../lib/withdrawal.ts'
import { storeWithdrawalHistory } from '../lib/withdrawal-history.ts'

type Phase = 'edit' | 'preparing' | 'review' | 'signing' | 'processing' | 'uncertain' | 'completed' | 'failed'
export type WithdrawalController = {
  phase: Phase; plan: WithdrawalPlan | null; result: WithdrawalResult | null; error: string;
  locked: boolean; expired: boolean; busy: boolean; canRecover: boolean;
  review: (recipient: string, amount: string) => Promise<void>; confirm: () => Promise<void>;
  reset: () => void; recover: (retry?: boolean) => Promise<void>;
}

async function post(path: 'prepare' | 'submit' | 'status', body: Record<string, unknown>, session: WalletSession, signal?: AbortSignal) {
  try {
    const response = await fetch(`/api/withdrawals/${path}`, { method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}`, 'privy-id-token': session.identityToken },
      body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000) })
    const value = await response.json() as Record<string, unknown>
    if (!response.ok) throw new Error(typeof value?.error === 'string' ? value.error : 'withdrawal_unavailable')
    return value
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError' && error.name !== 'TimeoutError' && error.name !== 'TypeError' && error.name !== 'SyntaxError') throw error
    throw new Error(path === 'submit' ? 'withdrawal_submission_unknown' : 'withdrawal_unavailable')
  }
}
export async function prepareWithdrawal(input: WithdrawalInput, session: WalletSession, signal?: AbortSignal) {
  return validateWithdrawalPlan((await post('prepare', input, session, signal)).plan, input)
}
export async function sendWithdrawal(attempt: WithdrawalAttempt, session: WalletSession) {
  const result = await post('submit', { walletAddress: attempt.plan.walletAddress, planToken: attempt.plan.planToken, rawTransaction: attempt.rawTransaction }, session)
  return validateWithdrawalResult(result.withdrawal, keccak256(attempt.rawTransaction))
}
export async function getWithdrawal(attempt: WithdrawalAttempt, session: WalletSession, signal?: AbortSignal) {
  const result = await post('status', { walletAddress: attempt.plan.walletAddress, planToken: attempt.plan.planToken, rawTransaction: attempt.rawTransaction }, session, signal)
  return validateWithdrawalResult(result.withdrawal, keccak256(attempt.rawTransaction))
}
const preDispatchErrors = new Set(['invalid_withdrawal_signature', 'invalid_withdrawal_plan', 'invalid_withdrawal_ticket', 'withdrawal_expired', 'withdrawal_nonce_changed', 'insufficient_balance', 'insufficient_gas', 'sponsorship_not_configured', 'sponsorship_rejected', 'sponsorship_unavailable', 'wallet_not_verified', 'wallet_verification_not_configured', 'withdrawal_not_configured', 'unauthorized', 'rate_limited'])
const storageKey = (owner: string) => `firstbell-usdt-withdrawal:v1:${owner.toLowerCase()}`

export function useWithdrawals(address: string | undefined, wallet: ConnectedWallet | undefined, onComplete: () => void): WithdrawalController {
  const { getAccessToken } = usePrivy(), { identityToken } = useIdentityToken(), { signTransaction } = useSignTransaction()
  const [phase, setPhase] = React.useState<Phase>('edit')
  const [plan, setPlan] = React.useState<WithdrawalPlan | null>(null)
  const [result, setResult] = React.useState<WithdrawalResult | null>(null)
  const [error, setError] = React.useState('')
  const [expired, setExpired] = React.useState(false)
  const [recovering, setRecovering] = React.useState(false)
  const attempt = React.useRef<WithdrawalAttempt | null>(null), busy = React.useRef(false), revision = React.useRef(0)
  const preparation = React.useRef<AbortController | null>(null)
  const live = React.useRef({ address, wallet, identityToken, getAccessToken, signTransaction, onComplete, mounted: true })
  live.current = { address, wallet, identityToken, getAccessToken, signTransaction, onComplete, mounted: true }
  const assertOwner = (owner: string) => { if (!live.current.mounted || !sameAddress(live.current.address, owner)) throw new Error('wallet_changed') }
  const session = React.useCallback(<T,>(owner: string, action: (session: WalletSession) => Promise<T>, signal?: AbortSignal) => withWalletSession({
    getAccessToken: () => live.current.getAccessToken(), getIdentityToken: () => live.current.identityToken, refreshIdentityToken: getIdentityToken,
  }, value => { assertOwner(owner); return action(value) }, signal), [])
  const persist = (value: WithdrawalAttempt | null, owner: string) => {
    if (sameAddress(live.current.address, owner)) attempt.current = value
    try {
      if (value) localStorage.setItem(storageKey(owner), JSON.stringify(value))
      else localStorage.removeItem(storageKey(owner))
    } catch { /* The exact signed bytes are retained in memory for this session. */ }
  }
  const applyResult = (value: WithdrawalResult, current: WithdrawalAttempt) => {
    assertOwner(current.plan.walletAddress)
    try { storeWithdrawalHistory(localStorage, current.plan, value) } catch { /* Keep the current withdrawal visible if storage is unavailable. */ }
    setResult(value); setError('')
    if (value.status === 'completed' || value.status === 'failed') {
      persist(null, current.plan.walletAddress)
      setPhase(value.status === 'completed' ? 'completed' : 'failed')
      live.current.onComplete()
    } else if (value.status === 'not_submitted' && Date.parse(current.plan.expiresAt) <= Date.now() + 5_000) {
      persist(null, current.plan.walletAddress); setPlan(null); setPhase('edit'); setError('withdrawal_expired')
    } else setPhase(value.status === 'unknown' || value.status === 'not_submitted' ? 'uncertain' : 'processing')
  }
  React.useEffect(() => {
    live.current.mounted = true
    revision.current++; busy.current = false; preparation.current?.abort()
    attempt.current = null; setPlan(null); setResult(null); setError(''); setExpired(false); setRecovering(false); setPhase('edit')
    if (address) {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey(address)) ?? 'null') as WithdrawalAttempt | null
        if (stored) {
          if (!sameAddress(stored.plan?.walletAddress, address) || typeof stored.rawTransaction !== 'string' || !/^0x(?:[0-9a-fA-F]{2})+$/.test(stored.rawTransaction) || stored.rawTransaction.length > 1024) throw new Error('invalid_recovery')
          validateWithdrawalPlan(stored.plan, stored.plan)
          attempt.current = stored; setPlan(stored.plan); setResult({ hash: keccak256(stored.rawTransaction), status: 'unknown' }); setPhase('uncertain')
          try { storeWithdrawalHistory(localStorage, stored.plan, { hash: keccak256(stored.rawTransaction), status: 'unknown' }) } catch { /* Recovery remains in memory. */ }
        }
      } catch { setError('withdrawal_recovery_unavailable'); setPhase('uncertain') }
    }
    return () => { revision.current++; preparation.current?.abort(); live.current.mounted = false }
  }, [address])
  React.useEffect(() => {
    if (phase !== 'review' || !plan) { setExpired(false); return }
    const remaining = Date.parse(plan.expiresAt) - Date.now() - 5_000
    setExpired(remaining <= 0)
    if (remaining <= 0) return
    const timer = window.setTimeout(() => setExpired(true), remaining)
    return () => window.clearTimeout(timer)
  }, [phase, plan])
  React.useEffect(() => {
    if (phase !== 'processing' || !address || !attempt.current) return
    const current = attempt.current, owner = address, started = Date.now(), version = revision.current
    const controller = new AbortController()
    let timer: number | undefined
    const poll = async () => {
      try {
        const checked = await session(owner, value => getWithdrawal(current, value, controller.signal), controller.signal)
        if (controller.signal.aborted || version !== revision.current) return
        if (['completed', 'failed', 'unknown', 'not_submitted'].includes(checked.status)) { applyResult(checked, current); return }
        setResult(checked)
      } catch {
        if (controller.signal.aborted || version !== revision.current) return
        setError('withdrawal_submission_unknown'); setPhase('uncertain'); return
      }
      if (Date.now() - started >= 60_000) { setError('withdrawal_timeout'); setPhase('uncertain'); return }
      timer = window.setTimeout(() => void poll(), 3_000)
    }
    timer = window.setTimeout(() => void poll(), 1_000)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [phase, address, session])

  const reset = () => {
    if (attempt.current || ['signing', 'processing', 'uncertain'].includes(phase)) return
    busy.current = false
    revision.current++; preparation.current?.abort(); setPlan(null); setResult(null); setError(''); setExpired(false); setPhase('edit')
  }
  const review = async (recipient: string, amount: string) => {
    if (!address || !wallet || busy.current || attempt.current || phase !== 'edit') return
    busy.current = true; const version = ++revision.current, owner = address
    preparation.current?.abort(); const controller = new AbortController(); preparation.current = controller
    setPhase('preparing'); setError(''); setResult(null)
    try {
      const input = withdrawalInput({ walletAddress: owner, recipient, amount })
      const prepared = await session(owner, value => prepareWithdrawal({ walletAddress: input.walletAddress, recipient: input.recipient, amount: input.amount }, value, controller.signal), controller.signal)
      assertOwner(owner)
      if (version === revision.current) { setPlan(prepared); setPhase('review') }
    } catch (failure) { if (version === revision.current && sameAddress(live.current.address, owner)) { setError(failure instanceof Error ? failure.message : 'withdrawal_unavailable'); setPhase('edit') } }
    finally { if (version === revision.current) busy.current = false }
  }
  const confirm = async () => {
    if (phase !== 'review' || !plan || !address || !wallet || busy.current || attempt.current || expired) return
    busy.current = true; const version = ++revision.current, owner = address, reviewed = plan
    setPhase('signing'); setError('')
    let signed: WithdrawalAttempt | null = null
    try {
      assertOwner(owner)
      if (Date.parse(reviewed.expiresAt) <= Date.now() + 5_000) throw new Error('withdrawal_expired')
      await wallet.switchChain(56); assertOwner(owner)
      const { signature: rawTransaction } = await signTransaction({ type: 0, chainId: 56, from: owner, to: reviewed.tokenAddress,
        data: reviewed.data, value: 0n, gasLimit: BigInt(reviewed.gas), gasPrice: BigInt(reviewed.gasPrice), nonce: reviewed.nonce },
      { address: owner, uiOptions: { showWalletUIs: false } })
      assertOwner(owner)
      signed = { plan: reviewed, rawTransaction }; persist(signed, owner)
      try { storeWithdrawalHistory(localStorage, reviewed, { hash: keccak256(rawTransaction), status: 'unknown' }) } catch { /* Signed recovery remains available. */ }
      const checked = await session(owner, value => sendWithdrawal(signed!, value))
      if (version === revision.current) applyResult(checked, signed)
    } catch (failure) {
      if (version !== revision.current || !sameAddress(live.current.address, owner)) return
      const reason = failure instanceof Error ? failure.message : 'withdrawal_submission_unknown'
      // Only a definitive server rejection before broadcast permits a new review.
      // A lost response keeps this signature/hash and never creates a new nonce.
      if (signed && !preDispatchErrors.has(reason)) { setResult({ hash: keccak256(signed.rawTransaction), status: 'unknown' }); setPhase('uncertain'); setError('withdrawal_submission_unknown') }
      else if (signed) { try { storeWithdrawalHistory(localStorage, signed.plan, { hash: keccak256(signed.rawTransaction), status: 'not_submitted' }) } catch { /* Optional activity persistence. */ }; persist(null, owner); setPlan(null); setPhase('edit'); setError(reason) }
      else { persist(null, owner); setPlan(null); setPhase('edit'); setError(/reject|cancel|4001/i.test(reason) ? 'wallet_rejected' : reason) }
    } finally { if (version === revision.current) busy.current = false }
  }
  const recover = async (retry = false) => {
    const current = attempt.current
    if (!address || !current || busy.current) return
    busy.current = true; setRecovering(true); setError('')
    const version = ++revision.current, owner = address
    try {
      let checked = await session(owner, value => getWithdrawal(current, value))
      assertOwner(owner)
      if (retry && ['not_submitted', 'pending', 'unknown'].includes(checked.status)) checked = await session(owner, value => sendWithdrawal(current, value))
      if (version === revision.current) applyResult(checked, current)
    } catch (failure) {
      if (version === revision.current && sameAddress(live.current.address, owner)) { setError(failure instanceof Error ? failure.message : 'withdrawal_submission_unknown'); setPhase('uncertain') }
    } finally { if (version === revision.current) { busy.current = false; setRecovering(false) } }
  }
  return { phase, plan, result, error, expired, canRecover: Boolean(attempt.current), locked: ['signing', 'processing', 'uncertain'].includes(phase), busy: ['preparing', 'signing', 'processing'].includes(phase) || recovering, review, confirm, reset, recover }
}
