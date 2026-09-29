import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, Bookmark, Eye, EyeOff, Search, UserRound } from 'lucide-react'
import './portfolio.css'

type Language = 'en' | 'zh'
type Asset = { symbol: string; company: string; mark: string; address: string; name: string; chainId: number; source: string; file: string }
type Section = 'positions' | 'saved' | 'activity'

const copy = {
  en: {
    title: 'Portfolio', start: 'Start building your portfolio',
    intro: 'Log in to track your investments and see your positions in one place.',
    login: 'Log In', previewNote: 'Account login is not connected yet. This button opens a layout preview.',
    explore: 'Explore stocks', saved: 'Saved assets', noSaved: 'Nothing saved yet',
    saveHint: 'Save a stock from Home to keep it here.',
    preview: 'PORTFOLIO PREVIEW / NO ACCOUNT CONNECTED', account: 'Your account',
    exit: 'Back', balance: 'Total balance', positionsValue: 'Positions',
    unavailable: 'Account balances are not connected yet.',
    deposit: 'Deposit', withdraw: 'Withdraw', transferNote: 'Deposit and Withdraw become available when account and transfer services are connected.',
    positions: 'Positions', activity: 'Activity', search: 'Search',
    noPositions: 'No positions found', noPositionsHint: 'Your holdings will appear here after account login is available.',
    noActivity: 'No activity yet', noActivityHint: 'Your account activity will appear here.',
    hide: 'Hide balance', show: 'Show balance',
  },
  zh: {
    title: '资产', start: '开始建立你的资产组合',
    intro: '登录后即可在一处追踪投资和查看持仓。',
    login: '登录', previewNote: '账户登录尚未接入。此按钮会打开界面预览。',
    explore: '探索股票', saved: '已收藏资产', noSaved: '还没有收藏',
    saveHint: '在首页收藏股票，即可在此查看。',
    preview: '资产页面预览 / 尚未连接账户', account: '你的账户',
    exit: '返回', balance: '总余额', positionsValue: '持仓',
    unavailable: '账户余额尚未接入。',
    deposit: '充值', withdraw: '提现', transferNote: '账户与转账服务接入后，才能使用充值和提现。',
    positions: '持仓', activity: '活动', search: '搜索',
    noPositions: '暂无持仓', noPositionsHint: '账户登录可用后，你的持仓将显示在此。',
    noActivity: '暂无活动', noActivityHint: '账户活动将显示在此。',
    hide: '隐藏余额', show: '显示余额',
  },
}

export function PortfolioWorkspace({ assets, saved, language, onExplore, onInspect, onToggleSaved }: {
  assets: Asset[]
  saved: string[]
  language: Language
  onExplore: () => void
  onInspect: (asset: Asset) => void
  onToggleSaved: (symbol: string) => void
}) {
  const t = copy[language]
  const [preview, setPreview] = React.useState(() => new URLSearchParams(window.location.search).get('preview') === '1')
  const [section, setSection] = React.useState<Section>('positions')
  const [search, setSearch] = React.useState('')
  const [hidden, setHidden] = React.useState(false)
  const savedAssets = assets.filter(asset => saved.includes(asset.symbol))
  const visibleSaved = savedAssets.filter(asset => `${asset.company} ${asset.symbol}`.toLowerCase().includes(search.trim().toLowerCase()))
  const showPreview = (value: boolean) => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', 'portfolio')
    if (value) url.searchParams.set('preview', '1')
    else url.searchParams.delete('preview')
    window.history.replaceState(null, '', `${url.pathname}${url.search}`)
    setPreview(value)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

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
      {!preview ? <motion.div key="guest" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>
        <div className="portfolio-page-head"><span className="app-label">FIRSTBELL / PORTFOLIO</span><h1 id="portfolio-title">{t.title}</h1></div>
        <div className="portfolio-guest-card">
          <div className="portfolio-orbit" aria-hidden="true"><div className="portfolio-orbit-ring" />{['apple', 'nvidia', 'tesla'].map(mark => <span className={`portfolio-orbit-mark portfolio-orbit-mark--${mark}`} key={mark}><img className={`brand-mark brand-mark--${mark}`} src={`/assets/marks/${mark}.svg`} alt="" /></span>)}</div>
          <h2>{t.start}</h2><p>{t.intro}</p>
          <button type="button" className="portfolio-primary" onClick={() => { showPreview(true); setSection('positions'); setSearch('') }}>{t.login}<ArrowRight size={18} /></button>
          <small className="portfolio-disclosure">{t.previewNote}</small>
        </div>
        <div className="portfolio-saved-head"><span className="app-label">{t.saved.toUpperCase()} / {String(savedAssets.length).padStart(2, '0')}</span></div>
        {savedAssets.length ? savedRows(savedAssets) : <div className="portfolio-saved-empty"><Bookmark size={19} /><span>{t.noSaved}. {t.saveHint}</span><button type="button" onClick={onExplore}>{t.explore}<ArrowUpRight size={16} /></button></div>}
      </motion.div> : <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .18 }}>
        <div className="portfolio-preview-bar"><span className="app-label">{t.preview}</span><button type="button" onClick={() => showPreview(false)}>{t.exit}</button></div>
        <div className="portfolio-account-head"><span className="portfolio-avatar"><UserRound size={22} strokeWidth={1.6} /></span><div><span className="app-label">FIRSTBELL</span><h1 id="portfolio-title">{t.account}</h1></div></div>
        <div className="portfolio-balance"><div className="portfolio-balance-label"><span>{t.balance}</span><button type="button" aria-label={hidden ? t.show : t.hide} onClick={() => setHidden(value => !value)}>{hidden ? <EyeOff size={20} /> : <Eye size={20} />}</button></div><div className="portfolio-balance-value">{hidden ? '••••••' : 'US$—'}</div><p>{t.positionsValue} <strong>—</strong></p><small>{t.unavailable}</small></div>
        <div className="portfolio-action-row"><button type="button" disabled>{t.deposit}</button><button type="button" disabled>{t.withdraw}</button></div>
        <p className="portfolio-action-note">{t.transferNote}</p>
        <div className="portfolio-content-head"><div className="portfolio-tabs" role="tablist" aria-label={t.title}>{(['positions', 'saved', 'activity'] as const).map(id => <button type="button" role="tab" key={id} aria-selected={section === id} className={section === id ? 'active' : ''} onClick={() => { setSection(id); setSearch('') }}>{t[id]}</button>)}</div></div>
        {section !== 'activity' && <label className="portfolio-search"><Search size={19} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={t.search} aria-label={t.search} /></label>}
        {section === 'saved' && visibleSaved.length ? savedRows(visibleSaved)
          : <div className="portfolio-content-empty"><Bookmark size={23} strokeWidth={1.5} /><h2>{section === 'positions' ? t.noPositions : section === 'saved' ? t.noSaved : t.noActivity}</h2><p>{section === 'positions' ? t.noPositionsHint : section === 'saved' ? t.saveHint : t.noActivityHint}</p>{section === 'saved' && <button type="button" onClick={onExplore}>{t.explore}<ArrowUpRight size={16} /></button>}</div>}
      </motion.div>}
    </AnimatePresence>
  </section>
}
