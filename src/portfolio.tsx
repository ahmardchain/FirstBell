import * as React from 'react'
import { useLinkAccount, usePrivy, useWallets } from '@privy-io/react-auth'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, Bookmark, Eye, EyeOff, RefreshCw, Search, UserRound } from 'lucide-react'
import { displayQuantity, readWalletBalances, type WalletBalances } from './wallet-balances'
import './portfolio.css'

type Language = 'en' | 'zh'
type Asset = { symbol: string; company: string; mark: string; address: string; name: string; chainId: number; source: string; file: string }
type Section = 'positions' | 'saved' | 'activity'
type Props = { assets: Asset[]; saved: string[]; language: Language; onExplore: () => void; onInspect: (asset: Asset) => void; onToggleSaved: (symbol: string) => void }
type Account = {
  configured: boolean; ready: boolean; authenticated: boolean; email?: string; address?: string;
  walletReady: boolean; hasEmail: boolean; hasGoogle: boolean;
  balances: WalletBalances | null; loading: boolean; error: boolean;
  login: () => void; logout: () => void; refresh: () => void;
  linkEmail: () => void; linkGoogle: () => void;
}

const copy = {
  en: {
    title: 'Portfolio', start: 'Start building your portfolio',
    intro: 'Log in with Google or email. Your BNB Smart Chain wallet is created on your first sign-in.',
    login: 'Log In', setup: 'Sign-in setup is pending. The owner needs to add the Privy App ID.', checking: 'Checking your account',
    explore: 'Explore stocks', saved: 'Saved assets', noSaved: 'Nothing saved yet',
    saveHint: 'Save a stock from Home to keep it here.',
    account: 'Your account', signOut: 'Log out', address: 'Wallet address', viewWallet: 'View on BscScan',
    linkEmail: 'Add email login', linkGoogle: 'Add Google login', linkNote: 'Link both sign-in methods here to use the same account and wallet.',
    balance: 'BNB balance', positionsValue: 'Token positions', refresh: 'Refresh balances', walletLoading: 'Preparing your wallet',
    loading: 'Reading BNB Smart Chain', error: 'Balances could not be read. Try again.',
    source: 'Live on-chain quantities. No USD valuation or market price is shown.',
    deposit: 'Deposit', withdraw: 'Withdraw', transferNote: 'Transfers are unavailable until deposit and withdrawal services are connected.',
    positions: 'Positions', activity: 'Activity', search: 'Search',
    noPositions: 'No token positions found', noPositionsHint: 'Your five listed token balances are currently zero.',
    noActivity: 'Activity is not connected', noActivityHint: 'Transaction history will appear when the account service is connected.',
    hide: 'Hide balance', show: 'Show balance',
  },
  zh: {
    title: '资产', start: '开始建立你的资产组合',
    intro: '使用 Google 或邮箱登录。首次登录时会创建 BNB 智能链钱包。',
    login: '登录', setup: '登录配置尚未完成。网站所有者需添加 Privy App ID。', checking: '正在检查账户',
    explore: '探索股票', saved: '已收藏资产', noSaved: '还没有收藏',
    saveHint: '在首页收藏股票，即可在此查看。',
    account: '你的账户', signOut: '退出登录', address: '钱包地址', viewWallet: '在 BscScan 查看',
    linkEmail: '添加邮箱登录', linkGoogle: '添加 Google 登录', linkNote: '在此绑定两种登录方式，即可使用同一个账户和钱包。',
    balance: 'BNB 余额', positionsValue: '代币持仓', refresh: '刷新余额', walletLoading: '正在准备钱包',
    loading: '正在读取 BNB 智能链', error: '无法读取余额，请重试。',
    source: '链上实时数量。此处不显示美元估值或市场价格。',
    deposit: '充值', withdraw: '提现', transferNote: '充值与提现服务接入后，才能进行转账。',
    positions: '持仓', activity: '活动', search: '搜索',
    noPositions: '未找到代币持仓', noPositionsHint: '这五种代币的当前余额均为零。',
    noActivity: '活动记录尚未接入', noActivityHint: '账户服务接入后，此处会显示交易历史。',
    hide: '隐藏余额', show: '显示余额',
  },
}

function ConnectedPortfolio(props: Props) {
  const { ready, authenticated, user, login, logout } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const { linkEmail, linkGoogle } = useLinkAccount()
  const [balances, setBalances] = React.useState<WalletBalances | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(false)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const wallet = wallets.find(item => item.walletClientType === 'privy' || item.walletClientType === 'privy_v2')
  const address = authenticated && walletsReady ? wallet?.address : undefined

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
    const timer = window.setInterval(() => setRefreshKey(value => value + 1), 30_000)
    return () => window.clearInterval(timer)
  }, [address])

  return <PortfolioView {...props} account={{
    configured: true, ready, authenticated, walletReady: walletsReady,
    email: user?.email?.address ?? user?.google?.email ?? undefined,
    hasEmail: Boolean(user?.email), hasGoogle: Boolean(user?.google),
    address, balances, loading, error,
    login, logout, refresh: () => setRefreshKey(value => value + 1), linkEmail, linkGoogle,
  }} />
}

export function PortfolioWorkspace(props: Props) {
  if (import.meta.env.VITE_PRIVY_APP_ID?.trim()) return <ConnectedPortfolio {...props} />
  return <PortfolioView {...props} account={{
    configured: false, ready: true, authenticated: false, walletReady: false,
    hasEmail: false, hasGoogle: false, balances: null, loading: false, error: false,
    login: () => {}, logout: () => {}, refresh: () => {}, linkEmail: () => {}, linkGoogle: () => {},
  }} />
}

function PortfolioView({ assets, saved, language, onExplore, onInspect, onToggleSaved, account }: Props & { account: Account }) {
  const t = copy[language]
  const [section, setSection] = React.useState<Section>('positions')
  const [search, setSearch] = React.useState('')
  const [hidden, setHidden] = React.useState(false)
  const savedAssets = assets.filter(asset => saved.includes(asset.symbol))
  const visibleSaved = savedAssets.filter(asset => `${asset.company} ${asset.symbol}`.toLowerCase().includes(search.trim().toLowerCase()))
  const positions = (account.balances?.tokens ?? []).filter(token => token.raw > 0n)
    .map(token => ({ ...token, asset: assets.find(asset => asset.symbol === token.symbol)! }))
    .filter(row => `${row.asset.company} ${row.symbol}`.toLowerCase().includes(search.trim().toLowerCase()))

  const savedRows = (items: Asset[]) => <div className="portfolio-rows">{items.map(asset =>
    <div className="portfolio-asset-row" key={asset.symbol}>
      <button type="button" className="portfolio-asset-open" onClick={() => onInspect(asset)}>
        <span className="portfolio-mark"><img className={`brand-mark brand-mark--${asset.mark}`} src={`/assets/marks/${asset.mark}.svg`} alt="" /></span>
        <span className="portfolio-asset-names"><strong>{asset.symbol}</strong><small>{asset.company}</small></span>
        <ArrowUpRight className="portfolio-row-arrow" size={18} />
      </button>
      <button type="button" className="portfolio-unsave" onClick={() => onToggleSaved(asset.symbol)} aria-label={`${t.saved}: ${asset.symbol}`}><Bookmark size={17} fill="currentColor" /></button>
    </div>
  )}</div>

  return <section className="portfolio-workspace" aria-labelledby="portfolio-title">
    <AnimatePresence mode="wait">
      {!account.ready || !account.authenticated ? <motion.div key="guest" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>
        <div className="portfolio-page-head"><span className="app-label">FIRSTBELL / PORTFOLIO</span><h1 id="portfolio-title">{t.title}</h1></div>
        <div className="portfolio-guest-card">
          <div className="portfolio-orbit" aria-hidden="true"><div className="portfolio-orbit-ring" />{['apple', 'nvidia', 'tesla'].map(mark => <span className={`portfolio-orbit-mark portfolio-orbit-mark--${mark}`} key={mark}><img className={`brand-mark brand-mark--${mark}`} src={`/assets/marks/${mark}.svg`} alt="" /></span>)}</div>
          <h2>{t.start}</h2><p>{t.intro}</p>
          <button type="button" className="portfolio-primary" disabled={!account.configured || !account.ready} onClick={account.login}>{account.ready ? t.login : t.checking}<ArrowRight size={18} /></button>
          {!account.configured && <small className="portfolio-disclosure">{t.setup}</small>}
        </div>
        <div className="portfolio-saved-head"><span className="app-label">{t.saved.toUpperCase()} / {String(savedAssets.length).padStart(2, '0')}</span></div>
        {savedAssets.length ? savedRows(savedAssets) : <div className="portfolio-saved-empty"><Bookmark size={19} /><span>{t.noSaved}. {t.saveHint}</span><button type="button" onClick={onExplore}>{t.explore}<ArrowUpRight size={16} /></button></div>}
      </motion.div> : <motion.div key="account" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>
        <div className="portfolio-preview-bar"><span className="app-label">FIRSTBELL / BNB SMART CHAIN</span><button type="button" onClick={account.logout}>{t.signOut}</button></div>
        <div className="portfolio-account-head"><span className="portfolio-avatar"><UserRound size={22} strokeWidth={1.6} /></span><div><span className="app-label">{account.email || 'FIRSTBELL'}</span><h1 id="portfolio-title">{t.account}</h1></div></div>
        <div className="portfolio-balance"><div className="portfolio-balance-label"><span>{t.balance}</span><button type="button" aria-label={hidden ? t.show : t.hide} onClick={() => setHidden(value => !value)}>{hidden ? <EyeOff size={20} /> : <Eye size={20} />}</button><button type="button" aria-label={t.refresh} disabled={!account.address || account.loading} onClick={account.refresh}><RefreshCw size={17} /></button></div><div className="portfolio-balance-value" aria-live="polite">{hidden ? '••••••' : account.balances ? `${displayQuantity(account.balances.bnb)} BNB` : '—'}</div><p>{t.positionsValue} <strong>{account.balances ? account.balances.tokens.filter(token => token.raw > 0n).length : '—'}</strong></p><small>{!account.walletReady || !account.address ? t.walletLoading : account.loading ? t.loading : account.error ? t.error : t.source}</small></div>
        {account.address && <div className="portfolio-wallet-address"><span>{t.address}</span><a href={`https://bscscan.com/address/${account.address}`} target="_blank" rel="noreferrer" title={account.address}>{account.address.slice(0, 8)}…{account.address.slice(-6)} <ArrowUpRight size={14} /><span className="sr-only">{t.viewWallet}</span></a></div>}
        <div className="portfolio-action-row"><button type="button" disabled>{t.deposit}</button><button type="button" disabled>{t.withdraw}</button></div>
        <p className="portfolio-action-note">{t.transferNote}</p>
        {(!account.hasEmail || !account.hasGoogle) && <div className="portfolio-link-methods"><span>{t.linkNote}</span><div>{!account.hasEmail && <button type="button" onClick={account.linkEmail}>{t.linkEmail}</button>}{!account.hasGoogle && <button type="button" onClick={account.linkGoogle}>{t.linkGoogle}</button>}</div></div>}
        <div className="portfolio-content-head"><div className="portfolio-tabs" role="tablist" aria-label={t.title}>{(['positions', 'saved', 'activity'] as const).map(id => <button type="button" role="tab" key={id} aria-selected={section === id} className={section === id ? 'active' : ''} onClick={() => { setSection(id); setSearch('') }}>{t[id]}</button>)}</div></div>
        {section !== 'activity' && <label className="portfolio-search"><Search size={19} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t.search} aria-label={t.search} /></label>}
        {section === 'positions' && positions.length > 0 ? <div className="portfolio-rows">{positions.map(({ asset, quantity }) => <button type="button" className="portfolio-asset-row portfolio-position-row" key={asset.symbol} onClick={() => onInspect(asset)}><span className="portfolio-mark"><img className={`brand-mark brand-mark--${asset.mark}`} src={`/assets/marks/${asset.mark}.svg`} alt="" /></span><span className="portfolio-asset-names"><strong>{asset.symbol}</strong><small>{asset.company}</small></span><strong className="portfolio-position-quantity">{hidden ? '••••' : displayQuantity(quantity)}</strong></button>)}</div>
          : section === 'saved' && visibleSaved.length ? savedRows(visibleSaved)
            : <div className="portfolio-content-empty"><Bookmark size={23} strokeWidth={1.5} /><h2>{section === 'positions' ? account.loading || account.error || !account.address ? account.error ? t.error : t.loading : t.noPositions : section === 'saved' ? t.noSaved : t.noActivity}</h2><p>{section === 'positions' ? account.loading || account.error || !account.address ? '' : t.noPositionsHint : section === 'saved' ? t.saveHint : t.noActivityHint}</p>{section === 'saved' && <button type="button" onClick={onExplore}>{t.explore}<ArrowUpRight size={16} /></button>}</div>}
      </motion.div>}
    </AnimatePresence>
  </section>
}
