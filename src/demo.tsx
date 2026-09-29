import * as React from 'react'
import { ArrowRight, ArrowUpRight, ChevronDown, ExternalLink, Globe2, Menu, Moon, Search, Sun, X } from 'lucide-react'
import { FloatingIconsHero, type FloatingIconsHeroProps } from '@/components/ui/floating-icons-hero-section'
import LogoLoop from '@/components/ui/logo-loop'
import ScrollFloat from '@/components/ui/scroll-float'
import manifest from '@/asset-sources.json'


const makeTokenIcon = (mark: string): React.FC<React.SVGProps<SVGSVGElement>> =>
  function TokenIcon({ className, ...props }) {
    return <svg viewBox="0 0 64 64" role="presentation" {...props} className={`${className ?? ''} brand-mark brand-mark--${mark}`}><image href={`/assets/marks/${mark}.svg`} width="64" height="64" /></svg>
  }

const marks = ['apple', 'nvidia', 'tesla', 'microsoft', 'amazon']
const markBySymbol: Record<string, string> = { aaplon: 'apple', nvdaon: 'nvidia', tslaon: 'tesla', msfton: 'microsoft', amznon: 'amazon' }
const markFor = (symbol: string) => markBySymbol[symbol.toLowerCase()]
const positions = ['tile-1', 'tile-2', 'tile-3', 'tile-4', 'tile-5', 'tile-6', 'tile-7', 'tile-8', 'tile-9', 'tile-10']
const icons: FloatingIconsHeroProps['icons'] = positions.map((className, index) => ({
  id: index + 1,
  icon: makeTokenIcon(marks[index % marks.length]),
  className,
}))
const assets = manifest.assets.map(asset => ({ ...asset, company: asset.name.split(' (Ondo')[0] }))
type Asset = (typeof assets)[number]
type Language = 'en' | 'zh'
type Theme = 'dark' | 'light'

const content = {
  en: {
    navigation: ['Overview', 'App', 'Why FirstBell'], language: 'Language', theme: 'Toggle color theme', menu: 'Toggle navigation',
    eyebrow: 'FIRSTBELL / TOKENIZED EQUITIES ON BSC',
    hero: 'The stock names you know. The on-chain details you need.',
    heroSub: 'Explore tokenized equities on BNB Smart Chain. See the issuer, contract, and source in one clear place.',
    heroCta: 'Explore the app',
    loop: 'ASSETS IN THE INDEX',
    overviewKicker: '01 / THE IDEA', overviewTitle: 'A better first look\nat on-chain equities.',
    overviewText: 'A familiar company name is the beginning of the research, not the whole story. FirstBell connects each token to the details that matter before you go further.',
    principles: [
      ['01', 'Start with the asset', 'Browse recognizable companies and their corresponding token symbols.'],
      ['02', 'See the issuer', 'Understand who issues the token and which network it lives on.'],
      ['03', 'Verify the contract', 'Open the contract record yourself on BscScan.'],
    ],
    appKicker: '02 / THE APP', appTitle: 'Explore the\nasset index.', appText: 'Search the available examples. Every detail links back to a public source.',
    search: 'Search company or symbol', listLabel: 'Tokenized equity assets', noResults: 'No assets match your search.', clear: 'Clear search',
    assetProfile: 'ASSET FILE', issuer: 'Issuer', chain: 'Network', symbol: 'Token symbol', address: 'Contract address',
    explorer: 'Open on BscScan', source: 'View source token list', aboutToken: 'Issuer terms and location rules determine whether a token is available to you and what rights it carries.',
    aboutKicker: '03 / THE DISTINCTION', aboutTitle: 'The ticker is familiar.\nThe product is different.',
    aboutText: 'A tokenized equity has its own issuer, terms, and on-chain contract. FirstBell keeps those details near the name so you can investigate the actual product.',
    aboutFacts: [
      ['Issuer', 'Know who created the token.'],
      ['Terms', 'Read the rights and restrictions from the issuer.'],
      ['Contract', 'Check the address on the chain.'],
    ],
    endKicker: 'FIRSTBELL / START WITH CLARITY', endTitle: 'Look closer.\nThen decide.', endCta: 'Open the asset index',
    footerText: 'A clearer front door to tokenized equities.', footerNote: 'Independent interface concept. Asset availability and terms vary by location.',
    product: 'Product', resources: 'Resources', community: 'Community', docs: 'Documentation', github: 'GitHub source', bnbDocs: 'BNB Chain docs', x: 'BNB Chain on X', tokenList: 'Token source', top: 'Back to top',
  },
  zh: {
    navigation: ['概览', '应用', '关于 FirstBell'], language: '语言', theme: '切换明暗主题', menu: '切换导航',
    eyebrow: 'FIRSTBELL / BSC 上的代币化股票',
    hero: '熟悉的股票名称。清楚的链上信息。',
    heroSub: '探索 BNB 智能链上的代币化股票。在同一个地方查看发行方、合约和来源。',
    heroCta: '探索应用',
    loop: '资产目录',
    overviewKicker: '01 / 核心理念', overviewTitle: '以更清晰的视角，\n认识链上股票。',
    overviewText: '熟悉的公司名称只是研究的起点，而非全部。FirstBell 将每个代币与进一步了解所需的信息连接起来。',
    principles: [
      ['01', '从资产开始', '浏览熟悉的公司及其对应的代币符号。'],
      ['02', '查看发行方', '了解代币由谁发行、运行在哪条链上。'],
      ['03', '验证合约', '在 BscScan 上自行查看合约记录。'],
    ],
    appKicker: '02 / 应用', appTitle: '探索\n资产目录。', appText: '搜索现有示例。每项信息均可追溯到公开来源。',
    search: '搜索公司或代币符号', listLabel: '代币化股票资产', noResults: '未找到匹配的资产。', clear: '清除搜索',
    assetProfile: '资产资料', issuer: '发行方', chain: '网络', symbol: '代币符号', address: '合约地址',
    explorer: '在 BscScan 查看', source: '查看代币来源', aboutToken: '代币是否对你开放以及它所代表的权益，取决于发行方条款和你所在的地区。',
    aboutKicker: '03 / 重要区别', aboutTitle: '代码很熟悉。\n产品却不同。',
    aboutText: '代币化股票有自己的发行方、条款和链上合约。FirstBell 将这些信息放在名称旁，帮助你研究实际持有的产品。',
    aboutFacts: [
      ['发行方', '了解代币由谁创建。'],
      ['条款', '阅读发行方规定的权益和限制。'],
      ['合约', '在链上核对地址。'],
    ],
    endKicker: 'FIRSTBELL / 从清晰的信息开始', endTitle: '看得更清楚。\n再做决定。', endCta: '打开资产目录',
    footerText: '了解代币化股票，更清晰的入口。', footerNote: '独立界面概念。资产可用性和条款因地区而异。',
    product: '产品', resources: '资源', community: '社区', docs: '项目文档', github: 'GitHub 源码', bnbDocs: 'BNB Chain 文档', x: 'BNB Chain 的 X', tokenList: '代币来源', top: '返回顶部',
  },
} as const

function SectionMarker({ children }: { children: React.ReactNode }) {
  return <p className="section-marker">{children}</p>
}

export default function FirstBellLanding() {
  const [language, setLanguage] = React.useState<Language>(() => localStorage.getItem('firstbell-language') === 'zh' ? 'zh' : 'en')
  const [theme, setTheme] = React.useState<Theme>(() => localStorage.getItem('firstbell-theme') === 'light' ? 'light' : 'dark')
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [languageOpen, setLanguageOpen] = React.useState(false)
  const [active, setActive] = React.useState('top')
  const [query, setQuery] = React.useState('')
  const [selected, setSelected] = React.useState<Asset>(assets[0])
  const t = content[language]
  const filtered = assets.filter(asset => `${asset.company} ${asset.symbol}`.toLowerCase().includes(query.trim().toLowerCase()))
  const current = filtered.find(asset => asset.symbol === selected.symbol) ?? filtered[0]
  const nav = [{ id: 'top', text: t.navigation[0] }, { id: 'app', text: t.navigation[1] }, { id: 'about', text: t.navigation[2] }]
  const tokenLogos = assets.map(asset => ({
    node: <span className="loop-token"><img className={`brand-mark brand-mark--${markFor(asset.symbol)}`} src={`/assets/marks/${markFor(asset.symbol)}.svg`} alt="" /><b>{asset.symbol}</b></span>,
    href: `https://bscscan.com/token/${asset.address}`,
    ariaLabel: `${asset.company} ${asset.symbol} on BscScan`,
  }))

  React.useEffect(() => { document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'; localStorage.setItem('firstbell-language', language) }, [language])
  React.useEffect(() => { document.documentElement.dataset.theme = theme; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ffffff' : '#080808'); localStorage.setItem('firstbell-theme', theme) }, [theme])
  React.useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id) })
    }, { rootMargin: '-20% 0px -70% 0px' })
    document.querySelectorAll('#top, #app, #about').forEach(node => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  return <>
    <header className="site-nav">
      <a className="brand" href="#top" aria-label="FirstBell home" onClick={() => setMenuOpen(false)}><img src="/assets/firstbell-mark.svg" width="27" height="27" alt="" />FirstBell<span className="brand-dot">.</span></a>
      <nav aria-label="Main navigation" className={`nav-links ${menuOpen ? 'nav-open' : ''}`}>
        {nav.map(item => <a key={item.id} href={item.id === 'app' ? '/app/' : `#${item.id}`} className={active === item.id ? 'active' : ''} onClick={() => setMenuOpen(false)}>{item.text}</a>)}
      </nav>
      <div className="nav-actions">
        <div className="language-control">
          <button className="nav-tool" type="button" aria-label={t.language} aria-expanded={languageOpen} onClick={() => setLanguageOpen(open => !open)}><Globe2 size={16} /><span>{language === 'en' ? 'EN' : '中文'}</span><ChevronDown size={12} /></button>
          {languageOpen && <div className="language-menu"><button type="button" aria-pressed={language === 'en'} onClick={() => { setLanguage('en'); setLanguageOpen(false) }}>English {language === 'en' ? '✓' : ''}</button><button type="button" aria-pressed={language === 'zh'} onClick={() => { setLanguage('zh'); setLanguageOpen(false) }}>中文 {language === 'zh' ? '✓' : ''}</button></div>}
        </div>
        <button className="nav-tool theme-button" type="button" aria-label={t.theme} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
        <a className="nav-app" href="/app/" onClick={() => setMenuOpen(false)}>{t.navigation[1]} <ArrowUpRight size={16} /></a>
        <button className="nav-tool menu-button" type="button" aria-label={t.menu} aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
    </header>
    <main id="top">
      <div className="hero-frame">
        <FloatingIconsHero title={t.hero} subtitle={t.heroSub} ctaText={t.heroCta} ctaHref="/app/" icons={icons} className="landing-hero" />
        <span className="hero-eyebrow">{t.eyebrow}</span>
        <span className="hero-index" aria-hidden="true">FB / 001</span>
      </div>
      <section className="logo-ribbon" aria-label={t.loop}><span>{t.loop}</span><LogoLoop logos={tokenLogos} speed={38} gap={72} logoHeight={40} pauseOnHover ariaLabel={t.loop} /></section>
      <section id="overview" className="editorial-section overview-section" aria-labelledby="overview-title">
        <div className="content-width overview-grid">
          <div><SectionMarker>{t.overviewKicker}</SectionMarker><ScrollFloat id="overview-title">{t.overviewTitle}</ScrollFloat></div>
          <div className="overview-right"><p className="section-intro">{t.overviewText}</p><div className="principle-list">{t.principles.map(([number, title, body]) => <div className="principle" key={number}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div><ArrowUpRight size={19} aria-hidden="true" /></div>)}</div></div>
        </div>
      </section>
      <section id="app" className="editorial-section app-section" aria-labelledby="app-title">
        <div className="content-width">
          <div className="section-head"><div><SectionMarker>{t.appKicker}</SectionMarker><ScrollFloat id="app-title">{t.appTitle}</ScrollFloat></div><p className="section-intro">{t.appText}</p></div>
          <div className="browser-shell">
            <div className="browser-toolbar"><span>FIRSTBELL / ASSET INDEX</span><label className="search-field"><Search size={18} aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t.search} aria-label={t.search} /></label><span>BNB SMART CHAIN</span></div>
            <div className="browser-grid"><div className="asset-list" role="group" aria-label={t.listLabel}>{filtered.length ? filtered.map((asset, index) => <button key={asset.symbol} type="button" className={`asset-row ${current.symbol === asset.symbol ? 'is-selected' : ''}`} aria-pressed={current.symbol === asset.symbol} onClick={() => setSelected(asset)}><span className="asset-index">{String(index + 1).padStart(2, '0')}</span><img className={`brand-mark brand-mark--${markFor(asset.symbol)}`} src={`/assets/marks/${markFor(asset.symbol)}.svg`} alt="" /><span><strong>{asset.company}</strong><small>{asset.symbol}</small></span><ArrowRight size={17} /></button>) : <div className="empty-state"><p>{t.noResults}</p><button type="button" onClick={() => setQuery('')}>{t.clear} ↗</button></div>}</div>
              {current ? <div className="asset-profile" key={current.symbol}><div className="profile-kicker"><span>{t.assetProfile}</span><span>0{assets.indexOf(current) + 1} / 0{assets.length}</span></div><div className="profile-name"><img className={`brand-mark brand-mark--${markFor(current.symbol)}`} src={`/assets/marks/${markFor(current.symbol)}.svg`} alt="" /><div><h3>{current.company}</h3><p>{current.symbol}</p></div></div><dl className="profile-facts"><div><dt>{t.issuer}</dt><dd>Ondo Global Markets</dd></div><div><dt>{t.chain}</dt><dd>BNB Smart Chain</dd></div><div><dt>{t.symbol}</dt><dd>{current.symbol}</dd></div><div><dt>{t.address}</dt><dd className="address"><code>{current.address}</code></dd></div></dl><p className="profile-note">{t.aboutToken}</p><div className="profile-links"><a href={`https://bscscan.com/token/${current.address}`} target="_blank" rel="noreferrer">{t.explorer}<ExternalLink size={17} /></a><a href={manifest.sourceTokenList} target="_blank" rel="noreferrer">{t.source}<ArrowUpRight size={17} /></a></div></div> : <div className="asset-profile empty-profile" aria-hidden="true">—</div>}
            </div>
          </div>
        </div>
      </section>
      <section id="about" className="editorial-section about-section" aria-labelledby="about-title"><div className="content-width about-grid"><div><SectionMarker>{t.aboutKicker}</SectionMarker><ScrollFloat id="about-title">{t.aboutTitle}</ScrollFloat><p className="section-intro">{t.aboutText}</p></div><div className="about-facts">{t.aboutFacts.map(([title, body], index) => <div key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{body}</p></div>)}</div></div></section>
      <section className="end-section"><div className="content-width"><SectionMarker>{t.endKicker}</SectionMarker><ScrollFloat>{t.endTitle}</ScrollFloat><a href="/app/">{t.endCta}<ArrowUpRight size={19} /></a></div></section>
    </main>
    <footer className="site-footer"><div className="content-width"><ScrollFloat className="footer-statement" scrollStart="top 98%" scrollEnd="top 70%">{t.footerText}</ScrollFloat><div className="footer-grid"><div className="footer-brand"><a className="brand" href="#top"><img src="/assets/firstbell-mark.svg" width="27" height="27" alt="" />FirstBell<span className="brand-dot">.</span></a><small>© 2026 FirstBell. {t.footerNote}</small></div><div className="footer-col"><strong>{t.product}</strong><a href="#top">{t.navigation[0]}</a><a href="/app/">{t.navigation[1]}</a><a href="#about">{t.navigation[2]}</a></div><div className="footer-col"><strong>{t.resources}</strong><a href="https://github.com/ahmardchain/FirstBell#readme" target="_blank" rel="noreferrer">{t.docs} ↗</a><a href="https://docs.bnbchain.org/" target="_blank" rel="noreferrer">{t.bnbDocs} ↗</a><a href={manifest.sourceTokenList} target="_blank" rel="noreferrer">{t.tokenList} ↗</a></div><div className="footer-col"><strong>{t.community}</strong><a href="https://github.com/ahmardchain/FirstBell" target="_blank" rel="noreferrer">{t.github} ↗</a><a href="https://x.com/BNBCHAIN" target="_blank" rel="noreferrer">{t.x} ↗</a><a href="#top">{t.top} ↑</a></div></div></div></footer>
  </>
}
