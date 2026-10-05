import * as React from 'react'
import { getIdentityToken, useIdentityToken, usePrivy, useSendTransaction, useSignTypedData, useWallets } from '@privy-io/react-auth'
import { Check, ExternalLink, LoaderCircle } from 'lucide-react'
import { createPublicClient, formatUnits, http } from 'viem'
import { bsc } from 'viem/chains'
import { terminalOrder, type AgentOrder, type AgentTradePlan } from '../lib/agent-trading'
import { executeReviewedTrade, type SignedTradeAttempt } from '../lib/trade-execution'
import { createSessionWarmup } from '../lib/session-warmup'
import { withWalletSession, type WalletSession } from '../lib/wallet-session'
import { PREPARE_TIMEOUT_MS } from '../lib/quote-timeout'
import { TradeRequestError } from '../lib/trade-error'
import { checkTrade, prepareTrade, submitTrade } from './agent-api'
import { displayQuantity } from './wallet-balances'

const client = createPublicClient({ chain: bsc, transport: http('https://bsc-dataseed.bnbchain.org', { timeout: 10_000, retryCount: 0 }) })
const words = {
  en: {
    spend: 'Amount to spend', quantity: 'Token quantity', receive: 'Estimated receive', minimum: 'Minimum receive', fee: 'Order fee · included', wallet: 'Your wallet', expiry: 'Order expires', gas: 'Estimated network fee',
    empty: 'Enter an amount to get a quote.', loading: 'Getting your quote…', ready: 'Review your trade', expired: 'Quote expired. Get a new quote.', login: 'Log In', walletLoading: 'Preparing your wallet…',
    quote: 'Get quote', retry: 'Retry quote', refresh: 'Refresh quote', confirm: 'Confirm', cancel: 'Cancel', close: 'Done', approve: 'Confirm token approval', reset: 'Reset token approval',
    approvalNote: 'Your wallet needs token permission first. This step approves only this amount. Review a fresh quote after approval.', resetNote: 'Reset the existing token permission first. This step does not place an order.',
    note: 'Review the quote, then confirm with your wallet.', walletConfirm: 'Confirm in your wallet…', approvalPending: 'Waiting for token approval…', approvalDone: 'Token approval confirmed. Preparing a fresh quote…',
    submitting: 'Submitting your order…', checking: 'Checking settlement…', pending: 'Order submitted. Waiting for settlement.', filled: 'Trade confirmed on BNB Smart Chain.', failed: 'Order did not fill.',
    uncertain: 'The submission result is unknown. Check this same submission before starting another trade.', recover: 'Check submission', status: 'Check order status', tx: 'View transaction', newTrade: 'New trade', disconnected: 'Not connected',
    minimumOrder: (value: string | null) => value ? `The provider requires a trade worth at least $${value}. Choose an amount that meets it.` : 'This amount is below the provider’s minimum trade value. Choose a larger amount.',
    errors: { insufficient_balance: 'Not enough of the spending token in your wallet.', insufficient_gas: 'Add a little BNB for the network fee.', unauthorized: 'Sign in again and retry.', session_unavailable: 'Your session could not be loaded. Retry.', session_refresh_failed: 'Sign in again to refresh your session.', session_timeout: 'Your sign-in session took too long. Retry.', wallet_not_verified: 'Your wallet could not be verified. Sign in again.', wallet_verification_unavailable: 'Wallet verification is temporarily unavailable.', wallet_verification_not_configured: 'Wallet verification needs to be enabled.', account_not_configured: 'Account verification needs to be configured.', not_configured: 'Trading needs to be configured.', wallet_loading: 'Your wallet is still being prepared.', wallet_changed: 'Your wallet changed. Review a new quote.', wallet_rejected: 'Wallet confirmation cancelled. No order submitted.', quote_timeout: 'The quote took too long. Retry.', no_verified_route: 'No supported route for this token and amount.', chain_unavailable: 'BSC routes are unavailable right now.', market_closed: 'Trading is unavailable while this market is closed.', rate_limited: 'Wait a minute before getting another quote.', stale_quote: 'Quote expired. Get a fresh quote.', invalid_amount: 'Check the amount and its decimal places.', invalid_trade_request: 'Enter a valid amount.', unsupported_order_schema: 'This route cannot be safely signed yet.', invalid_order_payload: 'The order does not match your trade. Get a new quote.', invalid_order_signature: 'The wallet signature does not match this order.', simulation_failed: 'Token approval could not be verified. Nothing was sent.', approval_required: 'Token approval is required. Get a fresh quote.', approval_failed: 'Token approval failed. Get a fresh quote.', settlement_not_verified: 'Settlement could not be verified. Check the order again.', provider_auth_error: 'Trading provider access needs to be checked.', provider_error: 'The trading provider could not complete this request. Retry.' },
  },
  zh: {
    spend: '支付金额', quantity: '代币数量', receive: '预计收到', minimum: '最低接收数量', fee: '已含订单费用', wallet: '你的钱包', expiry: '订单到期时间', gas: '预计网络费',
    empty: '请输入金额以获取报价。', loading: '正在获取报价…', ready: '审核交易', expired: '报价已过期，请获取新报价。', login: '登录', walletLoading: '正在准备钱包…',
    quote: '获取报价', retry: '重试报价', refresh: '刷新报价', confirm: '确认', cancel: '取消', close: '完成', approve: '确认代币授权', reset: '重置代币授权',
    approvalNote: '钱包需要先授权此金额。授权后请审核新报价再确认订单。', resetNote: '请先重置现有代币授权。此步骤不会下单。',
    note: '审核报价后，通过钱包确认。', walletConfirm: '请在钱包中确认…', approvalPending: '等待代币授权确认…', approvalDone: '代币授权已确认，正在获取新报价…',
    submitting: '正在提交订单…', checking: '正在检查结算…', pending: '订单已提交，等待结算。', filled: '交易已在 BNB 智能链上确认。', failed: '订单未成交。',
    uncertain: '提交结果未知。开始新交易前请查询同一次提交。', recover: '查询本次提交', status: '查询订单状态', tx: '查看交易', newTrade: '新交易', disconnected: '未连接',
    minimumOrder: (value: string | null) => value ? `服务商要求交易价值至少为 ${value} 美元。请选择符合要求的金额。` : '此金额低于服务商的最低交易价值，请增加金额。',
    errors: { insufficient_balance: '钱包中的支付代币不足。', insufficient_gas: '请添加少量 BNB 支付网络费用。', unauthorized: '请重新登录后重试。', session_unavailable: '无法加载登录状态，请重试。', session_refresh_failed: '请重新登录以刷新状态。', session_timeout: '登录状态加载超时，请重试。', wallet_not_verified: '无法验证钱包，请重新登录。', wallet_verification_unavailable: '钱包验证暂不可用。', wallet_verification_not_configured: '需要启用钱包验证。', account_not_configured: '需要配置账户验证。', not_configured: '需要配置交易服务。', wallet_loading: '正在准备钱包，请稍后。', wallet_changed: '钱包已改变，请审核新报价。', wallet_rejected: '已取消钱包确认，尚未下单。', quote_timeout: '报价请求超时，请重试。', no_verified_route: '此代币和金额暂无支持的路线。', chain_unavailable: 'BSC 路线暂不可用。', market_closed: '此市场关闭期间暂不可交易。', rate_limited: '请等待一分钟后重新获取报价。', stale_quote: '报价已过期，请获取新报价。', invalid_amount: '请检查金额及小数位数。', invalid_trade_request: '请输入有效金额。', unsupported_order_schema: '此路线尚不支持安全签名。', invalid_order_payload: '订单与交易不符，请获取新报价。', invalid_order_signature: '钱包签名与订单不符。', simulation_failed: '无法核实代币授权，尚未发送交易。', approval_required: '需要代币授权，请获取新报价。', approval_failed: '代币授权失败，请获取新报价。', settlement_not_verified: '无法核实结算，请重新查询订单。', provider_auth_error: '需要检查交易服务访问配置。', provider_error: '交易服务未能完成此请求，请重试。' },
  },
}
type Phase = 'idle' | 'preparing' | 'wallet' | 'approval' | 'submitting' | 'checking' | 'uncertain'
export type TradeSheetLock = { close: boolean; edit: boolean }

export function TradeConfirmation({ symbol, side, amount, onAmountChange, language, onCancel, onLockChange, cancelWork }: {
  symbol: string; side: 'buy' | 'sell'; amount: string; onAmountChange: (value: string) => void; language: 'en' | 'zh';
  onCancel: () => void; onLockChange: (lock: TradeSheetLock) => void
  cancelWork: React.RefObject<(() => void) | null>
}) {
  const t = words[language]
  const { authenticated, login, getAccessToken } = usePrivy()
  const { wallets, ready } = useWallets()
  const { identityToken } = useIdentityToken()
  const { signTypedData } = useSignTypedData()
  const { sendTransaction } = useSendTransaction()
  const wallet = wallets.find(item => item.walletClientType === 'privy' || item.walletClientType === 'privy_v2')
  const address = authenticated && ready ? wallet?.address : undefined
  const [plan, setPlan] = React.useState<AgentTradePlan | null>(null)
  const [order, setOrder] = React.useState<AgentOrder | null>(null)
  const [phase, setPhase] = React.useState<Phase>('idle')
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [expired, setExpired] = React.useState(false)
  const [refresh, setRefresh] = React.useState(0)
  const live = React.useRef({ address, identityToken, getAccessToken, active: true })
  live.current = { address, identityToken, getAccessToken, active: true }
  const warmup = React.useRef<ReturnType<typeof createSessionWarmup> | null>(null)
  warmup.current ??= createSessionWarmup(() => live.current.getAccessToken())
  const abort = React.useRef<AbortController | null>(null)
  const operation = React.useRef(0)
  const busy = React.useRef(false)
  const signedAttempt = React.useRef<SignedTradeAttempt | null>(null)
  const lastCheckedOrder = React.useRef<string | null>(null)
  const dismissed = React.useRef(false)
  const validAmount = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,18})?$/.test(amount) && /[1-9]/.test(amount)
  const walletAction = ['wallet', 'approval', 'submitting', 'uncertain'].includes(phase)
  const inputLocked = walletAction || Boolean(order)
  const loading = phase !== 'idle' && phase !== 'uncertain'
  const errorText = (failure: unknown) => {
    const reason = failure instanceof Error ? failure.message : ''
    if (reason === 'minimum_order_not_met') return t.minimumOrder(failure instanceof TradeRequestError ? failure.minimumUsd : null)
    if (/reject|cancel|4001/i.test(reason)) return t.errors.wallet_rejected
    return t.errors[reason as keyof typeof t.errors] ?? t.errors.provider_error
  }
  const assertWallet = (owner: string) => {
    if (dismissed.current || !live.current.active || live.current.address?.toLowerCase() !== owner.toLowerCase()) throw new Error('wallet_changed')
  }
  const session = React.useCallback(<T,>(action: (value: WalletSession) => Promise<T>, signal?: AbortSignal) => withWalletSession({
    getAccessToken: () => warmup.current!.take(), getIdentityToken: () => live.current.identityToken, refreshIdentityToken: getIdentityToken,
  }, action, signal), [])
  const persist = (next: AgentOrder, owner: string) => {
    try {
      const key = `firstbell-agent-order:${owner.toLowerCase()}`
      if (!terminalOrder(next.status)) localStorage.setItem(key, JSON.stringify(next))
      else if (JSON.parse(localStorage.getItem(key) ?? 'null')?.orderId === next.orderId) localStorage.removeItem(key)
    } catch { /* The current view still holds the server receipt. */ }
  }
  React.useEffect(() => {
    onLockChange({ close: walletAction, edit: inputLocked })
  }, [walletAction, inputLocked, onLockChange])
  React.useEffect(() => {
    live.current.active = true
    return () => { live.current.active = false; operation.current++; abort.current?.abort(); warmup.current?.clear() }
  }, [])
  React.useEffect(() => {
    const stop = () => { dismissed.current = true; operation.current++; abort.current?.abort(); warmup.current?.clear() }
    cancelWork.current = stop
    return () => { if (cancelWork.current === stop) cancelWork.current = null }
  }, [cancelWork])
  React.useEffect(() => {
    warmup.current!.clear()
    if (address) warmup.current!.warm()
    lastCheckedOrder.current = null
    setOrder(null)
    if (address) try {
      const saved = JSON.parse(localStorage.getItem(`firstbell-agent-order:${address.toLowerCase()}`) ?? 'null') as AgentOrder | null
      if (saved && typeof saved.receiptToken === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(saved.orderId)) {
        setOrder({ ...saved, status: 'PENDING_VENDOR', txHash: null, inputAmount: null, outputAmount: null })
      }
    } catch { /* Local history is only a pointer; the server verifies the receipt. */ }
  }, [address])
  React.useEffect(() => {
    operation.current++; abort.current?.abort(); busy.current = false; signedAttempt.current = null
    setPlan(null); setPhase('idle'); setError(''); setNotice('')
    return () => { operation.current++; abort.current?.abort() }
  }, [symbol, side, amount, address])
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

  const prepare = React.useCallback(async () => {
    if (dismissed.current || !address || !validAmount || busy.current || order || signedAttempt.current) return
    busy.current = true
    const version = ++operation.current
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller
    const deadline = AbortSignal.timeout(PREPARE_TIMEOUT_MS)
    const signal = AbortSignal.any([controller.signal, deadline])
    setPlan(null); setPhase('preparing'); setError(''); setNotice('')
    try {
      const prepared = await session(value => {
        assertWallet(address); signal.throwIfAborted()
        return prepareTrade({ symbol, side, amount, walletAddress: address }, value, signal)
      }, signal)
      if (version === operation.current) setPlan(prepared)
    } catch (failure) {
      if (version === operation.current) setError(errorText(deadline.aborted && !controller.signal.aborted ? new Error('quote_timeout') : failure))
    } finally { if (version === operation.current) { busy.current = false; setPhase('idle') } }
  }, [symbol, side, amount, address, validAmount, order, session, t])
  React.useEffect(() => {
    if (!address || !validAmount || order) return
    const timer = window.setTimeout(() => { void prepare() }, 750)
    return () => window.clearTimeout(timer)
  }, [prepare, refresh, address, validAmount, order])

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
    if (!order || terminalOrder(order.status) || !address || phase !== 'idle') return
    const timer = window.setTimeout(() => { void checkOrder() }, lastCheckedOrder.current === order.orderId ? 15_000 : 1000)
    return () => window.clearTimeout(timer)
  }, [order, address, phase, checkOrder])

  const confirm = async () => {
    if (!plan || !address || !wallet || busy.current || order || expired) return
    busy.current = true; onLockChange({ close: true, edit: true }); setPhase('wallet'); setError(''); setNotice('')
    const version = operation.current
    const owner = address
    try {
      const result = await executeReviewedTrade(plan, { symbol, side, amount, walletAddress: owner }, {
        assertWallet, switchChain: () => wallet.switchChain(56),
        approve: async approval => {
          const sent = await sendTransaction({ chainId: 56, to: approval.to, data: approval.data, value: 0n }, { address: owner,
            uiOptions: { showWalletUIs: true, description: approval.reset ? t.reset : `${t.approve}: ${amount} ${plan.route.inputSymbol}` } })
          return sent.hash
        },
        waitApproval: hash => client.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 90_000, pollingInterval: 4000 }),
        signing: async typedData => (await signTypedData(typedData, { address: owner, uiOptions: { showWalletUIs: true, title: `${side === 'buy' ? 'Buy' : 'Sell'} ${symbol}` } })).signature,
        onApproval: () => { if (version === operation.current) setPhase('approval') },
        onSigned: attempt => { signedAttempt.current = attempt; setPhase('submitting') },
        submit: attempt => session(value => { assertWallet(owner); return submitTrade(attempt.plan, attempt.signature, value) }),
      })
      if (version !== operation.current) return
      setPlan(null)
      if (result.kind === 'approval') { setNotice(t.approvalDone); setRefresh(value => value + 1) }
      else { setOrder(result.order); persist(result.order, owner); signedAttempt.current = null }
    } catch (failure) {
      if (version !== operation.current) return
      if (signedAttempt.current) setPhase('uncertain')
      else setError(errorText(failure))
    } finally { if (version === operation.current) { busy.current = false; setPhase(value => value === 'uncertain' ? value : 'idle') } }
  }
  const recover = async () => {
    const attempt = signedAttempt.current
    if (!attempt || !address || busy.current) return
    busy.current = true; setPhase('submitting'); setError('')
    const version = operation.current
    try {
      const submitted = await session(value => { assertWallet(attempt.plan.route.walletAddress); return submitTrade(attempt.plan, attempt.signature, value) })
      if (version !== operation.current) return
      setOrder(submitted); persist(submitted, address); signedAttempt.current = null; setPlan(null); setPhase('idle')
    } catch { if (version === operation.current) setPhase('uncertain') }
    finally { if (version === operation.current) busy.current = false }
  }
  const status = phase === 'preparing' ? t.loading : phase === 'wallet' ? t.walletConfirm : phase === 'approval' ? t.approvalPending
    : phase === 'submitting' ? t.submitting : phase === 'checking' ? t.checking : phase === 'uncertain' ? t.uncertain
    : order ? order.status === 'FILLED' ? t.filled : terminalOrder(order.status) ? t.failed : t.pending
    : expired ? t.expired : notice || (plan ? t.ready : !authenticated ? t.note : !address ? t.walletLoading : t.empty)
  const cancel = () => { if (walletAction || busy.current && phase !== 'preparing' && phase !== 'checking') return; operation.current++; abort.current?.abort(); onCancel() }
  const actionLabel = !authenticated ? t.login : !address ? t.walletLoading : expired ? t.refresh : plan ? plan.approval ? plan.approval.reset ? t.reset : t.approve : t.confirm : error ? t.retry : t.quote
  const startNewTrade = () => { setOrder(null); setPlan(null); setError(''); setNotice(''); onAmountChange('') }

  return <>
    <label className="trade-amount-label" htmlFor="trade-amount">{side === 'buy' ? t.spend : t.quantity}</label>
    <div className="trade-amount-field"><input id="trade-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} disabled={inputLocked} onChange={event => onAmountChange(event.target.value)} placeholder="0.00" /><span>{side === 'buy' ? 'USDT' : symbol}</span></div>
    <div className="trade-sheet-row"><span>{t.receive}</span><strong>{plan && !expired ? `${displayQuantity(plan.route.outputAmount)} ${plan.route.outputSymbol}` : '—'}</strong></div>
    {plan && <>
      <div className="trade-sheet-row"><span>{t.minimum}</span><strong>{displayQuantity(formatUnits(BigInt(plan.minimumReceive), plan.outputDecimals))} {plan.route.outputSymbol}</strong></div>
      <div className="trade-sheet-row"><span>{t.fee}</span><strong>{displayQuantity(formatUnits(BigInt(plan.feeAmount), plan.inputDecimals))} {plan.route.inputSymbol}</strong></div>
      <div className="trade-sheet-row"><span>{t.expiry}</span><strong>{new Date(plan.expiresAt).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US')}</strong></div>
      {plan.approval && <div className="trade-sheet-row"><span>{t.gas}</span><strong>≈ {plan.approval.gasFeeBnb} BNB</strong></div>}
    </>}
    <div className="trade-sheet-row"><span>{t.wallet}</span><strong title={address}>{address ? `${address.slice(0, 7)}…${address.slice(-5)}` : t.disconnected}</strong></div>
    {plan?.approval && <p className="trade-approval-note">{plan.approval.reset ? t.resetNote : t.approvalNote}</p>}
    <div className="trade-sheet-status" role="status" aria-live="polite"><span>{loading ? <LoaderCircle size={15} className="trade-spinner" /> : order?.status === 'FILLED' ? <Check size={15} /> : null}{status}</span><span>BNB / 56</span></div>
    {error && <p className="trade-sheet-error" role="alert">{error}</p>}
    {order ? <>
      <div className="trade-order-reference">{order.orderId}{order.txHash && <a href={`https://bscscan.com/tx/${order.txHash}`} target="_blank" rel="noreferrer">{t.tx}<ExternalLink size={14} /></a>}</div>
      <div className="trade-confirm-actions"><button type="button" className="trade-cancel" disabled={walletAction} onClick={cancel}>{t.close}</button><button type="button" className={`trade-submit trade-${side}`} disabled={loading} onClick={() => terminalOrder(order.status) ? startNewTrade() : void checkOrder()}>{terminalOrder(order.status) ? t.newTrade : t.status}</button></div>
    </> : <div className="trade-confirm-actions"><button type="button" className="trade-cancel" disabled={walletAction} onClick={cancel}>{t.cancel}</button><button type="button" className={`trade-submit trade-${side}`} disabled={loading || (phase !== 'uncertain' && authenticated && (!address || !validAmount))} onClick={() => !authenticated ? login() : phase === 'uncertain' ? void recover() : plan && !expired ? void confirm() : void prepare()}>{loading && <LoaderCircle size={16} className="trade-spinner" />}{phase === 'uncertain' ? t.recover : loading ? status : actionLabel}</button></div>}
    <p id="trade-sheet-note" className="trade-sheet-note">{t.note}</p>
  </>
}
