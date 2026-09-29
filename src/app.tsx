import * as React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, Bookmark, ChevronDown, ExternalLink, Globe2, House, Menu, Moon, Search, Sparkles, Sun, X, ChartNoAxesCombined, ChartPie } from 'lucide-react'
import manifest from '@/asset-sources.json'
import { AIChatCard } from '@/components/spectrumui/ai-chat-card'
import { TradeWorkspace } from './trade'
import { PortfolioWorkspace } from './portfolio'
import './app.css'
import './agent.css'

type Language = 'en' | 'zh'
type Theme = 'dark' | 'light'
type Tab = 'home' | 'trade' | 'agent' | 'portfolio'
const markBySymbol: Record<string, string> = { AAPLon: 'apple', TSLAon: 'tesla', NVDAon: 'nvidia', MSFTon: 'microsoft', AMZNon: 'amazon' }
const assets = manifest.assets.map(asset => ({ ...asset, company: asset.name.split(' (Ondo')[0], mark: markBySymbol[asset.symbol] }))
type Asset = (typeof assets)[number]
const scan = (asset: Asset) => `https://bscscan.com/token/${asset.address}`
const NAV: { id: Tab; icon: typeof House }[] = [
  { id: 'home', icon: House }, { id: 'trade', icon: ChartNoAxesCombined },
  { id: 'agent', icon: Sparkles }, { id: 'portfolio', icon: ChartPie },
]

const copy = {
  en: {
    nav: { home: 'Home', trade: 'Trade', agent: 'Agent', portfolio: 'Portfolio' },
    back: 'Back to site', language: 'Language', theme: 'Toggle color theme',
    live: 'ASSET INDEX / BNB SMART CHAIN', ticker: 'Five source-backed equities. One clear place to start.',
    kicker: 'FIRSTBELL / DISCOVER', title: 'Find your next stock.',
    heroOverline: 'A closer look at tokenized equities', heroTitle: 'A familiar name.\nA clearer story.',
    heroBody: 'Explore the company, then inspect the token issuer and contract before you go further.',
    heroButton: 'Explore NVIDIA',
    browse: 'Explore assets', browseBody: 'Real token contracts on BNB Smart Chain, with issuer and source attached.',
    search: 'Search company or token', all: 'All assets', saved: 'Saved', result: 'assets', noResults: 'No assets found.',
    emptySearch: 'Try a different company or symbol.', clear: 'Clear search',
    source: 'Source-backed token', issuer: 'Issuer', network: 'Network', contract: 'Contract', symbol: 'Symbol',
    open: 'Open asset file', save: 'Save asset', unsave: 'Remove saved asset',
    detailKicker: 'ASSET FILE', detailIntro: 'A tokenized equity has its own issuer, contract and terms. Verify each one before making a decision.',
    exploreContract: 'View on BscScan', tokenList: 'View token list', caution: 'Availability and rights depend on the issuer terms and your location.',
    agentTitle: 'Asset guide', agentIntro: 'Source records for five tokenized equities.',
    agentGreeting: 'What would you like to verify?', agentHelp: 'Ask about an issuer, contract, or network. Include a company or token symbol.',
    agentPrompt: 'Ask about an asset…', agentSend: 'Send question', agentReset: 'Start a new conversation',
    quick: ['Who issues NVDAon?', 'What is the TSLAon contract?', 'Which network is MSFTon on?'],
    answerIssuer: (a: Asset) => `${a.symbol} is listed as an Ondo tokenized asset. Verify the issuer and product terms at the source before relying on this listing.`,
    answerContract: (a: Asset) => `The BNB Smart Chain contract listed for ${a.symbol} is ${a.address}. Open BscScan to inspect it directly.`,
    answerNetwork: (a: Asset) => `${a.symbol} is listed on BNB Smart Chain (chain ID 56).`,
    answerSelect: 'Include a company or token symbol such as NVDAon, TSLAon, or AAPLon so I can look up its record.',
    answerOther: 'I can check this asset’s issuer, contract address, or network. Ask one of those questions.',
    agentNote: 'This guide uses fixed source records. It is not a live AI model or investment advice.',
    emptyBody: 'Bookmark an asset on Home to add it here.',
    footer: 'Research the token, not just the ticker.', docs: 'Documentation', github: 'GitHub', x: 'BNB Chain on X', site: 'Website',
  },
  zh: {
    nav: { home: '首页', trade: '交易', agent: '助手', portfolio: '资产' },
    back: '返回网站', language: '语言', theme: '切换明暗主题',
    live: '资产目录 / BNB 智能链', ticker: '五种有公开来源的代币化股票，从清晰的信息开始。',
    kicker: 'FIRSTBELL / 发现', title: '发现你的下一只股票。',
    heroOverline: '进一步了解代币化股票', heroTitle: '熟悉的公司。\n更清晰的信息。',
    heroBody: '从公司入手，再查阅代币的发行方与合约，然后继续研究。', heroButton: '了解 NVIDIA',
    browse: '探索资产', browseBody: 'BNB 智能链上的真实代币合约，附有发行方和公开来源。',
    search: '搜索公司或代币', all: '全部资产', saved: '已收藏', result: '项资产', noResults: '没有找到资产。',
    emptySearch: '试试其他公司或代币符号。', clear: '清除搜索',
    source: '有公开来源的代币', issuer: '发行方', network: '网络', contract: '合约', symbol: '代币符号',
    open: '打开资产资料', save: '收藏资产', unsave: '取消收藏',
    detailKicker: '资产资料', detailIntro: '代币化股票有自己的发行方、合约和条款。请核实这些信息后再作决定。',
    exploreContract: '在 BscScan 查看', tokenList: '查看代币列表', caution: '可用地区和所代表的权益取决于发行方条款。',
    agentTitle: '资产指南', agentIntro: '五种代币化股票的公开来源记录。',
    agentGreeting: '你想核实什么？', agentHelp: '可以询问发行方、合约或网络，并注明公司或代币代码。',
    agentPrompt: '询问一项资产…', agentSend: '发送问题', agentReset: '开始新对话',
    quick: ['NVDAon 由谁发行？', 'TSLAon 的合约地址是什么？', 'MSFTon 在哪条链上？'],
    answerIssuer: (a: Asset) => `${a.symbol} 被列为 Ondo 代币化资产。使用前请通过来源核实发行方及产品条款。`,
    answerContract: (a: Asset) => `${a.symbol} 在 BNB 智能链上列出的合约地址是 ${a.address}。请打开 BscScan 直接核实。`,
    answerNetwork: (a: Asset) => `${a.symbol} 列在 BNB 智能链上（链 ID 56）。`,
    answerSelect: '请注明公司或代币代码，例如 NVDAon、TSLAon 或 AAPLon，以便我查询对应记录。',
    answerOther: '我可以核实这项资产的发行方、合约地址或网络。请问其中一个问题。',
    agentNote: '本指南基于固定的公开记录，不是实时 AI 模型或投资建议。',
    emptyBody: '在首页收藏一项资产，即可在这里看到。',
    footer: '研究代币，不止看股票代码。', docs: '项目文档', github: 'GitHub', x: 'BNB Chain 的 X', site: '网站',
  },
}

function AssetMark({ asset, className = '' }: { asset: Asset; className?: string }) {
  return <img className={`app-asset-mark brand-mark brand-mark--${asset.mark} ${className}`} src={`/assets/marks/${asset.mark}.svg`} alt="" />
}

export default function FirstBellApp() {
  const reduceMotion = useReducedMotion()
  const [language, setLanguage] = React.useState<Language>(() => localStorage.getItem('firstbell-language') === 'zh' ? 'zh' : 'en')
  const [theme, setTheme] = React.useState<Theme>(() => localStorage.getItem('firstbell-theme') === 'dark' ? 'dark' : 'light')
  const [tab, setTab] = React.useState<Tab>(() => {
    const requested = new URLSearchParams(window.location.search).get('tab')
    return NAV.some(item => item.id === requested) ? requested as Tab : 'home'
  })
  const [query, setQuery] = React.useState('')
  const [filter, setFilter] = React.useState<'all' | 'saved'>('all')
  const [saved, setSaved] = React.useState<string[]>(() => { try { const value = JSON.parse(localStorage.getItem('firstbell-saved') ?? '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] } catch { return [] } })
  const [selected, setSelected] = React.useState<Asset | null>(null)
  const [workingAsset, setWorkingAsset] = React.useState<Asset>(assets.find(a => a.symbol === 'NVDAon')!)
  const [messages, setMessages] = React.useState<{ id: number; role: 'user' | 'guide'; text: string }[]>([])
  const [mobileMenu, setMobileMenu] = React.useState(false)
  const dialogRef = React.useRef<HTMLElement>(null)
  const t = copy[language]
  const visible = assets.filter(a => (filter === 'all' || saved.includes(a.symbol)) && `${a.company} ${a.symbol}`.toLowerCase().includes(query.trim().toLowerCase()))

  React.useEffect(() => { document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'; localStorage.setItem('firstbell-language', language) }, [language])
  React.useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('firstbell-theme', theme); document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ffffff' : '#080808') }, [theme])
  React.useEffect(() => { localStorage.setItem('firstbell-saved', JSON.stringify(saved)) }, [saved])
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
    setTab(id); setMobileMenu(false)
    window.history.replaceState(null, '', id === 'home' ? '/app/' : `/app/?tab=${id}`)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }
  const toggleSaved = (symbol: string) => setSaved(list => list.includes(symbol) ? list.filter(s => s !== symbol) : [...list, symbol])
  const answer = (prompt: string) => {
    const q = prompt.trim()
    if (!q) return
    const lower = q.toLowerCase()
    const mentioned = assets.find(asset => lower.includes(asset.symbol.toLowerCase()) || lower.includes(asset.company.toLowerCase()))
    const response = !mentioned ? t.answerSelect
      : /issuer|issue|ondo|发行|谁/.test(lower) ? t.answerIssuer(mentioned)
      : /contract|address|合约|地址/.test(lower) ? t.answerContract(mentioned)
      : /network|chain|bsc|网络|链/.test(lower) ? t.answerNetwork(mentioned) : t.answerOther
    setMessages(list => [...list, { id: list.length + 1, role: 'user', text: q }, { id: list.length + 2, role: 'guide', text: response }])
  }

  const assetCard = (asset: Asset, index: number) => <motion.article className="asset-card" key={asset.symbol} initial={reduceMotion ? false : { opacity: 0, y: 8, filter: 'blur(3px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: .25, delay: Math.min(index, 5) * .04, ease: [.22, 1, .36, 1] }}>
    <div className={`asset-art asset-art--${asset.mark}`}>
      <span className="asset-art-index">FB / {String(assets.indexOf(asset) + 1).padStart(2, '0')}</span>
      <button type="button" className={`asset-bookmark ${saved.includes(asset.symbol) ? 'is-saved' : ''}`} aria-label={saved.includes(asset.symbol) ? t.unsave : t.save} aria-pressed={saved.includes(asset.symbol)} onClick={() => toggleSaved(asset.symbol)}><Bookmark size={17} fill={saved.includes(asset.symbol) ? 'currentColor' : 'none'} /></button>
      <button type="button" className="asset-art-open" onClick={() => setSelected(asset)} aria-label={`${t.open}: ${asset.company}`}><AssetMark asset={asset} /></button>
    </div>
    <button type="button" className="asset-card-info" onClick={() => setSelected(asset)}>
      <span className="asset-card-title"><strong>{asset.symbol}</strong><span>{asset.company}</span><ArrowUpRight size={17} /></span>
      <span className="asset-card-rule" />
      <span className="asset-card-meta"><span><small>{t.issuer}</small>Ondo Global Markets</span><span><small>{t.network}</small>BNB Smart Chain</span></span>
    </button>
  </motion.article>

  return <div className="app-shell">
    <header className="app-header">
      <a href="/" className="app-brand" aria-label={t.back}><img src="/assets/firstbell-mark.svg" alt="" />FirstBell</a>
      <nav className="app-desktop-nav" aria-label="App navigation">{NAV.map(({ id, icon: Icon }) => <button type="button" key={id} onClick={() => switchTab(id)} className={`motion-tab ${tab === id ? 'active' : ''}`} aria-current={tab === id ? 'page' : undefined}>{tab === id && <motion.span className="motion-tab-indicator" layoutId="app-desktop-active" transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }} />}<Icon size={16} strokeWidth={1.8} /><span>{t.nav[id]}</span></button>)}</nav>
      <div className="app-header-actions">
        <button type="button" className="app-header-tool app-language" aria-label={t.language} onClick={() => setLanguage(value => value === 'en' ? 'zh' : 'en')}><Globe2 size={17} />{language === 'en' ? 'EN' : '中文'}<ChevronDown size={12} /></button>
        <button type="button" className="app-header-tool" aria-label={t.theme} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}><span className="motion-icon-swap" data-state={theme === 'dark' ? 'a' : 'b'}><Sun size={18} /><Moon size={18} /></span></button>
        <a href="/" className="app-website">{t.site}<ArrowUpRight size={16} /></a>
        <button type="button" className="app-header-tool app-mobile-menu" aria-label="Open menu" aria-expanded={mobileMenu} onClick={() => setMobileMenu(value => !value)}><span className="motion-icon-swap" data-state={mobileMenu ? 'b' : 'a'}><Menu size={20} /><X size={20} /></span></button>
      </div>
    </header>
    <AnimatePresence>{mobileMenu && <motion.div className="app-mobile-popover" initial={reduceMotion ? false : { opacity: 0, scale: .97, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .99, y: -4 }} transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }}><a href="/">{t.back}<ArrowUpRight size={16} /></a><a href="https://github.com/ahmardchain/FirstBell#readme" target="_blank" rel="noreferrer">{t.docs}<ArrowUpRight size={16} /></a></motion.div>}</AnimatePresence>
    <main className="app-main">
      <AnimatePresence mode="wait" initial={false}><motion.div key={tab} className="app-view" initial={reduceMotion ? false : { opacity: 0, x: 8, filter: 'blur(3px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={reduceMotion ? { opacity: 1 } : { opacity: 0, x: -8, filter: 'blur(3px)' }} transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }}>
      {tab === 'home' && <>
        <div className="app-ticker"><span>{t.live}</span><span>{t.ticker}</span><span>FB / 001</span></div>
        <section className="app-home-intro"><p className="app-label">{t.kicker}</p><h1>{t.title}</h1></section>
        <section className="app-feature"><div className="app-feature-copy"><span className="app-label">01 / {t.heroOverline}</span><h2>{t.heroTitle}</h2><p>{t.heroBody}</p><button type="button" onClick={() => setSelected(assets.find(a => a.symbol === 'NVDAon')!)}>{t.heroButton}<ArrowUpRight size={19} /></button></div><div className="app-feature-art" aria-hidden="true"><span className="feature-cross">✳</span><span className="feature-frame"><AssetMark asset={assets[2]} /></span><span className="feature-caption">NVDAon / BSC</span></div></section>
        <section className="app-browser" aria-labelledby="browse-title"><div className="app-section-heading"><div><p className="app-label">02 / INDEX</p><h2 id="browse-title">{t.browse}<span className="count">0{assets.length}</span></h2><p>{t.browseBody}</p></div><span className="app-index-caption">ISSUER / ONDO GLOBAL MARKETS<br />NETWORK / BNB SMART CHAIN</span></div>
          <div className="app-browser-controls"><div className="app-filter" role="group" aria-label="Asset filter"><button type="button" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t.all}</button><button type="button" className={filter === 'saved' ? 'active' : ''} aria-pressed={filter === 'saved'} onClick={() => setFilter('saved')}>{t.saved}{saved.length > 0 && <sup>{saved.length}</sup>}</button></div><label className="app-search"><Search size={18} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t.search} aria-label={t.search} /></label></div>
          <div className="app-result-count">{String(visible.length).padStart(2, '0')} {t.result}</div>
          {visible.length ? <div className="asset-grid">{visible.map(assetCard)}</div> : <div className="app-empty"><Search size={26} strokeWidth={1.2} /><h3>{t.noResults}</h3><p>{filter === 'saved' && saved.length === 0 ? t.emptyBody : t.emptySearch}</p><button type="button" onClick={() => { setFilter('all'); setQuery('') }}>{t.clear}<ArrowRight size={16} /></button></div>}
        </section>
      </>}
      {tab === 'trade' && <TradeWorkspace assets={assets} asset={workingAsset} onAssetChange={setWorkingAsset} onInspect={setSelected} language={language} />}
      {tab === 'agent' && <section className="agent-workspace" aria-label={t.agentTitle}>
        <AIChatCard title={t.agentTitle} subtitle={t.agentIntro} greeting={t.agentGreeting}
          prompt={t.agentHelp} prompts={t.quick} placeholder={t.agentPrompt}
          sendLabel={t.agentSend} resetLabel={t.agentReset} messages={messages}
          note={t.agentNote} sourceHref={manifest.sourceTokenList} sourceLabel={t.tokenList}
          icon={<img src="/assets/firstbell-mark.svg" alt="" />} onSend={answer} onReset={() => setMessages([])} />
      </section>}
      {tab === 'portfolio' && <PortfolioWorkspace assets={assets} saved={saved} language={language} onExplore={() => switchTab('home')} onInspect={setSelected} onToggleSaved={toggleSaved} />}
      </motion.div></AnimatePresence>
    </main>
    <footer className="app-footer"><div><a href="/" className="app-brand"><img src="/assets/firstbell-mark.svg" alt="" />FirstBell</a><p>{t.footer}</p></div><div><a href="https://github.com/ahmardchain/FirstBell#readme" target="_blank" rel="noreferrer">{t.docs}<ArrowUpRight size={14} /></a><a href="https://github.com/ahmardchain/FirstBell" target="_blank" rel="noreferrer">{t.github}<ArrowUpRight size={14} /></a><a href="https://x.com/BNBCHAIN" target="_blank" rel="noreferrer">{t.x}<ArrowUpRight size={14} /></a></div><small>© 2026 FIRSTBELL / BNB SMART CHAIN</small></footer>
    <nav className="app-bottom-nav" aria-label="App navigation">{NAV.map(({ id, icon: Icon }) => <button type="button" key={id} onClick={() => switchTab(id)} className={`motion-tab ${tab === id ? 'active' : ''}`} aria-current={tab === id ? 'page' : undefined}>{tab === id && <motion.span className="motion-tab-indicator" layoutId="app-bottom-active" transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }} />}<Icon size={22} strokeWidth={1.8} /><span>{t.nav[id]}</span></button>)}</nav>
    <AnimatePresence>{selected && <div className="asset-dialog-layer"><motion.button type="button" className="asset-dialog-backdrop" aria-label="Close asset file" onClick={() => setSelected(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /><motion.aside ref={dialogRef} className="asset-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title" initial={reduceMotion ? false : { x: 100, opacity: 0, filter: 'blur(2px)' }} animate={{ x: 0, opacity: 1, filter: 'blur(0px)' }} exit={reduceMotion ? { opacity: 0 } : { x: 100, opacity: 0, filter: 'blur(2px)' }} transition={{ duration: reduceMotion ? 0 : .4, ease: [.22, 1, .36, 1] }}><div className="dialog-top"><span className="app-label">{t.detailKicker} / {selected.symbol}</span><button type="button" aria-label="Close asset file" onClick={() => setSelected(null)}><X size={21} /></button></div><div className={`dialog-mark asset-art--${selected.mark}`}><AssetMark asset={selected} /></div><div className="dialog-body"><div className="dialog-title"><div><h2 id="asset-dialog-title">{selected.company}</h2><p>{selected.symbol} / BNB SMART CHAIN</p></div><button type="button" aria-label={saved.includes(selected.symbol) ? t.unsave : t.save} aria-pressed={saved.includes(selected.symbol)} onClick={() => toggleSaved(selected.symbol)}><Bookmark size={20} fill={saved.includes(selected.symbol) ? 'currentColor' : 'none'} /></button></div><p className="dialog-intro">{t.detailIntro}</p><dl><div><dt>{t.symbol}</dt><dd>{selected.symbol}</dd></div><div><dt>{t.issuer}</dt><dd>Ondo Global Markets</dd></div><div><dt>{t.network}</dt><dd>BNB Smart Chain / 56</dd></div><div><dt>{t.contract}</dt><dd className="contract-value" title={selected.address}>{selected.address}</dd></div></dl><p className="dialog-caution">{t.caution}</p><a href={scan(selected)} target="_blank" rel="noreferrer" className="dialog-primary">{t.exploreContract}<ExternalLink size={17} /></a><a href={manifest.sourceTokenList} target="_blank" rel="noreferrer" className="dialog-secondary">{t.tokenList}<ArrowUpRight size={17} /></a></div></motion.aside></div>}</AnimatePresence>
  </div>
}
