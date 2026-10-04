import * as React from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, Pencil, Search } from 'lucide-react'
import { displayQuantity, readWalletBalances, type WalletBalances } from './wallet-balances'
import { PRIVY_APP_ID } from './privy-config'
import { getTokenPrices } from './market-api'
import { useDeposits, type DepositController } from './deposits-api'
import { DepositHistory, DepositPage } from './deposit'
import { useOnramperDemo } from './onramper-demo'
import { isOnramperDemo } from '../lib/onramper-demo'
import { portfolioAvatar } from '../lib/portfolio-avatar'
import { assetLogo, tokenLogoError, type CatalogAsset as Asset } from '../lib/asset-catalog'
import './portfolio.css'

type Language = 'en' | 'zh'
type Props = { assets: Asset[]; language: Language; onInspect: (asset: Asset) => void }
type Account = {
  configured: boolean; ready: boolean; authenticated: boolean; email?: string; address?: string;
  walletReady: boolean; balances: WalletBalances | null; loading: boolean; error: boolean;
  login: () => void; deposits?: DepositController;
}
const copy = {
  en: {
    title: 'Portfolio', start: 'Your portfolio starts here', intro: 'Sign in with Google or email.',
    login: 'Create account', setup: 'Sign-in is being connected.', checking: 'Checking your account…',
    deposit: 'Deposit', withdraw: 'Withdraw', positions: 'Positions', activity: 'Activity', search: 'Search',
    noPositions: 'No positions found', noActivity: 'No activity yet', hide: 'Hide balance', show: 'Show balance',
    loading: 'Loading…', error: 'Balance unavailable', preparing: 'Preparing your wallet…',
    edit: 'Edit name', name: 'Display name', unavailable: 'Value unavailable',
  },
  zh: {
    title: '资产', start: '从这里开始建立你的资产组合', intro: '使用 Google 或邮箱登录。',
    login: '创建账户', setup: '登录功能正在接入。', checking: '正在检查账户…',
    deposit: '充值', withdraw: '提现', positions: '持仓', activity: '活动', search: '搜索',
    noPositions: '没有找到持仓', noActivity: '暂无活动', hide: '隐藏余额', show: '显示余额',
    loading: '加载中…', error: '余额暂不可用', preparing: '正在准备钱包…',
    edit: '编辑名称', name: '显示名称', unavailable: '估值暂不可用',
  },
}

function ConnectedPortfolio(props: Props) {
  const { ready, authenticated, user, login, getAccessToken } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const [balances, setBalances] = React.useState<WalletBalances | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(false)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const wallet = wallets.find(item => item.walletClientType === 'privy' || item.walletClientType === 'privy_v2')
  const address = authenticated && walletsReady ? wallet?.address : undefined
  const deposits = useDeposits(isOnramperDemo(window.location.search) ? undefined : address, getAccessToken)
  const completedDeposits = React.useRef('')
  React.useEffect(() => {
    const completed = deposits.sessions.filter(session => session.mode === 'live' && session.status === 'completed').map(session => session.id).join(',')
    const key = `${address ?? ''}:${completed}`
    if (completedDeposits.current !== key) {
      completedDeposits.current = key
      if (completed) setRefreshKey(value => value + 1)
    }
  }, [address, deposits.sessions])
  React.useEffect(() => {
    if (!address) { setBalances(null); setError(false); setLoading(false); return }
    let active = true
    setBalances(null); setLoading(true); setError(false)
    readWalletBalances(address, props.assets).then(result => {
      if (active) { setBalances(result); setLoading(false) }
    }).catch(() => { if (active) { setError(true); setLoading(false) } })
    return () => { active = false }
  }, [address, props.assets, refreshKey])
  React.useEffect(() => {
    if (!address) return
    const refresh = () => setRefreshKey(value => value + 1)
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [address])
  return <PortfolioView {...props} key={address ?? user?.id ?? 'guest'} account={{
    configured: true, ready, authenticated, walletReady: walletsReady,
    email: user?.email?.address ?? user?.google?.email ?? undefined,
    address, balances, loading, error, deposits, login,
  }} />
}

export function PortfolioWorkspace(props: Props) {
  if (PRIVY_APP_ID) return <ConnectedPortfolio {...props} />
  return <PortfolioView {...props} account={{ configured: false, ready: true, authenticated: false, walletReady: false, balances: null, loading: false, error: false, login: () => {} }} />
}
const money = (value: number) => `US$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// A presentational view allows explicit local QA fixtures without bypassing Privy.
export function PortfolioView({ assets, language, onInspect, account }: Props & { account: Account }) {
  const reduceMotion = useReducedMotion()
  const t = copy[language]
  const [section, setSection] = React.useState<'positions' | 'activity'>(() => new URLSearchParams(window.location.search).has('deposit') ? 'activity' : 'positions')
  const [search, setSearch] = React.useState('')
  const [hidden, setHidden] = React.useState(false)
  const [depositPage, setDepositPage] = React.useState(() => new URLSearchParams(window.location.search).get('view') === 'deposit')
  const demoCard = isOnramperDemo(window.location.search)
  const demo = useOnramperDemo(demoCard && depositPage)
  const [editing, setEditing] = React.useState(false)
  const storageKey = `firstbell-display-name:${account.address ?? account.email ?? 'guest'}`
  const defaultName = account.email?.split('@')[0] || 'FirstBell'
  const [name, setName] = React.useState(() => { try { return localStorage.getItem(storageKey) || defaultName } catch { return defaultName } })
  const [prices, setPrices] = React.useState<Record<string, number | null>>({})
  const holdings = (account.balances?.tokens ?? []).filter(token => token.raw > 0n)
  const positions = holdings.map(token => ({ ...token, asset: assets.find(asset => asset.symbol === token.symbol) }))
    .filter(row => row.asset && `${row.asset.company} ${row.symbol}`.toLowerCase().includes(search.trim().toLowerCase()))

  React.useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    setPrices({})
    const symbols = (account.balances?.tokens ?? []).filter(token => token.raw > 0n).map(token => token.symbol)
    void (async () => {
      for (let start = 0; start < symbols.length && !controller.signal.aborted; start += 100) {
        const batch = symbols.slice(start, start + 100)
        let values: Record<string, number | null>
        try { values = Object.fromEntries((await getTokenPrices(batch, controller.signal)).map(item => [item.symbol, item.priceUsd])) }
        catch { values = Object.fromEntries(batch.map(symbol => [symbol, null])) }
        if (active) setPrices(current => ({ ...current, ...values }))
      }
    })().finally(() => window.clearTimeout(timeout))
    return () => { active = false; controller.abort(); window.clearTimeout(timeout) }
  }, [account.balances])
  React.useEffect(() => {
    const sync = () => setDepositPage(new URLSearchParams(window.location.search).get('view') === 'deposit')
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  const navigateDeposit = (open: boolean) => {
    setDepositPage(open)
    const url = new URL(window.location.href)
    if (open) url.searchParams.set('view', 'deposit')
    else url.searchParams.delete('view')
    window.history.pushState(null, '', url.pathname + url.search + url.hash)
    window.scrollTo({ top: 0 })
  }
  const openDeposit = (id: string) => {
    account.deposits?.select(account.deposits.selectedId === id ? null : id)
    void account.deposits?.refresh(id)
  }
  React.useEffect(() => {
    if (!account.authenticated || account.deposits?.loading) return
    const url = new URL(window.location.href)
    if (!url.searchParams.has('deposit')) return
    // Callback parameters are navigation hints, never payment evidence.
    for (const key of ['deposit', 'transactionId', 'transactionStatus']) url.searchParams.delete(key)
    url.searchParams.delete('view')
    setSection('activity'); setDepositPage(false)
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }, [account.authenticated, account.deposits?.loading])

  const positionValue = holdings.every(token => prices[token.symbol] != null)
    ? holdings.reduce((sum, token) => sum + Number(token.quantity) * prices[token.symbol]!, 0) : null
  const placeholder = account.error ? t.error : !account.address ? t.preparing : t.loading
  const balance = account.balances && Number.isFinite(Number(account.balances.usdt)) ? money(Number(account.balances.usdt)) : placeholder
  const value = account.balances && positionValue != null && Number.isFinite(positionValue) ? money(positionValue)
    : account.balances && holdings.some(token => prices[token.symbol] === null) ? t.unavailable : placeholder
  const saveName = () => {
    const next = name.trim().slice(0, 40) || defaultName
    setName(next); setEditing(false)
    try { localStorage.setItem(storageKey, next) } catch { /* The name still works for this session. */ }
  }
  return <section className="portfolio-workspace" aria-label={t.title}>
    <AnimatePresence mode="wait" initial={false}>
      {!account.ready || !account.authenticated ? <motion.div key="guest" className="portfolio-guest" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <img className="portfolio-avatar" src={portfolioAvatar} alt="" />
        <h1>{t.start}</h1><p>{t.intro}</p>
        <button type="button" className="portfolio-primary" disabled={!account.configured || !account.ready} onClick={account.login}>{account.ready ? t.login : t.checking}<ArrowRight size={18} /></button>
        {!account.configured && <small>{t.setup}</small>}
      </motion.div> : depositPage && account.address ? <motion.div key="deposit" initial={reduceMotion ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .2 }}>
        <DepositPage address={account.address} language={language} onBack={() => navigateDeposit(false)}
          demo={demoCard} onCard={() => void (demoCard ? demo.checkout() : account.deposits?.checkout())}
          busy={demoCard ? demo.busy : account.deposits?.busy} error={demoCard ? demo.error : account.deposits?.error} />
      </motion.div> : <motion.div key="account" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="portfolio-account-head">
          <img className="portfolio-avatar" src={portfolioAvatar} alt="" />
          {editing ? <input className="portfolio-name-input" aria-label={t.name} autoFocus value={name} maxLength={40} onChange={event => setName(event.target.value)} onBlur={saveName} onKeyDown={event => { if (event.key === 'Enter') saveName(); if (event.key === 'Escape') { setEditing(false); setName(defaultName) } }} /> : <span className="portfolio-name">{name}</span>}
          <button className="portfolio-name-edit" type="button" aria-label={t.edit} onClick={() => setEditing(true)}><Pencil size={17} strokeWidth={2} /></button>
        </div>
        <div className="portfolio-balance-row"><h1 title="USDT balance, displayed at US$1 per USDT" aria-live="polite">{hidden ? '••••••' : balance}</h1><button type="button" aria-label={hidden ? t.show : t.hide} onClick={() => setHidden(current => !current)}>{hidden ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
        <div className="portfolio-position-value"><span>{t.positions}</span><strong aria-live="polite">{hidden ? '••••••' : value}</strong></div>
        <div className="portfolio-action-row"><button type="button" disabled={!account.address || !account.walletReady} onClick={() => navigateDeposit(true)}>{t.deposit}</button><button type="button" disabled>{t.withdraw}</button></div>
        <div className="portfolio-tabs" role="tablist" aria-label={t.title}>{(['positions', 'activity'] as const).map(id => <button type="button" role="tab" id={`portfolio-tab-${id}`} aria-controls="portfolio-results" key={id} aria-selected={section === id} className={section === id ? 'active' : ''} onClick={() => { setSection(id); setSearch('') }}>{t[id]}</button>)}</div>
        <label className="portfolio-search"><Search size={20} strokeWidth={2} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t.search} aria-label={t.search} /></label>
        <div id="portfolio-results" role="tabpanel" aria-labelledby={`portfolio-tab-${section}`}>
          {section === 'activity' && account.deposits ? <DepositHistory controller={account.deposits} language={language} search={search} onOpen={openDeposit} /> : section === 'positions' && positions.length ? <div className="portfolio-rows">{positions.map(({ asset, quantity }) => asset && <button type="button" className="portfolio-position-row" key={asset.symbol} onClick={() => onInspect(asset)}><img className={`brand-mark brand-mark--${asset.mark}`} src={assetLogo(asset)} alt="" loading="lazy" onError={tokenLogoError} /><span><strong>{asset.symbol}</strong><small>{asset.company}</small></span><strong>{hidden ? '••••' : displayQuantity(quantity)}</strong></button>)}</div>
            : <div className="portfolio-content-empty" role="status">{section === 'positions' ? account.error ? t.error : account.loading || !account.address ? t.loading : t.noPositions : t.noActivity}</div>}
        </div>
      </motion.div>}
    </AnimatePresence>
  </section>
}
