import * as React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, ChevronDown, ExternalLink, Globe2, Menu, Moon, Search, Sun, X } from 'lucide-react'
import { FloatingIconsHero, type FloatingIconsHeroProps } from '@/components/ui/floating-icons-hero-section'
import LogoLoop from '@/components/ui/logo-loop'
import ScrollFloat from '@/components/ui/scroll-float'
import OrbitingCirclesGlobe from '@/components/ui/orbiting-circles-02'
import HowItWorks from '@/components/ui/how-it-works'
import manifest from '@/asset-sources.json'
import './homepage-icons.css'


const makeTokenIcon = (mark: string, symbol: string): React.FC<React.SVGProps<SVGSVGElement>> =>
  function TokenIcon({ className, ...props }) {
    return <svg viewBox="0 0 64 64" role="presentation" data-symbol={symbol} {...props} className={`${className ?? ''} brand-mark brand-mark--${mark}`}><image href={`/assets/marks/${mark}.svg`} width="64" height="64" /></svg>
  }

// Each company appears once; this decorative set is local to the landing page.
const heroAssets = [
  { symbol: 'AAPLon', mark: 'apple' },
  { symbol: 'NVDAon', mark: 'nvidia' },
  { symbol: 'TSLAon', mark: 'tesla' },
  { symbol: 'MSFTon', mark: 'microsoft' },
  { symbol: 'AMZN', mark: 'amazon' },
  { symbol: 'GOOGLx', mark: 'google' },
  { symbol: 'METAx', mark: 'meta' },
  { symbol: 'NFLXx', mark: 'netflix' },
  { symbol: 'COINx', mark: 'coinbase' },
  { symbol: 'INTCx', mark: 'intel' },
  { symbol: 'UBERx', mark: 'uber' },
  { symbol: 'KO_x', mark: 'cocacola' },
  { symbol: 'HOODx', mark: 'robinhood' },
]
const markBySymbol: Record<string, string> = { aaplon: 'apple', nvdaon: 'nvidia', tslaon: 'tesla', msfton: 'microsoft', amznon: 'amazon' }
const markFor = (symbol: string) => markBySymbol[symbol.toLowerCase()]
const icons: FloatingIconsHeroProps['icons'] = heroAssets.map((asset, index) => ({
  id: index + 1,
  icon: makeTokenIcon(asset.mark, asset.symbol),
  className: `tile-${index + 1}`,
}))
const assets = manifest.assets.map(asset => ({ ...asset, company: asset.name.split(' (Ondo')[0] }))
type Asset = (typeof assets)[number]
type Language = 'en' | 'zh'
type Theme = 'dark' | 'light'

const content = {
  en: {
    navigation: ['Overview', 'App', 'How it works'], language: 'Language', theme: 'Toggle color theme', menu: 'Toggle navigation',
    eyebrow: 'FirstBell — tokenized stocks on BNB Smart Chain',
    hero: 'Buy your first stock on-chain.',
    heroSub: 'Sign up with Google or email, pay with your card, and own a piece of the stock in under a minute. No seed phrase. No brokerage account.',
    heroCta: 'Buy your first stock', heroSecondaryCta: 'See how it works',
    loop: 'Trading on FirstBell',
    overviewKicker: '01 / THE DISTINCTION', overviewTitle: 'The ticker is familiar. The product is different.',
    overviewText: 'You own a token issued by Ondo Global Markets on BNB Smart Chain. Its issuer terms define the rights it carries. Check the issuer and contract before you buy.',
    principles: [
      ['01', 'Start with the asset', 'Browse recognizable companies and their corresponding token symbols.'],
      ['02', 'See the issuer', 'Understand who issues the token and which network it lives on.'],
      ['03', 'Verify the contract', 'Open the contract record yourself on BscScan.'],
    ],
    appKicker: '02 / THE APP', appTitle: 'Start with the stock you know.', appText: 'Five tokenized equities with real issuers and verified contracts on BNB Smart Chain.',
    search: 'Search company or symbol', listLabel: 'Tokenized equity assets', noResults: 'No assets match your search.', clear: 'Clear search',
    assetProfile: 'ASSET FILE', issuer: 'Issuer', chain: 'Network', symbol: 'Token symbol', address: 'Contract address',
    explorer: 'Open on BscScan', source: 'View source token list', aboutToken: 'Issuer terms and location rules determine whether a token is available to you and what rights it carries.',
    howKicker: '03 / HOW IT WORKS', howTitle: 'How it works.',
    howText: 'From your account to your first tokenized stock.',
    howSteps: [
      { title: 'Create account', description: 'Create your account with Google or email. Simple — your wallet is made for you, no seed phrase to write down.', colorTheme: 'orange' },
      { title: 'Deposit from your card', description: 'Pay with your card. Your funds land on BNB Smart Chain, ready to trade.', colorTheme: 'blue' },
      { title: 'Choose a stock', description: 'Explore the stocks and check the token, issuer, and contract.', colorTheme: 'purple' },
      { title: 'Trade your tokenized equity', description: 'Buy and sell. Own your first tokenized stock in under a minute.', colorTheme: 'orange' },
    ],
    endKicker: 'FIRSTBELL', endTitle: 'Your first stock is a minute away.', endCta: 'Buy your first stock',
    footerText: 'Your first stock, on-chain.', footerNote: 'Independent interface concept. Asset availability and terms vary by location.',
    product: 'Product', resources: 'Resources', community: 'Community', docs: 'Documentation', github: 'GitHub source', bnbDocs: 'BNB Chain docs', x: 'BNB Chain on X', tokenList: 'Token source', top: 'Back to top',
  },
  zh: {
    navigation: ['概览', '应用', '使用流程'], language: '语言', theme: '切换明暗主题', menu: '切换导航',
    eyebrow: 'FirstBell — BNB 智能链上的代币化股票',
    hero: '在链上买入你的第一只股票。',
    heroSub: '使用 Google 或邮箱注册，使用银行卡付款，不到一分钟即可拥有一份股票。无需助记词，无需证券账户。',
    heroCta: '买入你的第一只股票', heroSecondaryCta: '了解使用流程',
    loop: '在 FirstBell 交易',
    overviewKicker: '01 / 产品区别', overviewTitle: '熟悉的股票代码，不同的产品。',
    overviewText: '你拥有的是 Ondo Global Markets 在 BNB 智能链上发行的代币。发行方条款决定其代表的权益。买入前，请查看发行方与合约。',
    principles: [
      ['01', '从资产开始', '浏览熟悉的公司及其对应的代币符号。'],
      ['02', '查看发行方', '了解代币由谁发行、运行在哪条链上。'],
      ['03', '验证合约', '在 BscScan 上自行查看合约记录。'],
    ],
    appKicker: '02 / 应用', appTitle: '从你熟悉的股票开始。', appText: '五种代币化股票，拥有真实发行方和 BNB 智能链上经过验证的合约。',
    search: '搜索公司或代币符号', listLabel: '代币化股票资产', noResults: '未找到匹配的资产。', clear: '清除搜索',
    assetProfile: '资产资料', issuer: '发行方', chain: '网络', symbol: '代币符号', address: '合约地址',
    explorer: '在 BscScan 查看', source: '查看代币来源', aboutToken: '代币是否对你开放以及它所代表的权益，取决于发行方条款和你所在的地区。',
    howKicker: '03 / 使用流程', howTitle: '使用流程。',
    howText: '从创建账户，到拥有你的第一只代币化股票。',
    howSteps: [
      { title: '创建账户', description: '使用 Google 或邮箱创建账户。很简单——系统会为你创建钱包，无需记录助记词。', colorTheme: 'orange' },
      { title: '使用银行卡充值', description: '使用银行卡付款。资金将到账 BNB 智能链，随时准备交易。', colorTheme: 'blue' },
      { title: '选择股票', description: '浏览股票，并查看代币、发行方和合约。', colorTheme: 'purple' },
      { title: '交易代币化股票', description: '买入和卖出。不到一分钟，拥有你的第一只代币化股票。', colorTheme: 'orange' },
    ],
    endKicker: 'FIRSTBELL', endTitle: '一分钟，拥有你的第一只股票。', endCta: '买入你的第一只股票',
    footerText: '你的第一只股票，在链上。', footerNote: '独立界面概念。资产可用性和条款因地区而异。',
    product: '产品', resources: '资源', community: '社区', docs: '项目文档', github: 'GitHub 源码', bnbDocs: 'BNB Chain 文档', x: 'BNB Chain 的 X', tokenList: '代币来源', top: '返回顶部',
  },
} as const

function SectionMarker({ children }: { children: React.ReactNode }) {
  return <p className="section-marker">{children}</p>
}

export default function FirstBellLanding() {
  const reduceMotion = useReducedMotion()
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
  const nav = [{ id: 'top', text: t.navigation[0] }, { id: 'app', text: t.navigation[1] }, { id: 'how-it-works', text: t.navigation[2] }]
  const tokenLogos = assets.map(asset => ({
    node: <span className="loop-token"><img className={`brand-mark brand-mark--${markFor(asset.symbol)}`} src={`/assets/marks/${markFor(asset.symbol)}.svg`} alt="" /><b>{asset.symbol === 'AMZNon' ? 'AMZN' : asset.symbol}</b></span>,
    href: `https://bscscan.com/token/${asset.address}`,
    ariaLabel: `${asset.company} ${asset.symbol} on BscScan`,
  }))

  React.useEffect(() => { document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'; localStorage.setItem('firstbell-language', language) }, [language])
  React.useEffect(() => { document.documentElement.dataset.theme = theme; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ffffff' : '#080808'); localStorage.setItem('firstbell-theme', theme) }, [theme])
  React.useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id) })
    }, { rootMargin: '-20% 0px -70% 0px' })
    document.querySelectorAll('#top, #app, #how-it-works').forEach(node => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  return <>
    <header className="site-nav">
      <a className="brand" href="#top" aria-label="FirstBell home" onClick={() => setMenuOpen(false)}><img src="/assets/firstbell-mark.svg" width="27" height="27" alt="" />FirstBell</a>
      <nav aria-label="Main navigation" className={`nav-links ${menuOpen ? 'nav-open' : ''}`}>
        {nav.map(item => <a key={item.id} href={item.id === 'app' ? '/app/' : `#${item.id}`} className={active === item.id ? 'active' : ''} onClick={() => setMenuOpen(false)}>{item.text}</a>)}
      </nav>
      <div className="nav-actions">
        <div className="language-control">
          <button className="nav-tool" type="button" aria-label={t.language} aria-expanded={languageOpen} onClick={() => setLanguageOpen(open => !open)}><Globe2 size={16} /><span>{language === 'en' ? 'EN' : '中文'}</span><ChevronDown size={12} /></button>
          <AnimatePresence>{languageOpen && <motion.div className="language-menu" initial={reduceMotion ? false : { opacity: 0, scale: .97, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .99, y: -4 }} transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }}><button type="button" aria-pressed={language === 'en'} onClick={() => { setLanguage('en'); setLanguageOpen(false) }}>English {language === 'en' ? '✓' : ''}</button><button type="button" aria-pressed={language === 'zh'} onClick={() => { setLanguage('zh'); setLanguageOpen(false) }}>中文 {language === 'zh' ? '✓' : ''}</button></motion.div>}</AnimatePresence>
        </div>
        <button className="nav-tool theme-button" type="button" aria-label={t.theme} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}><span className="motion-icon-swap" data-state={theme === 'dark' ? 'a' : 'b'}><Sun size={17} /><Moon size={17} /></span></button>
        <a className="nav-app" href="/app/" onClick={() => setMenuOpen(false)}>{t.navigation[1]} <ArrowUpRight size={16} /></a>
        <button className="nav-tool menu-button" type="button" aria-label={t.menu} aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}><span className="motion-icon-swap" data-state={menuOpen ? 'b' : 'a'}><Menu size={20} /><X size={20} /></span></button>
      </div>
    </header>
    <main id="top">
      <div className="hero-frame">
        <FloatingIconsHero title={t.hero} subtitle={t.heroSub} ctaText={t.heroCta} ctaHref="/app/?tab=trade&side=buy" secondaryCtaText={t.heroSecondaryCta} secondaryCtaHref="#how-it-works" icons={icons} className="landing-hero" />
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
              <AnimatePresence mode="wait" initial={false}>{current ? <motion.div className="asset-profile" key={current.symbol} initial={reduceMotion ? false : { opacity: 0, x: 8, filter: 'blur(3px)' }} animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }} exit={reduceMotion ? { opacity: 1 } : { opacity: 0, x: -8, filter: 'blur(3px)' }} transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }}><div className="profile-kicker"><span>{t.assetProfile}</span><span>0{assets.indexOf(current) + 1} / 0{assets.length}</span></div><div className="profile-name"><img className={`brand-mark brand-mark--${markFor(current.symbol)}`} src={`/assets/marks/${markFor(current.symbol)}.svg`} alt="" /><div><h3>{current.company}</h3><p>{current.symbol}</p></div></div><dl className="profile-facts"><div><dt>{t.issuer}</dt><dd>Ondo Global Markets</dd></div><div><dt>{t.chain}</dt><dd>BNB Smart Chain</dd></div><div><dt>{t.symbol}</dt><dd>{current.symbol}</dd></div><div><dt>{t.address}</dt><dd className="address"><code>{current.address}</code></dd></div></dl><p className="profile-note">{t.aboutToken}</p><div className="profile-links"><a href={`https://bscscan.com/token/${current.address}`} target="_blank" rel="noreferrer">{t.explorer}<ExternalLink size={17} /></a><a href={manifest.sourceTokenList} target="_blank" rel="noreferrer">{t.source}<ArrowUpRight size={17} /></a></div></motion.div> : <motion.div key="empty" className="asset-profile empty-profile" role="status">{t.noResults}</motion.div>}</AnimatePresence>
            </div>
          </div>
        </div>
      </section>
      <section id="how-it-works" className="how-it-works-section" aria-labelledby="how-it-works-title">
        <div className="content-width how-it-works-heading"><SectionMarker>{t.howKicker}</SectionMarker><ScrollFloat id="how-it-works-title">{t.howTitle}</ScrollFloat><p className="section-intro">{t.howText}</p></div>
        <HowItWorks features={[...t.howSteps]} ariaLabel={t.howTitle} />
      </section>
      <section className="end-section"><div className="content-width"><SectionMarker>{t.endKicker}</SectionMarker><ScrollFloat>{t.endTitle}</ScrollFloat><a href="/app/?tab=trade&side=buy">{t.endCta}<ArrowUpRight size={19} /></a></div></section>
    </main>
    <footer className="site-footer"><div className="content-width"><ScrollFloat className="footer-statement" scrollStart="top 98%" scrollEnd="top 70%">{t.footerText}</ScrollFloat><OrbitingCirclesGlobe className="footer-orbit" /><div className="footer-grid"><div className="footer-brand"><a className="brand" href="#top"><img src="/assets/firstbell-mark.svg" width="27" height="27" alt="" />FirstBell</a><small>© 2026 FirstBell. {t.footerNote}</small></div><div className="footer-col"><strong>{t.product}</strong><a href="#top">{t.navigation[0]}</a><a href="/app/">{t.navigation[1]}</a><a href="#how-it-works">{t.navigation[2]}</a></div><div className="footer-col"><strong>{t.resources}</strong><a href="https://github.com/ahmardchain/FirstBell#readme" target="_blank" rel="noreferrer">{t.docs} ↗</a><a href="https://docs.bnbchain.org/" target="_blank" rel="noreferrer">{t.bnbDocs} ↗</a><a href={manifest.sourceTokenList} target="_blank" rel="noreferrer">{t.tokenList} ↗</a></div><div className="footer-col"><strong>{t.community}</strong><a href="https://github.com/ahmardchain/FirstBell" target="_blank" rel="noreferrer">{t.github} ↗</a><a href="https://x.com/BNBCHAIN" target="_blank" rel="noreferrer">{t.x} ↗</a><a href="#top">{t.top} ↑</a></div></div></div></footer>
  </>
}
