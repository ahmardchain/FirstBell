import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, Bookmark, Check, ChevronDown, ExternalLink, Globe2, House, Menu, Moon, Search, Send, Sparkles, Sun, X, ChartNoAxesCombined, Wallet } from 'lucide-react'
import manifest from '@/asset-sources.json'
import './app.css'

type Language = 'en' | 'zh'
type Theme = 'dark' | 'light'
type Tab = 'home' | 'trade' | 'agent' | 'portfolio'
const markBySymbol: Record<string, string> = { AAPLon: 'apple', TSLAon: 'tesla', NVDAon: 'nvidia', MSFTon: 'microsoft', AMZNon: 'amazon' }
const assets = manifest.assets.map(asset => ({ ...asset, company: asset.name.split(' (Ondo')[0], mark: markBySymbol[asset.symbol] }))
type Asset = (typeof assets)[number]
const scan = (asset: Asset) => `https://bscscan.com/token/${asset.address}`
const NAV: { id: Tab; icon: typeof House }[] = [
  { id: 'home', icon: House }, { id: 'trade', icon: ChartNoAxesCombined },
  { id: 'agent', icon: Sparkles }, { id: 'portfolio', icon: Wallet },
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
    tradeKicker: 'FIRSTBELL / TRADE', tradeTitle: 'A clearer path from card to chain.',
    tradeIntro: 'Choose an asset and review its on-chain identity. Live quotes and execution are not connected yet.',
    choose: 'Choose an asset', route: 'THE ROUTE', card: 'Card funding', cardText: 'On-ramp integration planned',
    verify: 'Verify the asset', verifyText: 'Issuer and BSC contract available now',
    receive: 'Receive token', receiveText: 'Execution integration pending',
    unavailable: 'Trading is not live yet', tradeNotice: 'No payment will be collected here. Use the asset file to review the verified contract and issuer source.',
    inspect: 'Inspect asset',
    agentKicker: 'FIRSTBELL / AGENT', agentTitle: 'Ask about the asset.',
    agentIntro: 'A source-based research guide for the five assets in this index.',
    agentPrompt: 'Ask about issuer, contract, or network', agentSend: 'Send question',
    quick: ['Who issues this token?', 'What is the contract?', 'Which network is it on?'],
    guideHello: 'Select an asset and ask about its issuer, contract, or network. Answers here are assembled from the public token list.',
    answerIssuer: (a: Asset) => `${a.symbol} is listed as an Ondo tokenized asset. Verify the issuer and product terms at the source before relying on this listing.`,
    answerContract: (a: Asset) => `The BNB Smart Chain contract listed for ${a.symbol} is ${a.address}. Open BscScan to inspect it directly.`,
    answerNetwork: (a: Asset) => `${a.symbol} is listed on BNB Smart Chain (chain ID 56).`,
    answerOther: 'I can help with the issuer, contract address, or network for the selected asset. Try one of the suggested questions.',
    agentNote: 'This guide uses fixed source records. It is not a live AI model or investment advice.',
    portfolioKicker: 'FIRSTBELL / PORTFOLIO', portfolioTitle: 'Keep the assets you follow close.',
    portfolioIntro: 'Your saved assets stay in this browser. Wallet holdings are not connected.',
    savedHeading: 'Saved assets', emptyTitle: 'Nothing saved yet.', emptyBody: 'Bookmark an asset on Home to add it here.',
    goHome: 'Explore assets', local: 'Saved locally on this device',
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
    tradeKicker: 'FIRSTBELL / 交易', tradeTitle: '从银行卡到链上，路径更清晰。',
    tradeIntro: '选择资产，查看其链上身份。实时报价与交易执行尚未接入。',
    choose: '选择资产', route: '交易路径', card: '银行卡入金', cardText: '入金服务计划接入',
    verify: '核实资产', verifyText: '现可查看发行方与 BSC 合约', receive: '接收代币', receiveText: '交易执行尚未接入',
    unavailable: '交易尚未开放', tradeNotice: '这里不会收取任何款项。请在资产资料中核实合约和发行方来源。', inspect: '查看资产',
    agentKicker: 'FIRSTBELL / 助手', agentTitle: '了解这项资产。',
    agentIntro: '根据目录中五项资产的公开来源回答研究问题。',
    agentPrompt: '询问发行方、合约或网络', agentSend: '发送问题',
    quick: ['谁发行了这个代币？', '合约地址是什么？', '它在哪条链上？'],
    guideHello: '选择资产，询问发行方、合约或网络。这里的回答来自公开代币列表。',
    answerIssuer: (a: Asset) => `${a.symbol} 被列为 Ondo 代币化资产。使用前请通过来源核实发行方及产品条款。`,
    answerContract: (a: Asset) => `${a.symbol} 在 BNB 智能链上列出的合约地址是 ${a.address}。请打开 BscScan 直接核实。`,
    answerNetwork: (a: Asset) => `${a.symbol} 列在 BNB 智能链上（链 ID 56）。`,
    answerOther: '我可以回答所选资产的发行方、合约地址或网络问题。请试试建议的问题。',
    agentNote: '本指南基于固定的公开记录，不是实时 AI 模型或投资建议。',
    portfolioKicker: 'FIRSTBELL / 资产', portfolioTitle: '随时查看你关注的资产。',
    portfolioIntro: '收藏保存在当前浏览器中。钱包持仓尚未连接。',
    savedHeading: '已收藏资产', emptyTitle: '还没有收藏。', emptyBody: '在首页收藏一项资产，即可在这里看到。',
    goHome: '探索资产', local: '保存在此设备上',
    footer: '研究代币，不止看股票代码。', docs: '项目文档', github: 'GitHub', x: 'BNB Chain 的 X', site: '网站',
  },
}

function AssetMark({ asset, className = '' }: { asset: Asset; className?: string }) {
  return <img className={`app-asset-mark brand-mark brand-mark--${asset.mark} ${className}`} src={`/assets/marks/${asset.mark}.svg`} alt="" />
}

export default function FirstBellApp() {
  const [language, setLanguage] = React.useState<Language>(() => localStorage.getItem('firstbell-language') === 'zh' ? 'zh' : 'en')
  const [theme, setTheme] = React.useState<Theme>(() => localStorage.getItem('firstbell-theme') === 'dark' ? 'dark' : 'light')
  const [tab, setTab] = React.useState<Tab>('home')
  const [query, setQuery] = React.useState('')
  const [filter, setFilter] = React.useState<'all' | 'saved'>('all')
  const [saved, setSaved] = React.useState<string[]>(() => { try { const value = JSON.parse(localStorage.getItem('firstbell-saved') ?? '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] } catch { return [] } })
  const [selected, setSelected] = React.useState<Asset | null>(null)
  const [workingAsset, setWorkingAsset] = React.useState<Asset>(assets[0])
  const [agentAsset, setAgentAsset] = React.useState<Asset>(assets[0])
  const [question, setQuestion] = React.useState('')
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

  const switchTab = (id: Tab) => { setTab(id); setMobileMenu(false); window.scrollTo({ top: 0, behavior: 'instant' }) }
  const toggleSaved = (symbol: string) => setSaved(list => list.includes(symbol) ? list.filter(s => s !== symbol) : [...list, symbol])
  const answer = (prompt: string) => {
    const q = prompt.trim()
    if (!q) return
    const lower = q.toLowerCase()
    const response = /issuer|issue|ondo|发行/.test(lower) ? t.answerIssuer(agentAsset)
      : /contract|address|合约|地址/.test(lower) ? t.answerContract(agentAsset)
      : /network|chain|bsc|网络|链/.test(lower) ? t.answerNetwork(agentAsset) : t.answerOther
    setMessages(list => [...list, { id: list.length + 1, role: 'user', text: q }, { id: list.length + 2, role: 'guide', text: response }])
    setQuestion('')
  }

  const assetCard = (asset: Asset, index: number) => <motion.article className="asset-card" key={asset.symbol} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3, delay: index * .035 }}>
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
      <a href="/" className="app-brand" aria-label={t.back}><img src="/assets/firstbell-mark.svg" alt="" />FirstBell<span>.</span></a>
      <nav className="app-desktop-nav" aria-label="App navigation">{NAV.map(({ id, icon: Icon }) => <button type="button" key={id} onClick={() => switchTab(id)} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined}><Icon size={16} strokeWidth={1.8} />{t.nav[id]}</button>)}</nav>
      <div className="app-header-actions">
        <button type="button" className="app-header-tool app-language" aria-label={t.language} onClick={() => setLanguage(value => value === 'en' ? 'zh' : 'en')}><Globe2 size={17} />{language === 'en' ? 'EN' : '中文'}<ChevronDown size={12} /></button>
        <button type="button" className="app-header-tool" aria-label={t.theme} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
        <a href="/" className="app-website">{t.site}<ArrowUpRight size={16} /></a>
        <button type="button" className="app-header-tool app-mobile-menu" aria-label="Open menu" aria-expanded={mobileMenu} onClick={() => setMobileMenu(value => !value)}>{mobileMenu ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </header>
    {mobileMenu && <div className="app-mobile-popover"><a href="/">{t.back}<ArrowUpRight size={16} /></a><a href="https://github.com/ahmardchain/FirstBell#readme" target="_blank" rel="noreferrer">{t.docs}<ArrowUpRight size={16} /></a></div>}
    <main className="app-main">
      {tab === 'home' && <>
        <div className="app-ticker"><span><i className="app-status-dot" />{t.live}</span><span>{t.ticker}</span><span>FB / 001</span></div>
        <section className="app-home-intro"><p className="app-label">{t.kicker}</p><h1>{t.title}</h1></section>
        <section className="app-feature"><div className="app-feature-copy"><span className="app-label">01 / {t.heroOverline}</span><h2>{t.heroTitle}</h2><p>{t.heroBody}</p><button type="button" onClick={() => setSelected(assets.find(a => a.symbol === 'NVDAon')!)}>{t.heroButton}<ArrowUpRight size={19} /></button></div><div className="app-feature-art" aria-hidden="true"><span className="feature-cross">✳</span><span className="feature-frame"><AssetMark asset={assets[2]} /></span><span className="feature-caption">NVDAon / BSC</span></div></section>
        <section className="app-browser" aria-labelledby="browse-title"><div className="app-section-heading"><div><p className="app-label">02 / INDEX</p><h2 id="browse-title">{t.browse}<span className="count">0{assets.length}</span></h2><p>{t.browseBody}</p></div><span className="app-index-caption">ISSUER / ONDO GLOBAL MARKETS<br />NETWORK / BNB SMART CHAIN</span></div>
          <div className="app-browser-controls"><div className="app-filter" role="group" aria-label="Asset filter"><button type="button" className={filter === 'all' ? 'active' : ''} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t.all}</button><button type="button" className={filter === 'saved' ? 'active' : ''} aria-pressed={filter === 'saved'} onClick={() => setFilter('saved')}>{t.saved}{saved.length > 0 && <sup>{saved.length}</sup>}</button></div><label className="app-search"><Search size={18} /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t.search} aria-label={t.search} /></label></div>
          <div className="app-result-count">{String(visible.length).padStart(2, '0')} {t.result}</div>
          {visible.length ? <div className="asset-grid">{visible.map(assetCard)}</div> : <div className="app-empty"><Search size={26} strokeWidth={1.2} /><h3>{t.noResults}</h3><p>{filter === 'saved' && saved.length === 0 ? t.emptyBody : t.emptySearch}</p><button type="button" onClick={() => { setFilter('all'); setQuery('') }}>{t.clear}<ArrowRight size={16} /></button></div>}
        </section>
      </>}
      {tab === 'trade' && <section className="app-workspace"><div className="workspace-lead"><p className="app-label">{t.tradeKicker}</p><h1>{t.tradeTitle}</h1><p>{t.tradeIntro}</p></div><div className="trade-layout"><div className="trade-select"><span className="app-label">01 / {t.choose}</span><div className="trade-options">{assets.map(asset => <button type="button" key={asset.symbol} onClick={() => setWorkingAsset(asset)} className={workingAsset.symbol === asset.symbol ? 'selected' : ''} aria-pressed={workingAsset.symbol === asset.symbol}><AssetMark asset={asset} /><span><strong>{asset.symbol}</strong><small>{asset.company}</small></span>{workingAsset.symbol === asset.symbol ? <Check size={18} /> : <ArrowRight size={18} />}</button>)}</div></div><div className="trade-route"><div className="trade-route-heading"><span className="app-label">02 / {t.route}</span><strong>{workingAsset.symbol}</strong></div><div className="trade-large-mark"><AssetMark asset={workingAsset} /></div><div className="route-steps"><div><span>01</span><p><strong>{t.card}</strong><small>{t.cardText}</small></p><span className="route-pending">—</span></div><div><span>02</span><p><strong>{t.verify}</strong><small>{t.verifyText}</small></p><Check size={16} /></div><div><span>03</span><p><strong>{t.receive}</strong><small>{t.receiveText}</small></p><span className="route-pending">—</span></div></div><button className="trade-disabled" type="button" disabled>{t.unavailable}</button><p className="trade-notice">{t.tradeNotice}</p><button type="button" className="text-link" onClick={() => setSelected(workingAsset)}>{t.inspect}<ArrowUpRight size={17} /></button></div></div></section>}
      {tab === 'agent' && <section className="app-workspace"><div className="workspace-lead"><p className="app-label">{t.agentKicker}</p><h1>{t.agentTitle}</h1><p>{t.agentIntro}</p></div><div className="agent-layout"><aside className="agent-assets"><p className="app-label">01 / {t.choose}</p>{assets.map(asset => <button type="button" key={asset.symbol} className={agentAsset.symbol === asset.symbol ? 'selected' : ''} onClick={() => { setAgentAsset(asset); setMessages([]) }}><AssetMark asset={asset} /><span>{asset.symbol}<small>{asset.company}</small></span><ArrowRight size={16} /></button>)}</aside><div className="agent-conversation"><div className="agent-conversation-header"><AssetMark asset={agentAsset} /><div><strong>{agentAsset.symbol}</strong><small>{t.source}</small></div></div><div className="agent-messages" aria-live="polite"><div className="agent-message guide"><span>FIRSTBELL / 01</span><p>{t.guideHello}</p></div>{messages.map(m => <motion.div initial={{ opacity: 0, y: 7 }} animate={{ opacity: 1, y: 0 }} key={m.id} className={`agent-message ${m.role}`}><span>{m.role === 'user' ? 'YOU' : 'FIRSTBELL / SOURCE'}</span><p>{m.text}</p>{m.role === 'guide' && <a href={manifest.sourceTokenList} target="_blank" rel="noreferrer">{t.tokenList}<ArrowUpRight size={14} /></a>}</motion.div>)}</div><div className="agent-compose"><div className="agent-quick">{t.quick.map(prompt => <button key={prompt} type="button" onClick={() => answer(prompt)}>{prompt}<ArrowUpRight size={14} /></button>)}</div><form onSubmit={event => { event.preventDefault(); answer(question) }}><label className="sr-only" htmlFor="agent-question">{t.agentPrompt}</label><input id="agent-question" value={question} onChange={event => setQuestion(event.target.value)} placeholder={t.agentPrompt} /><button type="submit" disabled={!question.trim()} aria-label={t.agentSend}><Send size={18} /></button></form><small>{t.agentNote}</small></div></div></div></section>}
      {tab === 'portfolio' && <section className="app-workspace"><div className="workspace-lead"><p className="app-label">{t.portfolioKicker}</p><h1>{t.portfolioTitle}</h1><p>{t.portfolioIntro}</p></div><div className="portfolio-bar"><h2>{t.savedHeading} <span>0{saved.length}</span></h2><span>{t.local}</span></div>{saved.length ? <div className="asset-grid">{assets.filter(asset => saved.includes(asset.symbol)).map(assetCard)}</div> : <div className="portfolio-empty"><Bookmark size={31} strokeWidth={1.25} /><h2>{t.emptyTitle}</h2><p>{t.emptyBody}</p><button type="button" onClick={() => switchTab('home')}>{t.goHome}<ArrowUpRight size={18} /></button></div>}</section>}
    </main>
    <footer className="app-footer"><div><a href="/" className="app-brand"><img src="/assets/firstbell-mark.svg" alt="" />FirstBell<span>.</span></a><p>{t.footer}</p></div><div><a href="https://github.com/ahmardchain/FirstBell#readme" target="_blank" rel="noreferrer">{t.docs}<ArrowUpRight size={14} /></a><a href="https://github.com/ahmardchain/FirstBell" target="_blank" rel="noreferrer">{t.github}<ArrowUpRight size={14} /></a><a href="https://x.com/BNBCHAIN" target="_blank" rel="noreferrer">{t.x}<ArrowUpRight size={14} /></a></div><small>© 2026 FIRSTBELL / BNB SMART CHAIN</small></footer>
    <nav className="app-bottom-nav" aria-label="App navigation">{NAV.map(({ id, icon: Icon }) => <button type="button" key={id} onClick={() => switchTab(id)} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined}><Icon size={22} strokeWidth={1.8} /><span>{t.nav[id]}</span></button>)}</nav>
    <AnimatePresence>{selected && <div className="asset-dialog-layer"><motion.button type="button" className="asset-dialog-backdrop" aria-label="Close asset file" onClick={() => setSelected(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /><motion.aside ref={dialogRef} className="asset-dialog" role="dialog" aria-modal="true" aria-labelledby="asset-dialog-title" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', stiffness: 360, damping: 38 }}><div className="dialog-top"><span className="app-label">{t.detailKicker} / {selected.symbol}</span><button type="button" aria-label="Close asset file" onClick={() => setSelected(null)}><X size={21} /></button></div><div className={`dialog-mark asset-art--${selected.mark}`}><AssetMark asset={selected} /></div><div className="dialog-body"><div className="dialog-title"><div><h2 id="asset-dialog-title">{selected.company}</h2><p>{selected.symbol} / BNB SMART CHAIN</p></div><button type="button" aria-label={saved.includes(selected.symbol) ? t.unsave : t.save} aria-pressed={saved.includes(selected.symbol)} onClick={() => toggleSaved(selected.symbol)}><Bookmark size={20} fill={saved.includes(selected.symbol) ? 'currentColor' : 'none'} /></button></div><p className="dialog-intro">{t.detailIntro}</p><dl><div><dt>{t.symbol}</dt><dd>{selected.symbol}</dd></div><div><dt>{t.issuer}</dt><dd>Ondo Global Markets</dd></div><div><dt>{t.network}</dt><dd>BNB Smart Chain / 56</dd></div><div><dt>{t.contract}</dt><dd className="contract-value" title={selected.address}>{selected.address}</dd></div></dl><p className="dialog-caution">{t.caution}</p><a href={scan(selected)} target="_blank" rel="noreferrer" className="dialog-primary">{t.exploreContract}<ExternalLink size={17} /></a><a href={manifest.sourceTokenList} target="_blank" rel="noreferrer" className="dialog-secondary">{t.tokenList}<ArrowUpRight size={17} /></a></div></motion.aside></div>}</AnimatePresence>
  </div>
}
