import { LanguageSelect } from './language-select'
import { localized, text, localeFor, savedLanguage, type Language } from '../lib/i18n'
import * as React from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, Bookmark, ExternalLink, House, Menu, Moon, Search, Sparkles, Sun, X, ChartNoAxesCombined, ChartPie } from 'lucide-react'
import manifest from '@/asset-sources.json'
import { assetCatalog as assets, assetLogo, tokenLogoError, type CatalogAsset as Asset } from '../lib/asset-catalog'
import { AgentWorkspace } from './agent'
import { StockCard } from '@/components/ui/stock-card'
import { TradeWorkspace } from './trade'
import { PortfolioWorkspace } from './portfolio'
import { getAccount, setSavedAsset } from './account-api'
import { getTokenPrices, type TokenPrice } from './market-api'
import './app.css'
import './agent.css'

type Theme = 'dark' | 'light'
type Tab = 'home' | 'trade' | 'agent' | 'portfolio'
const pageSize = 24
const scan = (asset: Asset) => `https://bscscan.com/token/${asset.address}`
const NAV: { id: Tab; icon: typeof House }[] = [
  { id: 'home', icon: House }, { id: 'trade', icon: ChartNoAxesCombined },
  { id: 'agent', icon: Sparkles }, { id: 'portfolio', icon: ChartPie },
]

const copy = {
  en: {
    nav: { home: 'Home', trade: 'Trade', agent: 'Agent', portfolio: 'Portfolio' },
    back: 'Back to site', language: 'Language', theme: 'Toggle color theme',
    browse: 'Tokens', browseBody: 'Ondo · BNB Smart Chain',
    search: 'Search name or token', all: 'All tokens', saved: 'Saved', result: 'tokens', noResults: 'No tokens found.',
    previous: 'Previous', next: 'Next', pages: 'Token pages',
    emptySearch: 'Try a different company or symbol.', clear: 'Clear search',
    buy: 'Buy', loadingPrice: 'Loading…', unavailablePrice: 'Price unavailable', noChange: 'No data', priceCaption: 'TOKEN PRICE / USD · 24H',
    source: 'Source-backed token', issuer: 'Issuer', network: 'Network', contract: 'Contract', symbol: 'Symbol',
    open: 'Open asset file', save: 'Save asset', unsave: 'Remove saved asset',
    detailKicker: 'ASSET FILE', detailIntro: 'Each token has its own issuer, contract and terms. Verify each one before making a decision.',
    exploreContract: 'View on BscScan', tokenList: 'View token list', caution: 'Availability and rights depend on the issuer terms and your location.',
    agentTitle: 'Asset guide', agentIntro: 'Source records for the Ondo token catalog.',
    agentGreeting: 'What would you like to verify?', agentHelp: 'Ask about an issuer, contract, or network. Include a company or token symbol.',
    agentPrompt: 'Ask about an asset…', agentSend: 'Send question', agentReset: 'Start a new conversation',
    emptyBody: 'Bookmark an asset on Home to add it here.',
    footer: 'Research the token, not just the ticker.', docs: 'Documentation', github: 'GitHub', x: 'BNB Chain on X', site: 'Website',
  },
  zh: {
    nav: { home: '首页', trade: '交易', agent: '助手', portfolio: '资产' },
    back: '返回网站', language: '语言', theme: '切换明暗主题',
    browse: '代币', browseBody: 'Ondo · BNB 智能链',
    search: '搜索名称或代币', all: '全部代币', saved: '已收藏', result: '项代币', noResults: '没有找到代币。',
    previous: '上一页', next: '下一页', pages: '代币分页',
    emptySearch: '试试其他公司或代币符号。', clear: '清除搜索',
    buy: '买入', loadingPrice: '加载中…', unavailablePrice: '价格暂不可用', noChange: '暂无数据', priceCaption: '代币价格 / USD · 24小时',
    source: '有公开来源的代币', issuer: '发行方', network: '网络', contract: '合约', symbol: '代币符号',
    open: '打开资产资料', save: '收藏资产', unsave: '取消收藏',
    detailKicker: '资产资料', detailIntro: '每项代币都有自己的发行方、合约和条款。请核实这些信息后再作决定。',
    exploreContract: '在 BscScan 查看', tokenList: '查看代币列表', caution: '可用地区和所代表的权益取决于发行方条款。',
    agentTitle: '资产指南', agentIntro: 'Ondo 代币目录的公开来源记录。',
    agentGreeting: '你想核实什么？', agentHelp: '可以询问发行方、合约或网络，并注明公司或代币代码。',
    agentPrompt: '询问一项资产…', agentSend: '发送问题', agentReset: '开始新对话',
    emptyBody: '在首页收藏一项资产，即可在这里看到。',
    footer: '研究代币，不止看股票代码。', docs: '项目文档', github: 'GitHub', x: 'BNB Chain 的 X', site: '网站',
  },
}

function AssetMark({ asset, className = '' }: { asset: Asset; className?: string }) {
  return <img className={`app-asset-mark brand-mark brand-mark--${asset.mark} ${className}`} src={assetLogo(asset)} alt="" onError={tokenLogoError} />
}

export default function FirstBellApp() {
  const { ready, authenticated, user, login, getAccessToken } = usePrivy()
  const canUseAgent = ready && authenticated
  const reduceMotion = useReducedMotion()
  const [language, setLanguage] = React.useState<Language>(() => savedLanguage())
  const [theme, setTheme] = React.useState<Theme>(() => localStorage.getItem('firstbell-theme') === 'dark' ? 'dark' : 'light')
  const [tab, setTab] = React.useState<Tab>(() => {
    const requested = new URLSearchParams(window.location.search).get('tab')
    return NAV.some(item => item.id === requested) ? requested as Tab : 'home'
  })
  const [query, setQuery] = React.useState('')
  const [agentOpened, setAgentOpened] = React.useState(tab === 'agent')
  const [filter, setFilter] = React.useState<'all' | 'saved'>('all')
  const [page, setPage] = React.useState(0)
  const [saved, setSaved] = React.useState<string[]>(() => { try { const value = JSON.parse(localStorage.getItem('firstbell-saved') ?? '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] } catch { return [] } })
  const savedWrite = React.useRef(Promise.resolve())
  const [selected, setSelected] = React.useState<Asset | null>(null)
  const [workingAsset, setWorkingAsset] = React.useState<Asset>(assets.find(a => a.symbol === 'NVDAon')!)
  const [tradeEntry, setTradeEntry] = React.useState<'buy' | 'sell' | null>(() => {
    const side = new URLSearchParams(window.location.search).get('side')
    return tab === 'trade' && (side === 'buy' || side === 'sell') ? side : null
  })
  const [tradeBusy, setTradeBusy] = React.useState(false)
  const tradeBusyRef = React.useRef(false)
  const updateTradeBusy = React.useCallback((busy: boolean) => { tradeBusyRef.current = busy; setTradeBusy(busy) }, [])
  const [homeMarkets, setHomeMarkets] = React.useState<Record<string, TokenPrice | null>>({})
  const [mobileMenu, setMobileMenu] = React.useState(false)
  const dialogRef = React.useRef<HTMLElement>(null)
  const t = localized(copy, language)
  const visible = React.useMemo(() => assets.filter(a => (filter === 'all' || saved.includes(a.symbol))
    && `${a.company} ${a.symbol}`.toLowerCase().includes(query.trim().toLowerCase())), [filter, saved, query])
  const currentPage = Math.min(page, Math.max(0, Math.ceil(visible.length / pageSize) - 1))
  const shown = React.useMemo(() => visible.slice(currentPage * pageSize, (currentPage + 1) * pageSize), [visible, currentPage])

  React.useEffect(() => { document.documentElement.lang = localeFor(language); localStorage.setItem('firstbell-language', language) }, [language])
  React.useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('firstbell-theme', theme); document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ffffff' : '#080808') }, [theme])
  React.useEffect(() => { localStorage.setItem('firstbell-saved', JSON.stringify(saved)) }, [saved])
  React.useEffect(() => {
    if (tab !== 'home') return
    let active = true
    let controller: AbortController | undefined
    let timeout: number | undefined
    setHomeMarkets({})
    const refresh = async () => {
      if (!shown.length) return
      controller?.abort()
      const request = new AbortController()
      controller = request
      timeout = window.setTimeout(() => request.abort(), 15_000)
      try {
        const prices = await getTokenPrices(shown.map(asset => asset.symbol), request.signal)
        if (active && !request.signal.aborted) setHomeMarkets(Object.fromEntries(prices.map(price => [price.symbol, price])))
      } catch {
        if (active) setHomeMarkets(Object.fromEntries(shown.map(asset => [asset.symbol, null])))
      } finally { window.clearTimeout(timeout) }
    }
    const start = window.setTimeout(() => { void refresh() }, 250)
    const poll = window.setInterval(() => { void refresh() }, 30_000)
    return () => { active = false; window.clearTimeout(start); window.clearInterval(poll); window.clearTimeout(timeout); controller?.abort() }
  }, [tab, shown])
  React.useEffect(() => {
    if (!ready || !authenticated || !user?.id) return
    let active = true
    getAccount(getAccessToken).then(account => {
      if (active && account.id === user.id) setSaved(account.saved.filter(symbol => assets.some(asset => asset.symbol === symbol)))
    }).catch(() => { /* Local saves remain available while the account service is offline. */ })
    return () => { active = false }
  }, [ready, authenticated, user?.id, getAccessToken])
  React.useEffect(() => {
    if (!selected) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.querySelector<HTMLButtonElement>('.dialog-top button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null)
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]'))
      if (!focusable.length) return
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; previousFocus?.focus() }
  }, [selected])

  const switchTab = (id: Tab) => {
    if (tradeBusyRef.current) return
    setTab(id); setMobileMenu(false)
    if (id === 'agent') setAgentOpened(true)
    if (id !== 'trade') setTradeEntry(null)
    window.history.replaceState(null, '', id === 'home' ? '/app/' : `/app/?tab=${id}`)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const openAccount = () => {
    if (!ready || tradeBusyRef.current) return
    if (authenticated) switchTab('portfolio')
    else { setMobileMenu(false); login() }
  }
  const accountLabel = ready && authenticated ? text(language, 'Account', '账户') : text(language, 'Log In', '登录')
  const toggleSaved = (symbol: string) => {
    const next = !saved.includes(symbol)
    setSaved(list => next ? [...new Set([...list, symbol])] : list.filter(item => item !== symbol))
    if (ready && authenticated) {
      savedWrite.current = savedWrite.current.then(() => setSavedAsset(getAccessToken, symbol, next)).catch(() => {
        /* The local saved list continues to work if the server is not configured. */
      })
    }
  }

  const assetCard = (asset: Asset) => <StockCard key={asset.symbol} className="app-stock-card max-w-none"
    logoSrc={assetLogo(asset)} logoClassName={`brand-mark brand-mark--${asset.mark}`}
    ticker={asset.symbol} name={asset.company} price={homeMarkets[asset.symbol]?.priceUsd ?? null}
    change={homeMarkets[asset.symbol]?.change24hPct ?? null} loading={homeMarkets[asset.symbol] === undefined}
    locale={localeFor(language)} buyLabel={t.buy} inspectLabel={t.open}
    loadingLabel={t.loadingPrice} unavailableLabel={t.unavailablePrice} changeUnavailableLabel={t.noChange}
    onInspect={() => setSelected(asset)}
    onBuy={() => { setWorkingAsset(asset); setTradeEntry('buy'); switchTab('trade') }}
    actions={<button type="button" className="app-stock-save" aria-label={`${saved.includes(asset.symbol) ? t.unsave : t.save}: ${asset.symbol}`}
      aria-pressed={saved.includes(asset.symbol)} onClick={() => toggleSaved(asset.symbol)}>
      <Bookmark size={17} fill={saved.includes(asset.symbol) ? 'currentColor' : 'none'} />
    </button>} />

  return <div className="app-shell" data-tab={tab}>
    <header className="app-header">
      <a href="/" className="app-brand" aria-label={t.back}><img src="/assets/firstbell-mark.svg" alt="" />FirstBell</a>
      <nav className="app-desktop-nav" aria-label={text(language, "App navigation")}>{NAV.map(({ id, icon: Icon }) => <button type="button" key={id} disabled={tradeBusy} onClick={() => switchTab(id)} className={`motion-tab ${tab === id ? 'active' : ''}`} aria-current={tab === id ? 'page' : undefined}>{tab === id && <motion.span className="motion-tab-indicator" layoutId="app-desktop-active" transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }} />}<Icon size={16} strokeWidth={1.8} /><span>{t.nav[id]}</span></button>)}</nav>
      <div className="app-header-actions">
        <LanguageSelect language={language} onChange={setLanguage} className="app-header-tool app-language" />
        <button type="button" className="app-header-tool" aria-label={t.theme} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}><span className="motion-icon-swap" data-state={theme === 'dark' ? 'a' : 'b'}><Sun size={18} /><Moon size={18} /></span></button>
        <button type="button" className="app-account" disabled={!ready || tradeBusy} aria-busy={!ready} onClick={openAccount}>{accountLabel}<ArrowRight size={16} /></button>
        <button type="button" className="app-header-tool app-mobile-menu" aria-label={text(language, "Open menu")} aria-expanded={mobileMenu} onClick={() => setMobileMenu(value => !value)}><span className="motion-icon-swap" data-state={mobileMenu ? 'b' : 'a'}><Menu size={20} /><X size={20} /></span></button>
      </div>
    </header>
    <AnimatePresence>{mobileMenu && <motion.div className="app-mobile-popover" initial={reduceMotion ? false : { opacity: 0, scale: .97, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .99, y: -4 }} transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }}><button type="button" className="app-mobile-account" disabled={!ready || tradeBusy} aria-busy={!ready} onClick={openAccount}>{accountLabel}<ArrowRight size={16} /></button><a href="https://github.com/ahmardchain/FirstBell#readme" target="_blank" rel="noreferrer">{t.docs}<ArrowUpRight size={16} /></a></motion.div>}</AnimatePresence>
    <main className="app-main">
      <AnimatePresence mode="wait" initial={false}><motion.div key={tab} className="app-view" initial={reduceMotion ? false : { opacity: 0, x: 8, filter: 'blur(3px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={reduceMotion ? { opacity: 1 } : { opacity: 0, x: -8, filter: 'blur(3px)' }} transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }}>
      {tab === 'home' && <>
        <section className="app-browser" aria-labelledby="browse-title"><div className="app-section-heading"><div><h1 id="browse-title">{t.browse}<span className="count">{assets.length}</span></h1><p>{t.browseBody}</p></div></div>
          <div className="app-browser-controls"><div className="app-filter" role="group" aria-label={text(language, "Asset filter")}><button type="button" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => { setFilter('all'); setPage(0) }}>{t.all}</button><button type="button" className={filter === 'saved' ? 'active' : ''} aria-pressed={filter === 'saved'} onClick={() => { setFilter('saved'); setPage(0) }}>{t.saved}{saved.length > 0 && <sup>{saved.length}</sup>}</button></div><label className="app-search"><Search size={18} /><input type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0) }} placeholder={t.search} aria-label={t.search} /></label></div>
          <div className="app-result-count app-stock-heading"><span>{String(visible.length).padStart(2, '0')} {t.result}</span><span>{t.priceCaption}</span></div>
          {visible.length ? <><div className="app-stock-list">{shown.map(assetCard)}</div>{visible.length > pageSize && <nav className="app-token-pages" aria-label={t.pages}><button type="button" disabled={currentPage === 0} onClick={() => { setPage(currentPage - 1); window.scrollTo({ top: 0, behavior: 'instant' }) }}>{t.previous}</button><span aria-live="polite">{currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, visible.length)} / {visible.length}</span><button type="button" disabled={(currentPage + 1) * pageSize >= visible.length} onClick={() => { setPage(currentPage + 1); window.scrollTo({ top: 0, behavior: 'instant' }) }}>{t.next}<ArrowRight size={16} /></button></nav>}</> : <div className="app-empty"><Search size={26} strokeWidth={1.2} /><h3>{t.noResults}</h3><p>{filter === 'saved' && saved.length === 0 ? t.emptyBody : t.emptySearch}</p><button type="button" onClick={() => { setFilter('all'); setQuery(''); setPage(0) }}>{t.clear}<ArrowRight size={16} /></button></div>}
        </section>
      </>}
      {tab === 'trade' && <TradeWorkspace assets={assets} asset={workingAsset} onAssetChange={setWorkingAsset} onInspect={setSelected} language={language} initialSide={tradeEntry} onBusyChange={updateTradeBusy} />}
      {tab === 'portfolio' && <PortfolioWorkspace assets={assets} language={language} onInspect={setSelected}
        onSell={asset => { setWorkingAsset(asset); setTradeEntry('sell'); switchTab('trade') }} />}
      {tab === 'agent' && !canUseAgent && <section className="portfolio-workspace" aria-label={text(language, 'Sign in to use the Agent', '登录后使用助手')}><div className="portfolio-guest">
        <h1>{text(language, 'Sign in to use the Agent', '登录后使用助手')}</h1>
        <p>{text(language, 'Sign in with Google or email.', '使用 Google 或邮箱登录。')}</p>
        <button type="button" className="portfolio-primary" disabled={!ready} onClick={login}>{ready ? text(language, 'Log In', '登录') : text(language, 'Checking your account…', '正在检查账户…')}<ArrowRight size={18} /></button>
      </div></section>}
      </motion.div></AnimatePresence>
      {agentOpened && canUseAgent && <div hidden={tab !== 'agent'}><AgentWorkspace language={language} /></div>}
    </main>
    <footer className="app-footer"><div><a href="/" className="app-brand"><img src="/assets/firstbell-mark.svg" alt="" />FirstBell</a><p>{t.footer}</p></div><div><a href="https://github.com/ahmardchain/FirstBell#readme" target="_blank" rel="noreferrer">{t.docs}<ArrowUpRight size={14} /></a><a href="https://github.com/ahmardchain/FirstBell" target="_blank" rel="noreferrer">{t.github}<ArrowUpRight size={14} /></a><a href="https://x.com/BNBCHAIN" target="_blank" rel="noreferrer">{t.x}<ArrowUpRight size={14} /></a></div><small>© 2026 FIRSTBELL / BNB SMART CHAIN</small></footer>
    <nav className="app-bottom-nav" aria-label={text(language, "App navigation")}>{NAV.map(({ id, icon: Icon }) => <button type="button" key={id} disabled={tradeBusy} onClick={() => switchTab(id)} className={`motion-tab ${tab === id ? 'active' : ''}`} aria-current={tab === id ? 'page' : undefined}>{tab === id && <motion.span className="motion-tab-indicator" layoutId="app-bottom-active" transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }} />}<Icon size={22} strokeWidth={1.8} /><span>{t.nav[id]}</span></button>)}</nav>
    <AnimatePresence>{selected && <div className="asset-dialog-layer"><motion.button type="button" className="asset-dialog-backdrop" aria-label={text(language, "Close asset file")} onClick={() => setSelected(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /><motion.aside ref={dialogRef} className="asset-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title" initial={reduceMotion ? false : { x: 100, opacity: 0, filter: 'blur(2px)' }} animate={{ x: 0, opacity: 1, filter: 'blur(0px)' }} exit={reduceMotion ? { opacity: 0 } : { x: 100, opacity: 0, filter: 'blur(2px)' }} transition={{ duration: reduceMotion ? 0 : .4, ease: [.22, 1, .36, 1] }}><div className="dialog-top"><span className="app-label">{t.detailKicker} / {selected.symbol}</span><button type="button" aria-label={text(language, "Close asset file")} onClick={() => setSelected(null)}><X size={21} /></button></div><div className={`dialog-mark asset-art--${selected.mark}`}><AssetMark asset={selected} /></div><div className="dialog-body"><div className="dialog-title"><div><h2 id="asset-dialog-title">{selected.company}</h2><p>{selected.symbol} / BNB SMART CHAIN</p></div><button type="button" aria-label={saved.includes(selected.symbol) ? t.unsave : t.save} aria-pressed={saved.includes(selected.symbol)} onClick={() => toggleSaved(selected.symbol)}><Bookmark size={20} fill={saved.includes(selected.symbol) ? 'currentColor' : 'none'} /></button></div><p className="dialog-intro">{t.detailIntro}</p><dl><div><dt>{t.symbol}</dt><dd>{selected.symbol}</dd></div><div><dt>{t.issuer}</dt><dd>Ondo Global Markets</dd></div><div><dt>{t.network}</dt><dd>BNB Smart Chain / 56</dd></div><div><dt>{t.contract}</dt><dd className="contract-value" title={selected.address}>{selected.address}</dd></div></dl><p className="dialog-caution">{t.caution}</p><a href={scan(selected)} target="_blank" rel="noreferrer" className="dialog-primary">{t.exploreContract}<ExternalLink size={17} /></a><a href={manifest.sourceTokenList} target="_blank" rel="noreferrer" className="dialog-secondary">{t.tokenList}<ArrowUpRight size={17} /></a></div></motion.aside></div>}</AnimatePresence>
  </div>
}
