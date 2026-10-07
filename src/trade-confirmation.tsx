import * as React from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { getIdentityToken, useIdentityToken, usePrivy, useSendTransaction, useSignTransaction, useSignTypedData, useWallets } from '@privy-io/react-auth'
import { Check, ExternalLink, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { createPublicClient, formatUnits, http, keccak256, type Hex } from 'viem'
import { bsc } from 'viem/chains'
import { terminalOrder, type AgentOrder, type AgentTradePlan } from '../lib/agent-trading'
import { executeReviewedTrade, type SignedTradeAttempt } from '../lib/trade-execution'
import { createSessionWarmup } from '../lib/session-warmup'
import { withWalletSession, type WalletSession } from '../lib/wallet-session'
import { PREPARE_TIMEOUT_MS } from '../lib/quote-timeout'
import { createQuoteScheduler } from '../lib/quote-scheduler'
import { TradeRequestError } from '../lib/trade-error'
import { checkTrade, prepareTrade, refreshApproval, relayApproval, submitTrade } from './agent-api'
import type { PaymentToken } from '../lib/trade-assets'
import { displayQuantity } from './wallet-balances'
import { BSC_USDT } from '../lib/funding'
import { useTradeBalance } from './use-trade-balance'
import { clearSignedTrade, clearTradeApproval, storeTradeReceipt } from '../lib/trade-storage'

const client = createPublicClient({ chain: bsc, transport: http('https://bsc-dataseed.bnbchain.org', { timeout: 10_000, retryCount: 0 }) })
const words = {
  en: {
    spend: 'Amount to spend', quantity: 'Token quantity', receive: 'Estimated receive', minimum: 'Minimum receive', fee: 'Order fee · included', wallet: 'Your wallet', expiry: 'Order expires', gas: 'Network fee', sponsored: 'Sponsored', included: 'Included in quote', payWith: 'Payment token',
    empty: 'Enter an amount to get a quote.', loading: 'Getting your quote…', ready: 'Review your trade', expired: 'Quote expired. Get a new quote.', login: 'Log In', walletLoading: 'Preparing your wallet…',
    quote: 'Get quote', retry: 'Retry quote', refresh: 'Refresh quote', confirm: 'Confirm', cancel: 'Cancel', close: 'Done', approve: 'Confirm token approval', reset: 'Reset token approval',
    approvalNote: 'Confirm permits only this amount and places the reviewed order.', resetNote: 'Confirm resets the existing permission, permits only this amount, and places the reviewed order.',
    note: 'Review your order, then confirm purchase.', walletConfirm: 'Processing…', approvalPending: 'Processing…', approvalDone: 'Token permission confirmed. Review a fresh quote.',
    submitting: 'Processing…', checking: 'Checking settlement…', pending: 'Processing — waiting for settlement.', filled: 'Purchased', failed: 'Order did not fill.',
    uncertain: 'Trade status is not confirmed. Check this trade before starting another.', recover: 'Check trade', status: 'Check trade status', tx: 'View transaction', newTrade: 'New trade', disconnected: 'Not connected',
    available: 'Available', balanceLoading: 'Loading balance…', balanceUnavailable: 'Balance unavailable', balanceLogin: 'Log in to see your balance', balanceRefresh: 'Refresh available balance',
    buy: 'Buy', sell: 'Sell', confirmBuy: 'Confirm buy', confirmSell: 'Confirm sell', closeTrade: 'Close trade', closeReview: 'Close confirmation', total: 'You spend', tradeComplete: 'Trade complete',
    minimumOrder: (value: string | null) => value ? `The provider requires a trade worth at least $${value}. Choose an amount that meets it.` : 'This amount is below the provider’s minimum trade value. Choose a larger amount.',
    sponsorshipErrors: { sponsorship_not_configured: 'Network fee coverage is not available yet. No transaction was sent.', sponsorship_rejected: 'Network fee coverage was declined. No transaction was sent.', sponsorship_unavailable: 'Network fee coverage is temporarily unavailable. Retry.', invalid_sponsored_transaction: 'The signed permission does not match this order. Nothing was sent.', approval_nonce_changed: 'Wallet activity changed. Refresh the permission for this order.', approval_submission_unknown: 'Token permission is still unconfirmed. Check this same transaction.', approval_timeout: 'Token permission is taking longer than expected. Check this same transaction.' },
    errors: { insufficient_balance: 'Not enough of the spending token in your wallet.', insufficient_gas: 'Add a little BNB for the network fee.', unauthorized: 'Sign in again and retry.', session_unavailable: 'Your session could not be loaded. Retry.', session_refresh_failed: 'Sign in again to refresh your session.', session_timeout: 'Your sign-in session took too long. Retry.', wallet_not_verified: 'Your wallet could not be verified. Sign in again.', wallet_verification_unavailable: 'Wallet verification is temporarily unavailable.', wallet_verification_not_configured: 'Wallet verification needs to be enabled.', account_not_configured: 'Account verification needs to be configured.', not_configured: 'Trading needs to be configured.', wallet_loading: 'Your wallet is still being prepared.', wallet_changed: 'Your wallet changed. Review a new quote.', wallet_rejected: 'Wallet confirmation cancelled. No order submitted.', quote_timeout: 'The quote took too long. Retry.', no_verified_route: 'No supported route for this token and amount.', chain_unavailable: 'BSC routes are unavailable right now.', market_closed: 'Trading is unavailable while this market is closed.', rate_limited: 'Wait a minute before getting another quote.', stale_quote: 'Quote expired. Get a fresh quote.', invalid_amount: 'Check the amount and its decimal places.', invalid_trade_request: 'Enter a valid amount.', unsupported_order_schema: 'This route cannot be safely signed yet.', invalid_order_payload: 'The order does not match your trade. Get a new quote.', invalid_order_signature: 'The wallet signature does not match this order.', simulation_failed: 'Token approval could not be verified. Nothing was sent.', approval_required: 'Token approval is required. Get a fresh quote.', approval_failed: 'Token approval failed. Get a fresh quote.', settlement_not_verified: 'Settlement could not be verified. Check the order again.', provider_auth_error: 'Trading provider access needs to be checked.', provider_error: 'The trading provider could not complete this request. Retry.' },
  },
  zh: {
    spend: '支付金额', quantity: '代币数量', receive: '预计收到', minimum: '最低接收数量', fee: '已含订单费用', wallet: '你的钱包', expiry: '订单到期时间', gas: '网络费', sponsored: '已赞助', included: '已含在报价中', payWith: '支付代币',
    empty: '请输入金额以获取报价。', loading: '正在获取报价…', ready: '审核交易', expired: '报价已过期，请获取新报价。', login: '登录', walletLoading: '正在准备钱包…',
    quote: '获取报价', retry: '重试报价', refresh: '刷新报价', confirm: '确认', cancel: '取消', close: '完成', approve: '确认代币授权', reset: '重置代币授权',
    approvalNote: '确认后只授权此金额并提交已审核的订单。', resetNote: '确认后重置现有授权，只授权此金额并提交已审核的订单。',
    note: '审核订单后确认购买。', walletConfirm: '处理中…', approvalPending: '处理中…', approvalDone: '代币授权已确认，请审核新报价。',
    submitting: '正在提交订单…', checking: '正在检查结算…', pending: '订单已提交，等待结算。', filled: '交易已在 BNB 智能链上确认。', failed: '订单未成交。',
    uncertain: '交易状态尚未确认。开始新交易前请查询此交易。', recover: '查询交易', status: '查询交易状态', tx: '查看交易', newTrade: '新交易', disconnected: '未连接',
    available: '可用余额', balanceLoading: '正在加载余额…', balanceUnavailable: '余额暂不可用', balanceLogin: '登录以查看余额', balanceRefresh: '刷新可用余额',
    buy: '买入', sell: '卖出', confirmBuy: '确认买入', confirmSell: '确认卖出', closeTrade: '关闭交易', closeReview: '关闭确认', total: '支付数量', tradeComplete: '交易完成',
    minimumOrder: (value: string | null) => value ? `服务商要求交易价值至少为 ${value} 美元。请选择符合要求的金额。` : '此金额低于服务商的最低交易价值，请增加金额。',
    sponsorshipErrors: { sponsorship_not_configured: '网络费代付尚不可用，未发送交易。', sponsorship_rejected: '网络费代付被拒绝，未发送交易。', sponsorship_unavailable: '网络费代付暂不可用，请重试。', invalid_sponsored_transaction: '授权签名与订单不符，未发送交易。', approval_nonce_changed: '钱包活动已改变，请刷新此订单的授权。', approval_submission_unknown: '代币授权尚未确认，请查询同一笔交易。', approval_timeout: '代币授权确认较慢，请查询同一笔交易。' },
    errors: { insufficient_balance: '钱包中的支付代币不足。', insufficient_gas: '请添加少量 BNB 支付网络费用。', unauthorized: '请重新登录后重试。', session_unavailable: '无法加载登录状态，请重试。', session_refresh_failed: '请重新登录以刷新状态。', session_timeout: '登录状态加载超时，请重试。', wallet_not_verified: '无法验证钱包，请重新登录。', wallet_verification_unavailable: '钱包验证暂不可用。', wallet_verification_not_configured: '需要启用钱包验证。', account_not_configured: '需要配置账户验证。', not_configured: '需要配置交易服务。', wallet_loading: '正在准备钱包，请稍后。', wallet_changed: '钱包已改变，请审核新报价。', wallet_rejected: '已取消钱包确认，尚未下单。', quote_timeout: '报价请求超时，请重试。', no_verified_route: '此代币和金额暂无支持的路线。', chain_unavailable: 'BSC 路线暂不可用。', market_closed: '此市场关闭期间暂不可交易。', rate_limited: '请等待一分钟后重新获取报价。', stale_quote: '报价已过期，请获取新报价。', invalid_amount: '请检查金额及小数位数。', invalid_trade_request: '请输入有效金额。', unsupported_order_schema: '此路线尚不支持安全签名。', invalid_order_payload: '订单与交易不符，请获取新报价。', invalid_order_signature: '钱包签名与订单不符。', simulation_failed: '无法核实代币授权，尚未发送交易。', approval_required: '需要代币授权，请获取新报价。', approval_failed: '代币授权失败，请获取新报价。', settlement_not_verified: '无法核实结算，请重新查询订单。', provider_auth_error: '需要检查交易服务访问配置。', provider_error: '交易服务未能完成此请求，请重试。' },
  },
}
type Phase = 'idle' | 'preparing' | 'wallet' | 'approval' | 'submitting' | 'checking' | 'uncertain'
export type TradeSheetLock = { close: boolean; edit: boolean }
type ApprovalAttempt = { plan: AgentTradePlan; raw?: Hex; hash: Hex }

export function TradeConfirmation({ symbol, tokenAddress, side, amount, onAmountChange, language, onCancel, onClosePending, onLockChange }: {
  symbol: string; tokenAddress: string; side: 'buy' | 'sell'; amount: string; onAmountChange: (value: string) => void; language: 'en' | 'zh';
  onCancel: () => void; onLockChange: (lock: TradeSheetLock) => void
  onClosePending?: () => void
}) {
  const t = words[language]
  const { authenticated, login, getAccessToken } = usePrivy()
  const { wallets, ready } = useWallets()
  const { identityToken } = useIdentityToken()
  const { signTypedData } = useSignTypedData()
  const { sendTransaction } = useSendTransaction()
  const { signTransaction } = useSignTransaction()
  const wallet = wallets.find(item => item.walletClientType === 'privy' || item.walletClientType === 'privy_v2')
  const address = authenticated && ready ? wallet?.address : undefined
  const available = useTradeBalance(address, side === 'buy' ? BSC_USDT : { symbol, address: tokenAddress })
  const reduceMotion = useReducedMotion()
  const [confirmationOpen, setConfirmationOpen] = React.useState(false)
  const dialogRef = React.useRef<HTMLElement>(null)
  const primaryRef = React.useRef<HTMLButtonElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const restoredOrder = React.useRef(false)
  const [plan, setPlan] = React.useState<AgentTradePlan | null>(null)
  const [order, setOrder] = React.useState<AgentOrder | null>(null)
  const [phase, setPhase] = React.useState<Phase>('idle')
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [expired, setExpired] = React.useState(false)
  const [refresh, setRefresh] = React.useState(0)
  const paymentToken: PaymentToken = 'USDT'
  const [quoteScheduler] = React.useState(createQuoteScheduler)
  const live = React.useRef({ address, identityToken, getAccessToken, active: true })
  live.current = { address, identityToken, getAccessToken, active: true }
  const warmup = React.useRef<ReturnType<typeof createSessionWarmup> | null>(null)
  warmup.current ??= createSessionWarmup(() => live.current.getAccessToken())
  const abort = React.useRef<AbortController | null>(null)
  const operation = React.useRef(0)
  const busy = React.useRef(false)
  const signedAttempt = React.useRef<SignedTradeAttempt | null>(null)
  const approvalAttempt = React.useRef<ApprovalAttempt | null>(null)
  const lastCheckedOrder = React.useRef<string | null>(null)
  const orderPollingStarted = React.useRef(0)
  const validAmount = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,18})?$/.test(amount) && /[1-9]/.test(amount)
  const walletAction = phase === 'wallet'
  const inputLocked = ['wallet', 'approval', 'submitting', 'uncertain'].includes(phase) || Boolean(order)
  const loading = phase !== 'idle' && phase !== 'uncertain'
  const errorText = (failure: unknown) => {
    const reason = failure instanceof Error ? failure.message : ''
    if (reason === 'minimum_order_not_met') return t.minimumOrder(failure instanceof TradeRequestError ? failure.minimumUsd : null)
    if (reason in t.sponsorshipErrors) return t.sponsorshipErrors[reason as keyof typeof t.sponsorshipErrors]
    if (/reject|cancel|4001/i.test(reason)) return t.errors.wallet_rejected
    return t.errors[reason as keyof typeof t.errors] ?? t.errors.provider_error
  }
  const assertWallet = (owner: string) => {
    if (!live.current.active || live.current.address?.toLowerCase() !== owner.toLowerCase()) throw new Error('wallet_changed')
  }
  const session = React.useCallback(<T,>(action: (value: WalletSession) => Promise<T>, signal?: AbortSignal) => withWalletSession({
    getAccessToken: () => warmup.current!.take(), getIdentityToken: () => live.current.identityToken, refreshIdentityToken: getIdentityToken,
  }, action, signal), [])
  const persist = (next: AgentOrder, owner: string) => {
    try {
      storeTradeReceipt(localStorage, owner, next)
    } catch { /* The current view still holds the server receipt. */ }
  }
  const saveApproval = (attempt: ApprovalAttempt | null, owner: string, hash = approvalAttempt.current?.hash) => {
    if (live.current.address?.toLowerCase() === owner.toLowerCase()) approvalAttempt.current = attempt
    try {
      const key = `firstbell-pending-approval:${owner.toLowerCase()}`
      if (attempt) localStorage.setItem(key, JSON.stringify(attempt))
      else clearTradeApproval(localStorage, owner, hash)
    } catch { /* Keep the exact signed bytes in memory if persistence is unavailable. */ }
  }
  const saveSignedOrder = (attempt: SignedTradeAttempt | null, owner: string, expected = signedAttempt.current) => {
    if (live.current.address?.toLowerCase() === owner.toLowerCase()) signedAttempt.current = attempt
    try {
      const key = `firstbell-pending-order:${owner.toLowerCase()}`
      if (attempt) localStorage.setItem(key, JSON.stringify(attempt))
      else clearSignedTrade(localStorage, owner, expected)
    } catch { /* The exact signed order remains in memory. */ }
  }
  React.useEffect(() => {
    onLockChange({ close: walletAction, edit: inputLocked })
  }, [walletAction, inputLocked, onLockChange])
  React.useEffect(() => {
    live.current.active = true
    return () => { live.current.active = false; operation.current++; abort.current?.abort(); warmup.current?.clear(); quoteScheduler.clear() }
  }, [quoteScheduler])
  React.useEffect(() => {
    warmup.current!.clear()
    if (address) warmup.current!.warm()
    lastCheckedOrder.current = null
    approvalAttempt.current = null
    signedAttempt.current = null
    restoredOrder.current = false
    setOrder(null)
    if (address) try {
      const saved = JSON.parse(localStorage.getItem(`firstbell-agent-order:${address.toLowerCase()}`) ?? 'null') as AgentOrder | null
      if (saved && typeof saved.receiptToken === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(saved.orderId)) {
        restoredOrder.current = true
        setOrder({ ...saved, status: 'PENDING_VENDOR', txHash: null, inputAmount: null, outputAmount: null })
      }
    } catch { /* Local history is only a pointer; the server verifies the receipt. */ }
    if (address) try {
      const pending = JSON.parse(localStorage.getItem(`firstbell-pending-approval:${address.toLowerCase()}`) ?? 'null') as ApprovalAttempt | null
      if (pending?.plan?.route?.walletAddress.toLowerCase() === address.toLowerCase() && /^0x[0-9a-fA-F]{64}$/.test(pending.hash)
        && (pending.raw === undefined || /^0x[0-9a-fA-F]+$/.test(pending.raw) && pending.raw.length <= 1_024 && keccak256(pending.raw) === pending.hash)) approvalAttempt.current = pending
    } catch { /* Server validates any recovered bytes against its sealed plan. */ }
    if (address) try {
      const pending = JSON.parse(localStorage.getItem(`firstbell-pending-order:${address.toLowerCase()}`) ?? 'null') as SignedTradeAttempt | null
      if (pending?.plan?.route?.walletAddress.toLowerCase() === address.toLowerCase() && /^0x[0-9a-fA-F]{130}$/.test(pending.signature)) signedAttempt.current = pending
    } catch { /* Recovery uses the same sealed plan and verifies its signature server-side. */ }
  }, [address])
  React.useEffect(() => {
    operation.current++; abort.current?.abort(); busy.current = false
    setConfirmationOpen(false)
    setPlan(null); setPhase(approvalAttempt.current || signedAttempt.current ? 'uncertain' : 'idle'); setError(''); setNotice('')
    return () => { operation.current++; abort.current?.abort() }
  }, [symbol, side, amount, address, paymentToken])
  React.useEffect(() => {
    setExpired(false)
    if (!plan) return
    const remaining = Date.parse(plan.expiresAt) - Date.now() - 5000
    if (remaining <= 0) { setExpired(true); return }
    const timer = window.setTimeout(() => setExpired(true), remaining)
    return () => window.clearTimeout(timer)
  }, [plan])
  React.useEffect(() => {
    if (!walletAction) return
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [walletAction])
  React.useEffect(() => {
    if (order?.status === 'FILLED') available.refresh()
  }, [order?.orderId, order?.status, available.refresh])
  const closeConfirmation = React.useCallback(() => setConfirmationOpen(false), [])
  React.useEffect(() => { if (!plan) setConfirmationOpen(false) }, [plan])
  React.useEffect(() => {
    if (!confirmationOpen) return
    const background = document.querySelector<HTMLElement>('.app-shell')
    const wasInert = background?.inert ?? false
    const overflow = document.body.style.overflow
    if (background) background.inert = true
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLButtonElement>('.trade-cancel')?.focus(), 50)
    const onKey = (event: KeyboardEvent) => {
      const focusedDialog = document.activeElement?.closest('dialog, [role="dialog"], [role="alertdialog"]')
      if (focusedDialog && focusedDialog !== dialogRef.current) return
      if (event.key === 'Escape') { event.preventDefault(); closeConfirmation(); return }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'))
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(focusTimer); document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      if (background) background.inert = wasInert
      if (primaryRef.current && !primaryRef.current.disabled) primaryRef.current.focus()
      else if (inputRef.current && !inputRef.current.disabled) inputRef.current.focus()
    }
  }, [confirmationOpen, closeConfirmation])

  const prepare = React.useCallback(() => quoteScheduler.run(async () => {
    if (!live.current.active || !address || !validAmount || busy.current || order || signedAttempt.current || approvalAttempt.current) return
    busy.current = true
    const version = ++operation.current
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller
    const deadline = AbortSignal.timeout(PREPARE_TIMEOUT_MS)
    const signal = AbortSignal.any([controller.signal, deadline])
    setPlan(null); setPhase('preparing'); setError(''); setNotice('')
    try {
      const prepared = await session(value => {
        assertWallet(address); signal.throwIfAborted()
        return prepareTrade({ symbol, side, amount, walletAddress: address, paymentToken, sponsorApproval: true }, value, signal)
      }, signal)
      if (version === operation.current) setPlan(prepared)
    } catch (failure) {
      if (version === operation.current) setError(errorText(deadline.aborted && !controller.signal.aborted ? new Error('quote_timeout') : failure))
    } finally { if (version === operation.current) { busy.current = false; setPhase('idle') } }
  }), [symbol, side, amount, address, paymentToken, validAmount, order, session, t, quoteScheduler])
  React.useEffect(() => {
    if (!address || !validAmount || order) return
    quoteScheduler.schedule(prepare)
    return quoteScheduler.clear
  }, [prepare, refresh, address, validAmount, order, quoteScheduler])

  const checkOrder = React.useCallback(async () => {
    if (!order || !address || busy.current) return
    lastCheckedOrder.current = order.orderId
    busy.current = true; setPhase('checking'); setError('')
    const version = operation.current
    try {
      const checked = await session(value => { assertWallet(address); return checkTrade(order, address, value) })
      if (version === operation.current) { setOrder(checked); persist(checked, address) }
    } catch (failure) { if (version === operation.current) setError(errorText(failure)) }
    finally { if (version === operation.current) { busy.current = false; setPhase('idle') } }
  }, [order, address, session, t])
  React.useEffect(() => {
    orderPollingStarted.current = Date.now()
  }, [order?.orderId])
  React.useEffect(() => {
    if (!order || terminalOrder(order.status) || !address || phase !== 'idle') return
    const delay = lastCheckedOrder.current !== order.orderId ? 1000 : Date.now() - orderPollingStarted.current < 30_000 ? 2500 : 10_000
    const timer = window.setTimeout(() => { void checkOrder() }, delay)
    return () => window.clearTimeout(timer)
  }, [order, address, phase, checkOrder])

  const confirm = async () => {
    if (!plan || !address || !wallet || busy.current || order || expired) return
    setConfirmationOpen(false)
    busy.current = true; onLockChange({ close: true, edit: true }); setPhase('wallet'); setError(''); setNotice('')
    const version = operation.current
    const owner = address
    try {
      const result = await executeReviewedTrade(plan, { symbol, side, amount, walletAddress: owner, paymentToken }, {
        assertWallet, switchChain: () => wallet.switchChain(56),
        continueAfterApproval: true,
        nextApproval: approvedPlan => session(value => { assertWallet(owner); return refreshApproval(approvedPlan, value) }),
        approve: async (approval, approvedPlan) => {
          onLockChange({ close: true, edit: true }); setPhase('wallet')
          if (approval.sponsorship) {
            const { signature: raw } = await signTransaction({ type: 0, chainId: 56, from: owner, to: approval.to, data: approval.data, value: 0n,
              gasPrice: 0n, gasLimit: BigInt(approval.sponsorship.gas), nonce: approval.sponsorship.nonce },
              { address: owner, uiOptions: { showWalletUIs: false } })
            assertWallet(owner)
            const attempt = { plan: approvedPlan, raw, hash: keccak256(raw) }
            saveApproval(attempt, owner)
            setPhase('approval')
            try { return await session(value => { assertWallet(owner); return relayApproval(approvedPlan, raw, value) }) }
            catch (failure) {
              // These errors are reported before broadcast. An ambiguous network
              // result keeps the same signed bytes for explicit recovery.
              if (failure instanceof Error && ['sponsorship_not_configured', 'sponsorship_rejected', 'sponsorship_unavailable', 'stale_quote', 'invalid_sponsored_transaction', 'approval_nonce_changed', 'rate_limited', 'wallet_not_verified'].includes(failure.message)) saveApproval(null, owner, attempt.hash)
              throw failure
            }
          }
          const sent = await sendTransaction({ chainId: 56, to: approval.to, data: approval.data, value: 0n }, { address: owner,
            uiOptions: { showWalletUIs: true, description: approval.reset ? t.reset : `${t.approve}: ${amount} ${plan.route.inputSymbol}` } })
          saveApproval({ plan: approvedPlan, hash: sent.hash }, owner)
          return sent.hash
        },
        waitApproval: async hash => {
          let receipt
          try { receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 120_000, pollingInterval: 1000 }) }
          catch { throw new Error('approval_timeout') }
          assertWallet(owner)
          saveApproval(null, owner, hash)
          return receipt
        },
        signing: async typedData => {
          onLockChange({ close: true, edit: true }); setPhase('wallet')
          return (await signTypedData(typedData, { address: owner, uiOptions: { showWalletUIs: false, title: `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol}` } })).signature
        },
        onApproval: () => { if (version === operation.current) setPhase('approval') },
        onSigned: attempt => { saveSignedOrder(attempt, owner); setPhase('submitting') },
        submit: async attempt => {
          const submitted = await session(value => { assertWallet(owner); return submitTrade(attempt.plan, attempt.signature, value) })
          // Keep an acknowledged server receipt even if the view or wallet
          // changes before the execution helper's final wallet check.
          persist(submitted, owner)
          saveSignedOrder(null, owner, attempt)
          return submitted
        },
      })
      if (version !== operation.current) return
      setPlan(null)
      if (result.kind === 'approval') { setNotice(t.approvalDone); setRefresh(value => value + 1) }
      else { restoredOrder.current = false; setOrder(result.order); persist(result.order, owner); saveSignedOrder(null, owner) }
    } catch (failure) {
      if (version !== operation.current) return
      setError(errorText(failure))
      if (signedAttempt.current || approvalAttempt.current) setPhase('uncertain')
      else setPlan(null)
    } finally { if (version === operation.current) { busy.current = false; setPhase(value => value === 'uncertain' ? value : 'idle') } }
  }
  const recover = async () => {
    const pendingApproval = approvalAttempt.current
    if (pendingApproval && address && !busy.current) {
      busy.current = true; setPhase('approval'); setError('')
      const version = operation.current, owner = pendingApproval.plan.route.walletAddress
      try {
        assertWallet(owner)
        if (pendingApproval.raw) await session(value => { assertWallet(owner); return relayApproval(pendingApproval.plan, pendingApproval.raw!, value, true) })
        const receipt = await client.waitForTransactionReceipt({ hash: pendingApproval.hash, confirmations: 2, timeout: 120_000, pollingInterval: 1000 })
        assertWallet(owner)
        saveApproval(null, owner, pendingApproval.hash)
        if (receipt.status !== 'success') throw new Error('approval_failed')
        if (version === operation.current) { setPlan(null); setPhase('idle'); setNotice(t.approvalDone); setRefresh(value => value + 1) }
      } catch (failure) {
        if (version === operation.current) { setPhase(approvalAttempt.current ? 'uncertain' : 'idle'); setError(errorText(failure)) }
      } finally { if (version === operation.current) busy.current = false }
      return
    }
    const attempt = signedAttempt.current
    if (!attempt || !address || busy.current) return
    busy.current = true; setPhase('submitting'); setError('')
    const version = operation.current
    try {
      const submitted = await session(value => { assertWallet(attempt.plan.route.walletAddress); return submitTrade(attempt.plan, attempt.signature, value) })
      persist(submitted, attempt.plan.route.walletAddress)
      saveSignedOrder(null, attempt.plan.route.walletAddress, attempt)
      if (version !== operation.current) return
      setOrder(submitted); persist(submitted, address); signedAttempt.current = null; setPlan(null); setPhase('idle')
    } catch { if (version === operation.current) setPhase('uncertain') }
    finally { if (version === operation.current) busy.current = false }
  }
  const status = phase === 'preparing' ? t.loading : phase === 'wallet' ? t.walletConfirm : phase === 'approval' ? t.approvalPending
    : phase === 'submitting' ? t.submitting : phase === 'checking' ? t.checking : phase === 'uncertain' ? approvalAttempt.current ? t.sponsorshipErrors.approval_submission_unknown : t.uncertain
    : order ? order.status === 'FILLED' ? restoredOrder.current ? t.tradeComplete : side === 'sell' ? language === 'zh' ? '已售出' : 'Sold' : t.filled : terminalOrder(order.status) ? t.failed : t.pending
    : expired ? t.expired : notice || (plan ? t.ready : !authenticated ? t.note : !address ? t.walletLoading : t.empty)
  const pendingTrade = Boolean(order || signedAttempt.current || approvalAttempt.current)
  const cancel = () => {
    if (walletAction) return
    setConfirmationOpen(false)
    if (pendingTrade) { onClosePending?.(); return }
    operation.current++; abort.current?.abort(); quoteScheduler.clear(); busy.current = false
    setPlan(null); setPhase('idle'); setError(''); setNotice(''); setExpired(false); onCancel(); inputRef.current?.focus()
  }
  const actionLabel = !authenticated ? t.login : !address ? t.walletLoading : expired ? t.refresh : plan ? `${side === 'buy' ? t.buy : t.sell} ${symbol}` : error ? t.retry : t.quote
  const startNewTrade = () => { restoredOrder.current = false; setOrder(null); setPlan(null); setError(''); setNotice(''); onAmountChange('') }
  const tradeAction = () => {
    if (loading || walletAction || authenticated && (!address || !validAmount) && phase !== 'uncertain') return
    if (!authenticated) login()
    else if (phase === 'uncertain') void recover()
    else if (plan && !expired) setConfirmationOpen(true)
    else void prepare()
  }

  return <>
    <form className="trade-execution" onSubmit={event => { event.preventDefault(); tradeAction() }}>
      <div className="trade-entry-amount">
        <label className="trade-amount-label" htmlFor="trade-amount">{side === 'buy' ? t.spend : t.quantity}</label>
        <div className="trade-amount-field"><input ref={inputRef} id="trade-amount" type="text" inputMode="decimal" autoComplete="off" value={amount} disabled={inputLocked} onChange={event => onAmountChange(event.target.value)} placeholder="0.00" aria-invalid={Boolean(amount) && !validAmount} aria-describedby="trade-status" /><span>{side === 'buy' ? 'USDT' : symbol}</span></div>
      </div>
      <div className="trade-balance-row"><span>{t.available}</span><strong title={available.balance?.quantity}>{!authenticated ? t.balanceLogin : !address ? t.walletLoading : available.error ? t.balanceUnavailable : available.balance ? `${displayQuantity(available.balance.quantity, 8)} ${available.balance.symbol}` : t.balanceLoading}</strong>{address && <button type="button" aria-label={t.balanceRefresh} disabled={available.loading} onClick={available.refresh}>{available.loading ? <LoaderCircle size={14} className="trade-spinner" /> : <RefreshCw size={14} />}</button>}</div>
      <div className="trade-sheet-row"><span>{t.receive}</span><strong>{plan && !expired ? `${displayQuantity(plan.route.outputAmount)} ${plan.route.outputSymbol}` : '—'}</strong></div>
      {plan && <>
        <div className="trade-sheet-row"><span>{t.fee}</span><strong>{displayQuantity(formatUnits(BigInt(plan.feeAmount), plan.inputDecimals))} {plan.route.inputSymbol}</strong></div>
        <div className="trade-sheet-row"><span>{t.gas}</span><strong>{plan.approval?.sponsorship ? t.sponsored : plan.approval ? `≈ ${plan.approval.gasFeeBnb} BNB` : t.included}</strong></div>
      </>}
      <div id="trade-status" className="trade-sheet-status" role="status" aria-live="polite"><span>{loading ? <LoaderCircle size={15} className="trade-spinner" /> : order?.status === 'FILLED' ? <Check size={15} /> : null}{status}</span></div>
      {amount && !validAmount && !inputLocked && <p className="trade-sheet-error" role="alert">{t.errors.invalid_amount}</p>}
      {error && <p className="trade-sheet-error" role="alert">{error}</p>}
      {phase === 'uncertain' && approvalAttempt.current && <div className="trade-order-reference"><a href={`https://bscscan.com/tx/${approvalAttempt.current.hash}`} target="_blank" rel="noreferrer">{t.tx}<ExternalLink size={14} /></a></div>}
      {order?.txHash && <div className="trade-order-reference"><a href={`https://bscscan.com/tx/${order.txHash}`} target="_blank" rel="noreferrer">{t.tx}<ExternalLink size={14} /></a></div>}
      {order ? <div className="trade-confirm-actions"><button type="button" className="trade-cancel" disabled={walletAction} onClick={cancel}>{terminalOrder(order.status) ? t.close : t.closeTrade}</button><button type="button" className={`trade-submit trade-${side}`} disabled={loading} onClick={() => terminalOrder(order.status) ? startNewTrade() : void checkOrder()}>{terminalOrder(order.status) ? t.newTrade : t.status}</button></div>
        : <div className="trade-confirm-actions"><button type="button" className="trade-cancel" disabled={walletAction} onClick={cancel}>{pendingTrade ? t.closeTrade : t.cancel}</button><button ref={primaryRef} type="submit" className={`trade-submit trade-${side}`} disabled={loading || (phase !== 'uncertain' && authenticated && (!address || !validAmount))}>{loading && <LoaderCircle size={16} className="trade-spinner" />}{phase === 'uncertain' ? t.recover : loading ? status : actionLabel}</button></div>}
    </form>
    {typeof document !== 'undefined' && createPortal(<AnimatePresence>{confirmationOpen && plan && <div className="trade-sheet-layer">
      <motion.button type="button" className="trade-sheet-scrim" aria-label={t.closeReview} tabIndex={-1} onClick={closeConfirmation} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.section ref={dialogRef} className="trade-confirm-popup" role="dialog" aria-modal="true" aria-labelledby="trade-confirm-heading" aria-describedby="trade-confirm-note" initial={reduceMotion ? false : { y: 12, opacity: 0, scale: .98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }}>
        <div className="trade-sheet-header"><h2 id="trade-confirm-heading">{side === 'buy' ? t.confirmBuy : t.confirmSell} · {symbol}</h2><button type="button" aria-label={t.closeReview} onClick={closeConfirmation}><X size={20} /></button></div>
        <div className="trade-sheet-row"><span>{t.total}</span><strong>{amount} {plan.route.inputSymbol}</strong></div>
        <div className="trade-sheet-row"><span>{t.receive}</span><strong>{displayQuantity(plan.route.outputAmount)} {plan.route.outputSymbol}</strong></div>
        <div className="trade-sheet-row"><span>{t.minimum}</span><strong>{displayQuantity(formatUnits(BigInt(plan.minimumReceive), plan.outputDecimals))} {plan.route.outputSymbol}</strong></div>
        <div className="trade-sheet-row"><span>{t.fee}</span><strong>{displayQuantity(formatUnits(BigInt(plan.feeAmount), plan.inputDecimals))} {plan.route.inputSymbol}</strong></div>
        <div className="trade-sheet-row"><span>{t.gas}</span><strong>{plan.approval?.sponsorship ? t.sponsored : plan.approval ? `≈ ${plan.approval.gasFeeBnb} BNB` : t.included}</strong></div>
        <div className="trade-sheet-row"><span>{t.expiry}</span><strong>{new Date(plan.expiresAt).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US')}</strong></div>
        <div className="trade-sheet-row"><span>{t.wallet}</span><strong title={address}>{address ? `${address.slice(0, 7)}…${address.slice(-5)}` : t.disconnected}</strong></div>
        {plan.approval && <p className="trade-approval-note">{plan.approval.reset ? t.resetNote : t.approvalNote}</p>}
        <p id="trade-confirm-note" className="trade-confirm-note" role="status">{expired ? t.expired : t.ready}</p>
        <div className="trade-confirm-actions"><button type="button" className="trade-cancel" onClick={closeConfirmation}>{t.cancel}</button><button type="button" className={`trade-submit trade-${side}`} disabled={expired || loading || !address} onClick={() => { void confirm() }}>{t.confirm}</button></div>
      </motion.section>
    </div>}</AnimatePresence>, document.body)}
  </>
}
