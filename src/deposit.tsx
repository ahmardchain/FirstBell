import * as React from 'react'
import { ArrowLeft, ArrowUpRight, Check, Copy, CreditCard, Landmark, LoaderCircle, QrCode, RefreshCw } from 'lucide-react'
import { checkoutAsset, depositProvider, isDepositTerminal, sessionAsset, type DepositSession } from '../lib/funding'
import type { DepositController } from './deposits-api'
import './deposit.css'

type Language = 'en' | 'zh'
const copy = {
  en: {
    setup: 'Onramper is being connected. Please try again later.',
    unavailable: 'Onramper could not be opened. Please try again.', retry: 'Try again',
    verify: 'Your wallet could not be verified. Sign in again and retry.',
    session: 'Your sign-in session could not be verified. Refresh the page and try again.',
    identity: 'Wallet verification needs to be enabled for this app.',
    verificationUnavailable: 'Wallet verification is temporarily unavailable. Please try again.',
    timeout: 'This request took too long. Please try again.',
    connection: 'Your connection could not be verified. Reopen Onramper on the same network.',
    limited: 'Please wait a minute before opening another checkout.',
    check: 'Check status', checking: 'Checking…', resume: 'Open checkout', opening: 'Opening Onramper…',
    loading: 'Loading activity…', receipt: 'View receipt', changed: 'This checkout is no longer available.',
    waiting: 'Finish your card checkout.', processing: 'Your payment is processing.',
    confirming: 'Your transfer is being confirmed.', completed: 'Your deposit is confirmed.',
    testCompleted: 'Checkout completed.', failed: 'The payment failed. Check your provider receipt.',
    expired: 'This checkout has expired. Check its status before starting again.',
    statuses: { awaiting_payment: 'Awaiting payment', action_required: 'Action needed', processing: 'Processing', confirming: 'Confirming', completed: 'Deposit confirmed', failed: 'Failed', expired: 'Expired', test_completed: 'Checkout completed' },
  },
  zh: {
    setup: 'Onramper 正在接入，请稍后重试。', unavailable: '无法打开 Onramper，请重试。', retry: '重试',
    verify: '无法验证你的钱包，请重新登录后重试。', session: '无法验证登录状态，请刷新页面后重试。',
    identity: '此应用需要启用钱包验证。', verificationUnavailable: '钱包验证暂不可用，请重试。', timeout: '请求超时，请重试。', connection: '无法验证网络连接，请在同一网络上重新打开 Onramper。',
    limited: '请等待一分钟后再打开支付页面。', check: '查看状态', checking: '正在检查…', resume: '打开支付页面', opening: '正在打开 Onramper…',
    loading: '正在加载活动…', receipt: '查看凭证', changed: '此支付页面已不可用。',
    waiting: '请完成银行卡支付。', processing: '支付正在处理中。', confirming: '正在确认转账。',
    completed: '充值已确认。', testCompleted: '支付流程已完成。', failed: '支付失败，请查看支付方凭证。', expired: '支付页面已过期，请先查看状态。',
    statuses: { awaiting_payment: '等待支付', action_required: '需要操作', processing: '处理中', confirming: '确认中', completed: '充值已确认', failed: '失败', expired: '已过期', test_completed: '支付流程已完成' },
  },
}

export function depositErrorMessage(reason: string | null | undefined, language: Language) {
  const t = copy[language]
  if (reason === 'demo_not_configured') return language === 'zh' ? '演示需要 Onramper 测试密钥。' : 'The demo needs an Onramper test key.'
  if (['not_configured', 'invalid_configuration', 'account_not_configured', 'sandbox_asset_unavailable', 'asset_unavailable'].includes(reason ?? '')) return t.setup
  if (['identity_token_unavailable', 'wallet_verification_not_configured'].includes(reason ?? '')) return t.identity
  if (reason === 'wallet_verification_unavailable') return t.verificationUnavailable
  if (['session_timeout', 'checkout_timeout'].includes(reason ?? '')) return t.timeout
  if (['unauthorized', 'session_unavailable', 'session_refresh_failed'].includes(reason ?? '')) return t.session
  if (reason === 'wallet_not_verified') return t.verify
  if (['connection_unverified', 'https_required'].includes(reason ?? '')) return t.connection
  if (['rate_limited', 'too_many_pending'].includes(reason ?? '')) return t.limited
  if (['invalid_session', 'environment_changed'].includes(reason ?? '')) return t.changed
  return t.unavailable
}

const statusMessage = (session: DepositSession, language: Language) => {
  const t = copy[language]
  return ({ awaiting_payment: t.waiting, action_required: t.waiting, processing: t.processing,
    confirming: t.confirming, completed: t.completed, failed: t.failed, expired: t.expired,
    test_completed: t.testCompleted })[session.status]
}

export function DepositPage({ address, language, onBack, onCard, busy = false, error, demo = false }: {
  address: string; language: Language; onBack: () => void; onCard: () => void; busy?: boolean; error?: string | null; demo?: boolean
}) {
  const t = language === 'zh' ? {
    title: '充值', back: '返回', manual: '手动转入', exchange: '从交易所充值', card: '添加资金',
    last: '上次使用', network: 'BNB 智能链', cardHint: 'Onramper', receive: '接收 USDT',
    address: '钱包地址', copy: '复制地址', copied: '已复制', copyError: '无法复制，请选中地址后复制。',
    note: '请使用 BNB 智能链（BEP20）转入 USDT。', exchangeNote: '在交易所选择提现，选择 USDT、BNB 智能链（BEP20）并使用下方地址。',
    qr: '钱包地址二维码', qrError: '二维码暂不可用，请复制下方地址。',
  } : {
    title: 'Deposit', back: 'Back', manual: 'Transfer Manually', exchange: 'Deposit from Exchange', card: 'Add Money',
    last: 'Last Used', network: 'BNB Smart Chain', cardHint: 'Onramper', receive: 'Receive USDT',
    address: 'Wallet address', copy: 'Copy address', copied: 'Copied', copyError: 'Could not copy. Select the address to copy it.',
    note: 'Send USDT using BNB Smart Chain (BEP20).', exchangeNote: 'Choose Withdraw in your exchange, then select USDT and BNB Smart Chain (BEP20) and use this address.',
    qr: 'Wallet address QR code', qrError: 'QR unavailable. Copy the address below.',
  }
  const [method, setMethod] = React.useState<'methods' | 'manual' | 'exchange'>('methods')
  const [lastUsed, setLastUsed] = React.useState(() => { try { return localStorage.getItem(`firstbell-deposit-method:${address}`) } catch { return null } })
  const [qr, setQr] = React.useState('')
  const [qrFailed, setQrFailed] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [copyFailed, setCopyFailed] = React.useState(false)
  const addressInput = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => {
    if (method === 'methods') return
    let active = true
    setQr(''); setQrFailed(false)
    void import('qrcode').then(module => module.toDataURL(address, { width: 512, margin: 4, errorCorrectionLevel: 'M' }))
      .then(data => { if (active) setQr(data) }).catch(() => { if (active) setQrFailed(true) })
    return () => { active = false }
  }, [address, method])
  const choose = (next: 'manual' | 'exchange' | 'card') => {
    if (next === 'card' && busy) return
    setLastUsed(next); setCopied(false); setCopyFailed(false)
    try { localStorage.setItem(`firstbell-deposit-method:${address}`, next) } catch { /* Optional preference only. */ }
    if (next === 'card') onCard()
    else setMethod(next)
  }
  const copyAddress = async () => {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(address)
      else {
        addressInput.current?.select()
        if (!document.execCommand('copy')) throw new Error('Clipboard unavailable')
      }
      setCopied(true); setCopyFailed(false)
    }
    catch { setCopyFailed(true) }
  }
  const badges = (kind: 'crypto' | 'exchange' | 'card') => <span className="funding-badges" aria-hidden="true">{(kind === 'crypto' ? ['usdt'] : kind === 'exchange' ? ['coinbase', 'binance'] : ['visa', 'mastercard']).map(mark => <span key={mark} className={`funding-badge funding-badge--${mark}`}><img src={mark === 'coinbase' ? '/assets/marks/coinbase.svg' : `/assets/funding/${mark}.svg`} alt="" /></span>)}</span>
  return <div className="funding-page">
    <div className="funding-page-head"><button type="button" aria-label={t.back} onClick={() => method === 'methods' ? onBack() : setMethod('methods')}><ArrowLeft size={21} /></button><h1>{method === 'methods' ? t.title : method === 'exchange' ? t.exchange : t.manual}</h1></div>
    {method === 'methods' ? <div className="funding-options">
      {([
        { id: 'manual', title: t.manual, icon: QrCode, badges: 'crypto', hint: t.network },
        { id: 'exchange', title: t.exchange, icon: Landmark, badges: 'exchange', hint: t.network },
        { id: 'card', title: t.card, icon: CreditCard, badges: 'card', hint: demo ? `${t.cardHint} · ${language === 'zh' ? '演示' : 'Demo'}` : t.cardHint },
      ] as const).map(item => <button type="button" className="funding-method" key={item.id} disabled={item.id === 'card' && busy} aria-busy={item.id === 'card' && busy} onClick={() => choose(item.id)}>
        <span className="funding-method-icon">{item.id === 'card' && busy ? <LoaderCircle className="deposit-spinner" size={22} /> : <item.icon size={22} strokeWidth={1.8} />}</span>
        <span className="funding-method-content"><span className="funding-method-title">{item.id === 'card' && busy ? language === 'zh' ? '正在打开 Onramper…' : 'Opening Onramper…' : item.title}</span><span className="funding-method-meta">{badges(item.badges)}<span>{item.hint}</span></span></span>
        {lastUsed === item.id && <span className="funding-last-used">{t.last}</span>}
      </button>)}
      {error && <p className="deposit-error" role="alert">{depositErrorMessage(error, language)}</p>}
    </div> : <div className="funding-receive">
      <h2>{t.receive}</h2><p>{method === 'exchange' ? t.exchangeNote : t.note}</p>
      <div className="funding-qr">{qr ? <img src={qr} alt={t.qr} /> : qrFailed ? <p>{t.qrError}</p> : <LoaderCircle className="deposit-spinner" size={25} />}</div>
      <span className="funding-network">{badges('crypto')}{t.network}</span>
      <label className="funding-address"><span>{t.address}</span><input ref={addressInput} readOnly value={address} aria-label={t.address} onFocus={event => event.currentTarget.select()} /></label>
      <button type="button" className="deposit-primary" onClick={() => void copyAddress()}>{copied ? <Check size={18} /> : <Copy size={18} />}{copied ? t.copied : t.copy}</button>
      <span className="sr-only" role="status">{copied ? t.copied : ''}</span>
      {copyFailed && <p className="deposit-error" role="alert">{t.copyError}</p>}
    </div>}
  </div>
}

export function DepositHistory({ controller, language, onOpen, search = '', hideEmpty = false }: { controller: DepositController; language: Language; onOpen: (id: string) => void; search?: string; hideEmpty?: boolean }) {
  const t = copy[language]
  const sessions = controller.sessions.filter(session => `${depositProvider(session) === 'onramper' ? 'Onramper' : 'MoonPay'} ${session.amount} ${session.fiatCurrency} ${t.statuses[session.status]}`.toLowerCase().includes(search.trim().toLowerCase()))
  return <div className="deposit-history">
    {controller.loading ? <div className="portfolio-content-empty" role="status">{t.loading}</div> : sessions.length ? <div className="deposit-history-rows">{sessions.map(session => {
      const selected = session.id === controller.selectedId
      const asset = sessionAsset(session)
      const compatible = controller.config?.mode === session.mode && depositProvider(session) === (controller.config.provider ?? 'moonpay') && checkoutAsset(controller.config.mode, controller.config.provider).currencyCode === asset.currencyCode
      return <React.Fragment key={session.id}>
        <button type="button" aria-expanded={selected} aria-controls={`deposit-${session.id}`} onClick={() => onOpen(session.id)}><CreditCard size={20} /><span><strong>{session.amount ? `${session.amount} ${session.fiatCurrency.toUpperCase()}` : depositProvider(session) === 'onramper' ? 'Onramper' : 'MoonPay'}</strong><small>{new Date(session.createdAt).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en', { month: 'short', day: 'numeric' })}</small></span><span className="deposit-history-status">{t.statuses[session.status]}</span><ArrowUpRight size={15} /></button>
        {selected && <div className="deposit-activity-details" id={`deposit-${session.id}`}>
          <p role="status">{statusMessage(session, language)}</p>
          {controller.error && <p className="deposit-error" role="alert">{depositErrorMessage(controller.error, language)}</p>}
          {(!isDepositTerminal(session.status) || session.status === 'expired') && <div className="deposit-activity-actions">
            <button type="button" className="deposit-secondary" disabled={controller.checking} onClick={() => void controller.refresh(session.id)}><RefreshCw size={16} />{controller.checking ? t.checking : t.check}</button>
            {session.status === 'awaiting_payment' && <button type="button" className="deposit-primary" disabled={controller.busy || !compatible} onClick={() => void controller.checkout(session.id)}>{controller.busy ? t.opening : t.resume}<ArrowUpRight size={16} /></button>}
          </div>}
          {session.transactionHash && !(session.provider === 'onramper' && session.mode === 'sandbox') && <a className="deposit-receipt" href={`${asset.explorer}/tx/${session.transactionHash}`} target="_blank" rel="noreferrer">{t.receipt}<ArrowUpRight size={15} /></a>}
        </div>}
      </React.Fragment>
    })}</div> : hideEmpty && !controller.error ? null : <div className="portfolio-content-empty" role="status">{controller.error ? depositErrorMessage(controller.error, language) : language === 'zh' ? '暂无活动' : 'No activity yet'}</div>}
  </div>
}
