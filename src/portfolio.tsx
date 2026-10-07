import * as React from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, Eye, EyeOff, LogOut, Pencil, Search } from 'lucide-react'
import { readWalletBalances, type WalletBalances } from './wallet-balances'
import { PRIVY_APP_ID } from './privy-config'
import { getPortfolioChanges, getTokenPrices, type TokenPrice } from './market-api'
import { useDeposits, type DepositController } from './deposits-api'
import { DepositPage } from './deposit'
import { useOnramperDemo } from './onramper-demo'
import { isOnramperDemo } from '../lib/onramper-demo'
import { portfolioAvatar } from '../lib/portfolio-avatar'
import { type CatalogAsset as Asset } from '../lib/asset-catalog'
import { useWithdrawals, type WithdrawalController } from './withdrawals-api'
import { WithdrawalPage } from './withdrawal'
import { PortfolioPosition } from './portfolio-position'
import { PortfolioActivity } from './portfolio-activity'
import { useCashActivity, usePortfolioRecords, usePurchaseBasis, type CashActivityController } from './portfolio-data'
import type { PurchaseBasis } from '../lib/portfolio-performance'
import type { AgentOrder } from '../lib/agent-trading'
import type { WithdrawalRecord } from '../lib/withdrawal-history'
import './portfolio.css'

type Language = 'en' | 'zh'
type Props = { assets: Asset[]; language: Language; onInspect: (asset: Asset) => void; onSell: (asset: Asset) => void }
type Account = {
  configured: boolean; ready: boolean; authenticated: boolean; email?: string; address?: string;
  walletReady: boolean; balances: WalletBalances | null; loading: boolean; error: boolean;
  orders?: AgentOrder[]; withdrawalHistory?: WithdrawalRecord[]; cashActivity?: CashActivityController; orderError?: boolean; purchaseBasis?: Record<string, PurchaseBasis>;
  login: () => void; logout: () => Promise<void>; deposits?: DepositController; withdrawals?: WithdrawalController;
}
const copy = {
  en: {
    title: 'Portfolio', start: 'Your portfolio starts here', intro: 'Sign in with Google or email.',
    login: 'Create account', setup: 'Sign-in is being connected.', checking: 'Checking your account…',
    deposit: 'Deposit', withdraw: 'Withdraw', positions: 'Positions', activity: 'Activity', search: 'Search', sell: 'Sell',
    total: 'Total balance', cash: 'Available USDT', totalInfo: 'USDT plus the current estimated value of token positions, in USD',
    noPositions: 'No positions found', noActivity: 'No activity yet', hide: 'Hide balance', show: 'Show balance',
    loading: 'Loading…', error: 'Balance unavailable', preparing: 'Preparing your wallet…',
    edit: 'Edit name', name: 'Display name', unavailable: 'Value unavailable',
    logout: 'Log out', loggingOut: 'Logging out…', logoutError: 'Could not log out. Please try again.',
  },
  zh: {
    title: '资产', start: '从这里开始建立你的资产组合', intro: '使用 Google 或邮箱登录。',
    login: '创建账户', setup: '登录功能正在接入。', checking: '正在检查账户…',
    deposit: '充值', withdraw: '提现', positions: '持仓', activity: '活动', search: '搜索', sell: '卖出',
    total: '总余额', cash: '可用 USDT', totalInfo: 'USDT 加上代币持仓的当前预计美元价值',
    noPositions: '没有找到持仓', noActivity: '暂无活动', hide: '隐藏余额', show: '显示余额',
    loading: '加载中…', error: '余额暂不可用', preparing: '正在准备钱包…',
    edit: '编辑名称', name: '显示名称', unavailable: '估值暂不可用',
    logout: '退出登录', loggingOut: '正在退出…', logoutError: '退出失败，请重试。',
  },
}

function ConnectedPortfolio(props: Props) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const [snapshot, setSnapshot] = React.useState<{ owner: string; balances: WalletBalances } | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(false)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const wallet = wallets.find(item => item.walletClientType === 'privy' || item.walletClientType === 'privy_v2')
  const address = authenticated && walletsReady ? wallet?.address : undefined
  const balances = snapshot?.owner.toLowerCase() === address?.toLowerCase() ? snapshot?.balances ?? null : null
  const deposits = useDeposits(isOnramperDemo(window.location.search) ? undefined : address, getAccessToken)
  const refreshBalance = React.useCallback(() => setRefreshKey(value => value + 1), [])
  const withdrawals = useWithdrawals(address, wallet, refreshBalance)
  const records = usePortfolioRecords(address, getAccessToken)
  const cashActivity = useCashActivity(address, getAccessToken)
  const holdingsKey = (balances?.tokens ?? []).filter(token => token.raw > 0n).map(token => token.symbol).sort().join(',')
  const purchaseBasis = usePurchaseBasis(address, holdingsKey, balances?.checkedAt.getTime(), getAccessToken)
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
    if (!address) { setSnapshot(null); setError(false); setLoading(false); return }
    let active = true
    setSnapshot(current => current?.owner.toLowerCase() === address.toLowerCase() ? current : null); setLoading(true); setError(false)
    readWalletBalances(address, props.assets).then(result => {
      if (active) { setSnapshot({ owner: address, balances: result }); setLoading(false) }
    }).catch(() => { if (active) { setSnapshot(null); setError(true); setLoading(false) } })
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
    address, balances, loading, error, deposits, withdrawals, login, logout,
    orders: records.orders, withdrawalHistory: records.withdrawals, orderError: records.orderError, cashActivity, purchaseBasis,
  }} />
}

export function PortfolioWorkspace(props: Props) {
  if (PRIVY_APP_ID) return <ConnectedPortfolio {...props} />
  return <PortfolioView {...props} account={{ configured: false, ready: true, authenticated: false, walletReady: false, balances: null, loading: false, error: false, login: () => {}, logout: async () => {} }} />
}
const money = (value: number) => `US$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// A presentational view allows explicit local QA fixtures without bypassing Privy.
export function PortfolioView({ assets, language, onInspect, onSell, account }: Props & { account: Account }) {
  const reduceMotion = useReducedMotion()
  const t = copy[language]
  const [section, setSection] = React.useState<'positions' | 'activity'>(() => new URLSearchParams(window.location.search).has('deposit') ? 'activity' : 'positions')
  const [search, setSearch] = React.useState('')
  const [hidden, setHidden] = React.useState(false)
  const [view, setView] = React.useState(() => new URLSearchParams(window.location.search).get('view') ?? '')
  const depositPage = view === 'deposit'
  const demoCard = isOnramperDemo(window.location.search)
  const demo = useOnramperDemo(demoCard && depositPage)
  const [editing, setEditing] = React.useState(false)
  const [loggingOut, setLoggingOut] = React.useState(false)
  const [logoutError, setLogoutError] = React.useState(false)
  const logoutPending = React.useRef(false)
  const storageKey = `firstbell-display-name:${account.address ?? account.email ?? 'guest'}`
  const defaultName = account.email?.split('@')[0] || 'FirstBell'
  const [name, setName] = React.useState(() => { try { return localStorage.getItem(storageKey) || defaultName } catch { return defaultName } })
  const [markets, setMarkets] = React.useState<Record<string, TokenPrice>>({})
  const [changes, setChanges] = React.useState<Record<string, number | null>>({})
  const holdings = (account.balances?.tokens ?? []).filter(token => token.raw > 0n)
  const positions = holdings.map(token => ({ ...token, asset: assets.find(asset => asset.symbol === token.symbol) }))
    .filter(row => row.asset && `${row.asset.company} ${row.symbol}`.toLowerCase().includes(search.trim().toLowerCase()))

  const symbolsKey = holdings.map(token => token.symbol).sort().join(',')
  const balanceCheckedAt = account.balances?.checkedAt.getTime()
  React.useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    const symbols = symbolsKey ? symbolsKey.split(',') : []
    setMarkets(current => Object.fromEntries(symbols.filter(symbol => current[symbol]).map(symbol => [symbol, current[symbol]])))
    const batches = Array.from({ length: Math.ceil(symbols.length / 100) }, (_, index) => symbols.slice(index * 100, (index + 1) * 100))
    void Promise.allSettled(batches.map(async batch => {
      let rows: TokenPrice[]
      try { rows = await getTokenPrices(batch, controller.signal) }
      catch { rows = batch.map(symbol => ({ symbol, priceUsd: null, change24hPct: null, asOf: null })) }
      if (active) setMarkets(current => ({ ...current, ...Object.fromEntries(rows.map(row => [row.symbol, row])) }))
    })).finally(() => window.clearTimeout(timeout))
    return () => { active = false; controller.abort(); window.clearTimeout(timeout) }
  }, [symbolsKey, balanceCheckedAt])
  React.useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 20_000)
    const symbols = symbolsKey ? symbolsKey.split(',') : []
    setChanges(current => Object.fromEntries(symbols.filter(symbol => Object.hasOwn(current, symbol)).map(symbol => [symbol, current[symbol]])))
    void (async () => {
      for (let start = 0; start < symbols.length; start += 6) {
        const batch = symbols.slice(start, start + 6)
        let rows: Record<string, number | null>
        try { controller.signal.throwIfAborted(); rows = await getPortfolioChanges(batch, controller.signal) }
        catch { rows = Object.fromEntries(batch.map(symbol => [symbol, null])) }
        if (active) setChanges(current => ({ ...current, ...rows }))
      }
    })().finally(() => window.clearTimeout(timeout))
    return () => { active = false; controller.abort(); window.clearTimeout(timeout) }
  }, [symbolsKey, balanceCheckedAt])
  React.useEffect(() => {
    const sync = () => setView(new URLSearchParams(window.location.search).get('view') ?? '')
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])
  const navigateView = (next: 'deposit' | 'withdraw' | '') => {
    setView(next)
    const url = new URL(window.location.href)
    if (next) url.searchParams.set('view', next)
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
    setSection('activity'); setView('')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }, [account.authenticated, account.deposits?.loading])

  const positionValue = holdings.every(token => markets[token.symbol]?.priceUsd != null)
    ? holdings.reduce((sum, token) => sum + Number(token.quantity) * markets[token.symbol]?.priceUsd!, 0) : null
  const placeholder = account.error ? t.error : !account.address ? t.preparing : t.loading
  const cash = account.balances ? Number(account.balances.usdt) : null
  const total = cash !== null && positionValue !== null ? cash + positionValue : null
  const valuationUnavailable = account.balances && (holdings.some(token => markets[token.symbol]?.priceUsd === null)
    || (total !== null && !Number.isFinite(total)))
  const balance = account.balances && total !== null && Number.isFinite(total) ? money(total)
    : valuationUnavailable ? t.unavailable : placeholder
  const cashBalance = cash !== null && Number.isFinite(cash) ? money(cash) : placeholder
  const value = account.balances && positionValue != null && Number.isFinite(positionValue) ? money(positionValue)
    : account.balances && holdings.some(token => markets[token.symbol]?.priceUsd === null) ? t.unavailable : placeholder
  const saveName = () => {
    const next = name.trim().slice(0, 40) || defaultName
    setName(next); setEditing(false)
    try { localStorage.setItem(storageKey, next) } catch { /* The name still works for this session. */ }
  }
  const logOut = async () => {
    if (logoutPending.current) return
    logoutPending.current = true
    setLoggingOut(true); setLogoutError(false)
    try {
      await account.logout()
      setView(''); setSection('positions'); setSearch(''); setEditing(false)
      const url = new URL(window.location.href)
      for (const key of ['view', 'deposit', 'transactionId', 'transactionStatus']) url.searchParams.delete(key)
      window.history.replaceState(null, '', url.pathname + url.search + url.hash)
    } catch { setLogoutError(true) }
    finally { logoutPending.current = false; setLoggingOut(false) }
  }
  return <section className="portfolio-workspace" aria-label={t.title}>
    <AnimatePresence mode="wait" initial={false}>
      {!account.ready || !account.authenticated ? <motion.div key="guest" className="portfolio-guest" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <img className="portfolio-avatar" src={portfolioAvatar} alt="" />
        <h1>{t.start}</h1><p>{t.intro}</p>
        <button type="button" className="portfolio-primary" disabled={!account.configured || !account.ready} onClick={account.login}>{account.ready ? t.login : t.checking}<ArrowRight size={18} /></button>
        {!account.configured && <small>{t.setup}</small>}
      </motion.div> : depositPage && account.address ? <motion.div key="deposit" initial={reduceMotion ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .2 }}>
        <DepositPage address={account.address} language={language} onBack={() => navigateView('')}
          demo={demoCard} onCard={() => void (demoCard ? demo.checkout() : account.deposits?.checkout())}
          busy={demoCard ? demo.busy : account.deposits?.busy} error={demoCard ? demo.error : account.deposits?.error} />
      </motion.div> : view === 'withdraw' && account.address && account.withdrawals ? <motion.div key="withdraw" initial={reduceMotion ? false : { opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .2 }}>
        <WithdrawalPage address={account.address} balance={account.balances?.usdt ?? null} language={language} controller={account.withdrawals} onBack={() => navigateView('')} />
      </motion.div> : <motion.div key="account" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="portfolio-account-head">
          <img className="portfolio-avatar" src={portfolioAvatar} alt="" />
          {editing ? <input className="portfolio-name-input" aria-label={t.name} autoFocus value={name} maxLength={40} onChange={event => setName(event.target.value)} onBlur={saveName} onKeyDown={event => { if (event.key === 'Enter') saveName(); if (event.key === 'Escape') { setEditing(false); setName(defaultName) } }} /> : <span className="portfolio-name">{name}</span>}
          <button className="portfolio-name-edit" type="button" aria-label={t.edit} onClick={() => setEditing(true)}><Pencil size={17} strokeWidth={2} /></button>
          <button className="portfolio-logout" type="button" disabled={loggingOut} aria-busy={loggingOut} onClick={() => void logOut()}><LogOut size={17} aria-hidden="true" /><span>{loggingOut ? t.loggingOut : t.logout}</span></button>
        </div>
        {logoutError && <p className="portfolio-logout-error" role="alert">{t.logoutError}</p>}
        <span className="app-label portfolio-total-label">{t.total}</span>
        <div className="portfolio-balance-row"><h1 title={t.totalInfo} aria-live="polite">{hidden ? '••••••' : balance}</h1><button type="button" aria-label={hidden ? t.show : t.hide} onClick={() => setHidden(current => !current)}>{hidden ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
        <div className="portfolio-breakdown">
          <div className="portfolio-position-value"><span>{t.cash}</span><strong aria-live="polite">{hidden ? '••••••' : cashBalance}</strong></div>
          <div className="portfolio-position-value"><span>{t.positions}</span><strong aria-live="polite">{hidden ? '••••••' : value}</strong></div>
        </div>
        <div className="portfolio-action-row"><button type="button" disabled={!account.address || !account.walletReady} onClick={() => navigateView('deposit')}>{t.deposit}</button><button type="button" disabled={!account.address || !account.walletReady || !account.withdrawals} onClick={() => navigateView('withdraw')}>{t.withdraw}</button></div>
        <div className="portfolio-tabs" role="tablist" aria-label={t.title}>{(['positions', 'activity'] as const).map(id => <button type="button" role="tab" id={`portfolio-tab-${id}`} aria-controls="portfolio-results" key={id} aria-selected={section === id} className={section === id ? 'active' : ''} onClick={() => { setSection(id); setSearch('') }}>{t[id]}</button>)}</div>
        <label className="portfolio-search"><Search size={20} strokeWidth={2} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t.search} aria-label={t.search} /></label>
        <div id="portfolio-results" role="tabpanel" aria-labelledby={`portfolio-tab-${section}`}>
          {section === 'activity' ? <PortfolioActivity orders={account.orders ?? []} withdrawals={account.withdrawalHistory ?? []}
            cash={account.cashActivity} deposits={account.deposits} orderError={account.orderError} language={language} search={search} hidden={hidden}
            onDeposit={openDeposit} onWithdraw={() => navigateView('withdraw')} />
            : positions.length ? <div className="portfolio-rows">{positions.map(({ asset, quantity }) => asset && <PortfolioPosition key={asset.symbol}
              asset={asset} quantity={quantity} market={markets[asset.symbol]} change7d={changes[asset.symbol]}
              orders={account.orders ?? []} basis={account.purchaseBasis?.[asset.symbol]} hidden={hidden} language={language} canSell={Boolean(account.address && account.walletReady)}
              onInspect={() => onInspect(asset)} onSell={() => onSell(asset)} />)}</div>
            : <div className="portfolio-content-empty" role="status">{account.error ? t.error : account.loading || !account.address ? t.loading : t.noPositions}</div>}

        </div>
      </motion.div>}
    </AnimatePresence>
  </section>
}
