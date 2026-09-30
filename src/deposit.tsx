import * as React from 'react'
import { ArrowUpRight, Check, CreditCard, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { checkoutAsset, isDepositTerminal, sessionAsset, type DepositSession } from '../lib/funding'
import { displayQuantity } from './wallet-balances'
import type { DepositController } from './deposits-api'
import './deposit.css'

type Language = 'en' | 'zh'
const copy = {
  en: {
    title: 'Deposit from your card', intro: 'Add USDT to your FirstBell wallet on BNB Smart Chain.',
    amount: 'Deposit amount', currency: 'Payment currency', receive: 'You receive', network: 'Network', wallet: 'Your wallet', continue: 'Continue to MoonPay', opening: 'Opening checkout…',
    close: 'Close deposit', fees: 'MoonPay shows your final card total, the USDT you receive, and all fees before you pay.',
    timing: 'Card payments and identity checks can take several minutes or longer.',
    provider: 'Card payment and verification are handled securely by MoonPay.',
    sandbox: 'Test mode — no real money or mainnet funds.',
    sandboxTitle: 'Test card checkout', sandboxIntro: 'Try MoonPay with test ETH on Ethereum Sepolia.',
    sandboxContinue: 'Continue to test checkout', sandboxAmount: 'Test purchase amount', sandboxReceive: 'Test asset',
    sandboxFees: 'MoonPay shows a test quote and fees. Use the test card below; no real card is charged.',
    sandboxCard: 'MoonPay test card / UK', sandboxExpiry: 'Expiry', sandboxBilling: 'Use a UK test billing address in MoonPay sandbox. Use an email you can access for the login code.',
    sandboxDelivery: 'Testnet delivery is 1/100 of the quoted ETH amount. Your BSC USDT balance is separate.',
    sandboxWaiting: 'Finish test checkout in MoonPay. Your real BSC balance stays separate.',
    sandboxProcessing: 'MoonPay is processing the test payment. No BSC mainnet funds will be added.',
    sandboxNew: 'Try another test checkout', sandboxReceipt: 'View test transaction on Sepolia',
    changed: 'This checkout belongs to a previous configuration. Start a new checkout in the current mode.',
    setup: 'Card deposits are being connected. Checkout is not available yet.',
    sandboxUnavailable: 'MoonPay test ETH is not enabled for this integration. Enable Ethereum in MoonPay and try again.',
    unavailable: 'Card checkout is temporarily unavailable. Try again shortly.',
    retry: 'Try again', invalid: 'Enter a whole amount within the displayed limits.', limits: 'Available range',
    verify: 'Your wallet could not be verified. Sign in again and retry.',
    identity: 'Wallet verification is not enabled yet. Card checkout needs the account setup to be completed.',
    connection: 'Your connection could not be verified. Reopen checkout on the same network.',
    limited: 'Please wait a minute before opening another checkout.',
    check: 'Check status', checked: 'Last checked', resume: 'Return to checkout', new: 'Make another deposit', history: 'Card deposits',
    historyEmpty: 'No card checkouts yet', historyHint: 'Your live card deposits and labelled sandbox checkouts will appear here.',
    loading: 'Checking card deposits', details: 'View deposit', receipt: 'View transfer on BscScan',
    sent: 'Sent to your wallet', paid: 'Requested amount', status: 'Deposit status', checkError: 'Status could not be verified. Your deposit remains tracked; try checking again.',
    waiting: 'Finish payment in MoonPay. Closing this screen keeps your deposit tracked.',
    action: 'Complete the card approval or verification requested in MoonPay.',
    processing: 'MoonPay is processing your payment. Funds are not available yet.',
    confirming: 'Waiting for a confirmed USDT transfer to your wallet on BNB Smart Chain.',
    completed: 'USDT has arrived in your wallet and the transfer is confirmed on BNB Smart Chain.',
    failed: 'MoonPay reported that this payment failed. Check the provider receipt before trying again.',
    expired: 'No payment was found at the last check after 24 hours. Check again before starting another deposit.',
    testCompleted: 'Test checkout completed. No mainnet USDT was credited.',
    statuses: { awaiting_payment: 'Awaiting payment', action_required: 'Action needed', processing: 'Processing payment', confirming: 'Confirming transfer', completed: 'Deposit confirmed', failed: 'Payment failed', expired: 'Checkout expired', test_completed: 'Test completed' },
  },
  zh: {
    title: '使用银行卡充值', intro: '向你的 FirstBell 钱包充值 BNB 智能链上的 USDT。',
    amount: '支付金额', currency: '支付货币', receive: '到账币种', network: '网络', wallet: '你的钱包', continue: '继续前往 MoonPay', opening: '正在打开支付页面…',
    close: '关闭充值', fees: '支付前，MoonPay 会显示最终银行卡扣款总额、USDT 到账金额和全部费用。',
    timing: '银行卡支付和身份验证可能需要数分钟或更长时间。', provider: '银行卡支付和身份验证由 MoonPay 安全处理。',
    sandbox: '测试模式：不使用真实资金，也不产生主网余额。', setup: '银行卡充值正在接入，目前尚不能支付。',
    sandboxTitle: '测试银行卡支付', sandboxIntro: '在以太坊 Sepolia 上使用测试 ETH 体验 MoonPay。',
    sandboxContinue: '继续前往测试支付', sandboxAmount: '测试购买金额', sandboxReceive: '测试资产',
    sandboxFees: 'MoonPay 会显示测试报价和费用。请使用下方测试卡，不会扣除真实资金。',
    sandboxCard: 'MoonPay 英国测试卡', sandboxExpiry: '有效期', sandboxBilling: '请在 MoonPay 沙盒使用英国测试账单地址，并使用能接收登录验证码的邮箱。',
    sandboxDelivery: '测试网到账金额为 ETH 报价数量的 1/100。BSC 主网 USDT 余额单独显示。',
    sandboxWaiting: '请在 MoonPay 完成测试支付，BSC 主网余额单独计算。',
    sandboxProcessing: 'MoonPay 正在处理测试支付，不会增加 BSC 主网余额。',
    sandboxNew: '再次测试支付', sandboxReceipt: '在 Sepolia 查看测试交易',
    changed: '此支付记录属于之前的配置，请在当前模式下创建新的支付。',
    sandboxUnavailable: '此接入尚未启用 MoonPay 测试 ETH。请在 MoonPay 启用以太坊后重试。',
    unavailable: '银行卡支付暂时不可用，请稍后重试。', retry: '重试', invalid: '请输入范围内的整数金额。', limits: '可用金额范围',
    verify: '无法验证钱包，请重新登录后重试。', identity: '钱包验证尚未启用。完成账户配置后才能使用银行卡充值。',
    connection: '无法验证网络连接，请在同一网络下重新打开支付页面。', limited: '请等待一分钟后再打开支付页面。',
    check: '检查状态', checked: '上次检查', resume: '返回支付页面', new: '再次充值', history: '银行卡充值记录',
    historyEmpty: '还没有银行卡支付', historyHint: '真实充值和标注为沙盒的测试支付会显示在这里。',
    loading: '正在检查充值记录', details: '查看充值', receipt: '在 BscScan 查看转账',
    sent: '钱包到账', paid: '申请金额', status: '充值状态', checkError: '暂时无法验证状态。充值仍在跟踪中，请稍后重试。',
    waiting: '请在 MoonPay 完成支付。关闭此页面不会停止跟踪充值。', action: '请在 MoonPay 完成银行卡授权或身份验证。',
    processing: 'MoonPay 正在处理支付，资金尚未可用。', confirming: '正在等待 BNB 智能链上向你钱包发送的 USDT 转账确认。',
    completed: 'USDT 已到达钱包，转账已在 BNB 智能链上确认。', failed: 'MoonPay 报告支付失败。重试前请查看支付凭证。',
    expired: '24 小时后的上次检查未找到付款。再次充值前请重新检查。', testCompleted: '测试支付已完成，没有计入主网 USDT。',
    statuses: { awaiting_payment: '等待支付', action_required: '需要操作', processing: '处理支付中', confirming: '确认转账中', completed: '充值已确认', failed: '支付失败', expired: '支付页面已过期', test_completed: '测试已完成' },
  },
}

export function depositErrorMessage(reason: string | null | undefined, language: Language) {
  const t = copy[language]
  if (['not_configured', 'invalid_configuration', 'account_not_configured'].includes(reason ?? '')) return t.setup
  if (reason === 'sandbox_asset_unavailable') return t.sandboxUnavailable
  if (reason === 'identity_token_unavailable') return t.identity
  if (['wallet_not_verified', 'unauthorized'].includes(reason ?? '')) return t.verify
  if (['connection_unverified', 'https_required'].includes(reason ?? '')) return t.connection
  if (['rate_limited', 'too_many_pending'].includes(reason ?? '')) return t.limited
  if (reason === 'invalid_amount') return t.invalid
  if (['invalid_session', 'environment_changed'].includes(reason ?? '')) return t.changed
  return t.unavailable
}

const statusMessage = (session: DepositSession, language: Language) => {
  const t = copy[language]
  const status = session.status
  if (session.mode === 'sandbox') {
    if (status === 'awaiting_payment') return t.sandboxWaiting
    if (status === 'processing' || status === 'confirming') return t.sandboxProcessing
  }
  return ({ awaiting_payment: t.waiting, action_required: t.action, processing: t.processing, confirming: t.confirming,
    completed: t.completed, failed: t.failed, expired: t.expired, test_completed: t.testCompleted })[status]
}

export function DepositDialog({ open, onClose, controller, address, language }: {
  open: boolean; onClose: () => void; controller: DepositController; address: string; language: Language
}) {
  const dialog = React.useRef<HTMLDialogElement>(null)
  const t = copy[language]
  const [amount, setAmount] = React.useState('50')
  const [fiat, setFiat] = React.useState('usd')
  const config = controller.config
  const options = config?.fiatCurrencies ?? []
  const option = options.find(item => item.code === fiat) ?? options[0]
  const session = controller.sessions.find(item => item.id === controller.selectedId)
  const sandbox = (session?.mode ?? config?.mode) === 'sandbox'
  const asset = session ? sessionAsset(session) : checkoutAsset(config?.mode)
  const changedConfiguration = Boolean(session && config?.mode && (session.mode !== config.mode || asset.currencyCode !== checkoutAsset(config.mode).currencyCode))
  const validAmount = Boolean(option && /^[1-9]\d{0,8}$/.test(amount) && Number(amount) >= option.min && Number(amount) <= option.max)

  React.useEffect(() => {
    if (!open || !dialog.current) return
    const node = dialog.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const overflow = document.body.style.overflow
    node.showModal()
    document.body.style.overflow = 'hidden'
    return () => { node.close(); document.body.style.overflow = overflow; previous?.focus() }
  }, [open])

  React.useEffect(() => {
    if (!option) return
    setFiat(option.code)
    setAmount(current => Number(current) >= option.min && Number(current) <= option.max ? current : String(option.min))
  }, [option?.code, option?.min, option?.max])

  const chooseFiat = (code: string) => {
    setFiat(code)
    const next = options.find(item => item.code === code)
    if (next) setAmount(String(Math.max(next.min, Math.min(next.max, code === 'usd' ? 50 : next.min))))
  }

  return <dialog ref={dialog} className="deposit-dialog" aria-labelledby="deposit-title" aria-describedby="deposit-description"
    onCancel={event => { event.preventDefault(); onClose() }} onClick={event => {
      if (event.target !== dialog.current) return
      const rect = dialog.current.getBoundingClientRect()
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
    }}>
    <div className="deposit-dialog-head"><span className="app-label">FIRSTBELL / {sandbox ? 'SANDBOX' : session ? t.status.toUpperCase() : 'USDT'}</span><button type="button" aria-label={t.close} onClick={onClose}><X size={20} /></button></div>
    <h2 id="deposit-title">{session ? t.statuses[session.status] : sandbox ? t.sandboxTitle : t.title}</h2>
    <p id="deposit-description">{session ? statusMessage(session, language) : sandbox ? t.sandboxIntro : t.intro}</p>
    {sandbox && <p className="deposit-mode-note">{t.sandbox}</p>}
    {session ? <>
      <div className="deposit-status-icon" aria-hidden="true">{session.status === 'completed' || session.status === 'test_completed' ? <Check size={32} /> : isDepositTerminal(session.status) ? <CreditCard size={30} /> : <LoaderCircle className="deposit-spinner" size={30} />}</div>
      <dl className="deposit-summary"><div><dt>{t.paid}</dt><dd>{session.amount} {session.fiatCurrency.toUpperCase()}</dd></div>
        {session.mode === 'live' && session.receivedAmount && session.status === 'completed' && <div><dt>{t.sent}</dt><dd>{displayQuantity(session.receivedAmount)} USDT</dd></div>}
        <div><dt>{sandbox ? t.sandboxReceive : t.receive}</dt><dd>{asset.symbol}</dd></div>
        <div><dt>{t.network}</dt><dd>{asset.network}</dd></div><div><dt>{t.wallet}</dt><dd className="deposit-wallet">{address.slice(0, 8)}…{address.slice(-6)}</dd></div>
      </dl>
      {session.checkedAt && <p className="deposit-small">{t.checked}: {new Date(session.checkedAt).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en', { hour: '2-digit', minute: '2-digit' })}</p>}
      {(controller.error || changedConfiguration) && <p className="deposit-error" role="alert">{changedConfiguration ? t.changed : t.checkError}</p>}
      {(!isDepositTerminal(session.status) || session.status === 'expired') && <div className="deposit-status-actions"><button type="button" className="deposit-secondary" disabled={controller.checking} onClick={() => void controller.refresh(session.id)}><RefreshCw size={16} />{t.check}</button>
        {session.status === 'awaiting_payment' && <button type="button" className="deposit-primary" disabled={controller.busy || !config?.ready || config.mode !== session.mode || asset.currencyCode !== checkoutAsset(config.mode).currencyCode} onClick={() => void controller.checkout(session.amount, session.fiatCurrency, session.id)}>{controller.busy ? t.opening : t.resume}<ArrowUpRight size={16} /></button>}</div>}
      {session.transactionHash && <a className="deposit-receipt" href={`${asset.explorer}/tx/${session.transactionHash}`} target="_blank" rel="noreferrer">{sandbox ? t.sandboxReceipt : t.receipt}<ArrowUpRight size={15} /></a>}
      {(isDepositTerminal(session.status) || changedConfiguration) && <button type="button" className="deposit-primary" onClick={() => controller.select(null)}>{config?.mode === 'sandbox' ? t.sandboxNew : t.new}</button>}
    </> : controller.loading ? <div className="deposit-unavailable" role="status"><LoaderCircle className="deposit-spinner" size={25} /><p>{t.loading}</p></div>
      : !config?.ready ? <div className="deposit-unavailable" role="status"><CreditCard size={28} /><p>{depositErrorMessage(config?.reason, language)}</p><button type="button" className="deposit-secondary" onClick={controller.reload}>{t.retry}<RefreshCw size={15} /></button></div>
        : <form onSubmit={event => { event.preventDefault(); if (validAmount && option) void controller.checkout(amount, option.code) }}>
          <label className="deposit-amount-label" htmlFor="deposit-amount">{sandbox ? t.sandboxAmount : t.amount}</label><div className="deposit-amount-field"><input id="deposit-amount" autoFocus inputMode="numeric" type="number" step="1" min={option?.min} max={option?.max} value={amount} onChange={event => setAmount(event.target.value)} required />
            <select aria-label={t.currency} value={option?.code ?? ''} onChange={event => chooseFiat(event.target.value)}>{options.map(item => <option key={item.code} value={item.code}>{item.code.toUpperCase()}</option>)}</select></div>
          <p className="deposit-small">{t.limits}: {option?.min.toLocaleString()}–{option?.max.toLocaleString()} {option?.code.toUpperCase()}</p>
          {!validAmount && amount !== '' && <p className="deposit-error" role="alert">{t.invalid}</p>}
          <dl className="deposit-summary"><div><dt>{sandbox ? t.sandboxReceive : t.receive}</dt><dd>{asset.symbol}</dd></div><div><dt>{t.network}</dt><dd>{asset.network}</dd></div>
            <div><dt>{t.wallet}</dt><dd><a className="deposit-wallet" href={`${asset.explorer}/address/${address}`} target="_blank" rel="noreferrer">{address.slice(0, 8)}…{address.slice(-6)}<ArrowUpRight size={13} /></a></dd></div></dl>
          {sandbox && <div className="deposit-test-card">
            <span className="app-label">{t.sandboxCard}</span><code>4485 0403 7153 6584</code>
            <dl><div><dt>{t.sandboxExpiry}</dt><dd>12/2030</dd></div><div><dt>CVC</dt><dd>123</dd></div></dl>
            <p>{t.sandboxBilling}</p><p>{t.sandboxDelivery}</p>
          </div>}
          <p className="deposit-small">{sandbox ? t.sandboxFees : `${t.fees} ${t.timing}`}</p>
          {controller.error && <p className="deposit-error" role="alert">{depositErrorMessage(controller.error, language)}</p>}
          <button type="submit" className="deposit-primary" disabled={!validAmount || controller.busy}><CreditCard size={18} />{controller.busy ? t.opening : sandbox ? t.sandboxContinue : t.continue}<ArrowUpRight size={16} /></button>
          <p className="deposit-provider">{t.provider}</p>
        </form>}
  </dialog>
}

export function DepositStatusCard({ controller, language, onOpen }: { controller: DepositController; language: Language; onOpen: (id: string) => void }) {
  const session = controller.sessions.find(item => !isDepositTerminal(item.status)) ?? controller.sessions[0]
  if (!session) return null
  const t = copy[language]
  return <button type="button" className="deposit-status-card" onClick={() => onOpen(session.id)} aria-label={`${t.details}: ${t.statuses[session.status]}`}>
    <span className="deposit-status-symbol" aria-hidden="true">{session.status === 'completed' ? <Check size={19} /> : <CreditCard size={19} />}</span>
    <span><strong>{t.statuses[session.status]}</strong><small>{session.mode === 'sandbox' ? t.sandbox : `${session.amount} ${session.fiatCurrency.toUpperCase()} → USDT / BNB Smart Chain`}</small></span><ArrowUpRight size={17} />
  </button>
}

export function DepositHistory({ controller, language, onOpen }: { controller: DepositController; language: Language; onOpen: (id: string) => void }) {
  const t = copy[language]
  return <div className="deposit-history"><h2 className="app-label">{t.history.toUpperCase()}</h2>
    {controller.loading ? <p role="status">{t.loading}</p> : controller.sessions.length ? <div className="deposit-history-rows">{controller.sessions.map((session: DepositSession) =>
      <button type="button" key={session.id} onClick={() => onOpen(session.id)}><CreditCard size={20} /><span><strong>{session.amount} {session.fiatCurrency.toUpperCase()}</strong><small>{new Date(session.createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en', { month: 'short', day: 'numeric' })}{session.mode === 'sandbox' ? ' / TEST' : ' / BNB Smart Chain'}</small></span><span className="deposit-history-status">{t.statuses[session.status]}</span><ArrowUpRight size={15} /></button>
    )}</div> : <div className="portfolio-content-empty"><CreditCard size={25} /><h2>{t.historyEmpty}</h2><p>{controller.error ? depositErrorMessage(controller.error, language) : t.historyHint}</p></div>}
  </div>
}
