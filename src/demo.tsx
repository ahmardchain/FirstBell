import * as React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Clock3, CreditCard, ExternalLink, Fingerprint, Globe2, Layers3, LockKeyhole, Menu, Moon, ReceiptText, Sun, Wallet2, X } from 'lucide-react'
import { FloatingIconsHero, type FloatingIconsHeroProps } from '@/components/ui/floating-icons-hero-section'
import { Button } from '@/components/ui/button'
import LogoLoop from '@/components/ui/logo-loop'
import manifest from '@/asset-sources.json'

const makeTokenIcon = (src: string): React.FC<React.SVGProps<SVGSVGElement>> =>
  function TokenIcon(props) {
    return <svg viewBox="0 0 64 64" role="presentation" {...props}><image href={src} width="64" height="64" /></svg>
  }

const icons: FloatingIconsHeroProps['icons'] = [
  { id: 1, icon: makeTokenIcon('/assets/aaplon.png'), className: 'tile-1' },
  { id: 2, icon: makeTokenIcon('/assets/nvdaon.png'), className: 'tile-2' },
  { id: 3, icon: makeTokenIcon('/assets/tslaon.png'), className: 'tile-3' },
  { id: 4, icon: makeTokenIcon('/assets/msfton.png'), className: 'tile-4' },
  { id: 5, icon: makeTokenIcon('/assets/amznon.png'), className: 'tile-5' },
  { id: 6, icon: makeTokenIcon('/assets/aaplon.png'), className: 'tile-6' },
  { id: 7, icon: makeTokenIcon('/assets/nvdaon.png'), className: 'tile-7' },
  { id: 8, icon: makeTokenIcon('/assets/tslaon.png'), className: 'tile-8' },
  { id: 9, icon: makeTokenIcon('/assets/msfton.png'), className: 'tile-9' },
  { id: 10, icon: makeTokenIcon('/assets/amznon.png'), className: 'tile-10' },
  { id: 11, icon: makeTokenIcon('/assets/aaplon.png'), className: 'tile-11' },
  { id: 12, icon: makeTokenIcon('/assets/nvdaon.png'), className: 'tile-12' },
]
const assets = manifest.assets.map(asset => ({ ...asset, company: asset.name.split(' (Ondo')[0] }))
type Asset = (typeof assets)[number]
type Language = 'en' | 'zh'
type Theme = 'dark' | 'light'

const content = {
  en: {
    nav: ['How it works', 'Equities', 'The receipt'], explore: 'Explore assets', language: 'Language', theme: 'Toggle color theme', menu: 'Open navigation',
    eyebrow: 'FIRSTBELL / ON BNB SMART CHAIN', hero: 'Card to tokenized equity in under a minute, no seed phrase in sight.',
    heroSub: 'Choose a tokenized equity, review every step, and follow the delivery on-chain. A simpler path from card to wallet is taking shape.',
    heroCta: 'Buy your first stock on-chain', heroNote: 'Product preview · Card checkout is not live yet', scroll: 'SCROLL TO EXPLORE',
    loop: 'EXPLORE TOKENIZED EQUITIES',
    journeyLabel: 'THE JOURNEY', journeyTitle: <>A first purchase<br />that makes sense.</>, journeyIntro: 'The complexity stays visible where it matters. Know what happens to your money at every step.',
    journey: [
      ['Choose & pay', 'Pick an eligible tokenized equity and pay with a supported card method.'],
      ['Wallet ready', 'A wallet is created behind a familiar sign-in flow. No seed phrase setup screen.'],
      ['Review the trade', 'See the funding route, live quote, fees, and expected amount before approval.'],
      ['See the proof', 'Follow payment, funding, swap, and delivery, then open the chain receipt.'],
    ],
    assetsLabel: 'THE FIRST CHOICE', assetsTitle: <>Start with a name<br />you already know.</>, assetsIntro: 'Explore real Ondo tokenized equity contract listings on BNB Smart Chain. Select an asset to inspect its issuer, network, and contract.',
    assetList: 'Tokenized equity examples', profile: 'ASSET PROFILE', tokenized: 'Ondo tokenized', issuer: 'Issuer', network: 'Network', contract: 'Contract', quote: 'Live quote', quoteValue: 'Available at checkout',
    amount: 'I want to spend', preview: 'Preview purchase', onScan: 'View contract on BscScan', eligibility: 'Availability and token holder rights depend on the issuer and your location. Read the terms before any purchase.',
    proofLabel: 'THE RECEIPT', proofTitle: <>No disappearing<br />into a spinner.</>, proofIntro: 'Card authorization, wallet funding, token purchase, and delivery are separate events. FirstBell is designed to show each one clearly.',
    proofPoints: ['Progress you can follow', 'One clear approval before a trade', 'Wallet access without seed phrase setup'], receipt: 'FIRSTBELL / JOURNEY PREVIEW', receiptLabel: 'ONE CLEAR PATH', receiptTitle: <>From card<br />to wallet.</>,
    stages: [['Card payment', 'Provider authorization'], ['Wallet funded', 'Funds received on BSC'], ['Swap submitted', 'Quote reviewed and approved'], ['Token delivered', 'Balance and transaction link']],
    illustrative: 'ILLUSTRATIVE FLOW', noTransaction: 'NO TRANSACTION PROCESSED',
    trustLabel: 'BUILT FOR CLARITY', trustTitle: <>Know what<br />you hold.</>, trust: [
      ['The issuer and the rights', 'See who issued the token and read what holding it means.'],
      ['The market-hours gap', 'Know when the underlying market is closed and its reference price may be stale.'],
      ['The full cost', 'Review payment fees, swap quote, and network costs before approval.'],
    ],
    closingKicker: 'FIRSTBELL / A CLEARER WAY IN', closing: <>The first step<br />should feel simple.</>, closingCta: 'Explore the assets',
    footerText: 'Tokenized equities, explained at every step.', footerPreview: 'Product preview · No purchases processed', product: 'Product', resources: 'Resources', social: 'Community', docs: 'Documentation', source: 'GitHub source', bnbDocs: 'BNB Chain docs', xOfficial: 'BNB Chain on X', tokenList: 'Token source', backTop: 'Back to top',
    modalTitle: 'Purchase preview', modalSub: 'You selected', review: 'Your selection', youPay: 'You would pay', youReceive: 'You would receive', unavailable: 'A live quote will appear when checkout is connected.',
    modalExplanation: 'Card payment and wallet creation are still being integrated. This preview does not collect payment details or place an order.', modalClose: 'Continue exploring', modalContract: 'Check token contract', close: 'Close dialog',
  },
  zh: {
    nav: ['运作方式', '代币化股票', '交易凭证'], explore: '探索资产', language: '语言', theme: '切换明暗主题', menu: '打开导航',
    eyebrow: 'FIRSTBELL / 基于 BNB 智能链', hero: '一分钟内，从银行卡到代币化股票，无需助记词。',
    heroSub: '选择代币化股票，查看每一步，并在链上追踪到账过程。从银行卡到钱包，一条更简单的路径正在成形。',
    heroCta: '探索你的第一只链上股票', heroNote: '产品预览 · 银行卡结算尚未上线', scroll: '向下探索',
    loop: '探索代币化股票',
    journeyLabel: '购买流程', journeyTitle: <>第一次购买，<br />也能简单明了。</>, journeyIntro: '在关键时刻展示必要的信息。每一步都能了解资金的去向。',
    journey: [
      ['选择并支付', '选择符合条件的代币化股票，通过支持的银行卡方式付款。'],
      ['钱包就绪', '通过熟悉的登录流程创建钱包，无需设置助记词。'],
      ['确认交易', '批准前查看资金路径、实时报价、费用和预计到账数量。'],
      ['查看凭证', '分别跟踪支付、入金、兑换和交付，并打开链上交易记录。'],
    ],
    assetsLabel: '第一步', assetsTitle: <>从你熟悉的<br />公司开始。</>, assetsIntro: '探索 BNB 智能链上的真实 Ondo 代币化股票合约。选择资产，查看发行方、网络及合约信息。',
    assetList: '代币化股票示例', profile: '资产资料', tokenized: 'Ondo 代币化', issuer: '发行方', network: '网络', contract: '合约', quote: '实时报价', quoteValue: '结算时显示',
    amount: '计划支付', preview: '预览购买', onScan: '在 BscScan 查看合约', eligibility: '可用地区和持有人权益取决于发行方及所在地。购买前请阅读条款。',
    proofLabel: '交易凭证', proofTitle: <>不再盯着<br />无尽的加载动画。</>, proofIntro: '银行卡授权、钱包入金、代币购买和交付是不同的事件。FirstBell 旨在清楚显示每一步。',
    proofPoints: ['进度清晰可见', '交易前明确确认', '无需设置助记词即可使用钱包'], receipt: 'FIRSTBELL / 流程预览', receiptLabel: '清晰的路径', receiptTitle: <>从银行卡<br />到钱包。</>,
    stages: [['银行卡支付', '支付服务商授权'], ['钱包入金', '资金到达 BSC'], ['提交兑换', '确认报价并批准'], ['代币到账', '余额及交易链接']],
    illustrative: '示意流程', noTransaction: '未处理任何交易',
    trustLabel: '信息透明', trustTitle: <>清楚了解<br />你持有的资产。</>, trust: [
      ['发行方与权益', '查看代币的发行方，了解持有它意味着什么。'],
      ['市场休市时段', '了解基础市场何时关闭，以及参考价格何时可能滞后。'],
      ['完整成本', '批准前查看支付费用、兑换报价及网络费用。'],
    ],
    closingKicker: 'FIRSTBELL / 更清晰的起点', closing: <>第一步，<br />应该更简单。</>, closingCta: '探索资产',
    footerText: '每一步都清楚解释代币化股票。', footerPreview: '产品预览 · 尚未处理购买', product: '产品', resources: '资源', social: '社区', docs: '项目文档', source: 'GitHub 源码', bnbDocs: 'BNB Chain 文档', xOfficial: 'BNB Chain 的 X', tokenList: '代币来源', backTop: '返回顶部',
    modalTitle: '购买预览', modalSub: '你选择了', review: '你的选择', youPay: '计划支付', youReceive: '预计收到', unavailable: '接入结算后将显示实时报价。',
    modalExplanation: '银行卡支付和钱包创建仍在集成中。此预览不会收集支付信息或提交订单。', modalClose: '继续探索', modalContract: '查看代币合约', close: '关闭对话框',
  },
} as const

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  return <motion.div className={className} initial={reduced ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .15 }} transition={{ duration: .6, ease: [0.22, 1, 0.36, 1] }}>{children}</motion.div>
}
function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) { return <p className="section-label"><span>{index}</span>{children}</p> }

export default function FirstBellLanding() {
  const [language, setLanguage] = React.useState<Language>(() => localStorage.getItem('firstbell-language') === 'zh' ? 'zh' : 'en')
  const [theme, setTheme] = React.useState<Theme>(() => localStorage.getItem('firstbell-theme') === 'light' ? 'light' : 'dark')
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [languageOpen, setLanguageOpen] = React.useState(false)
  const [active, setActive] = React.useState('top')
  const [selected, setSelected] = React.useState<Asset>(assets[0])
  const [amount, setAmount] = React.useState('100')
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const t = content[language]

  React.useEffect(() => { document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'; localStorage.setItem('firstbell-language', language) }, [language])
  React.useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('firstbell-theme', theme) }, [theme])
  React.useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id) })
    }, { rootMargin: '-25% 0px -65% 0px' })
    document.querySelectorAll('#top, #how, #assets, #proof').forEach(node => observer.observe(node))
    return () => observer.disconnect()
  }, [])
  React.useEffect(() => {
    if (!previewOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreviewOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [previewOpen])

  const navItems = [{ id: 'how', text: t.nav[0] }, { id: 'assets', text: t.nav[1] }, { id: 'proof', text: t.nav[2] }]
  const tokenLogos = assets.map(asset => ({ node: <span className="loop-token"><img src={`/assets/${asset.symbol.toLowerCase()}.png`} alt="" /><b>{asset.symbol}</b></span>, href: `https://bscscan.com/token/${asset.address}`, ariaLabel: `${asset.company} ${asset.symbol} on BscScan` }))
  const displayAmount = Number(amount) > 0 ? new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: 'USD' }).format(Number(amount)) : '—'

  return <>
    <header className="site-nav">
      <a className="brand" href="#top" aria-label="FirstBell home" onClick={() => setMenuOpen(false)}><img src="/assets/firstbell-mark.svg" width="29" height="29" alt="" />FirstBell<span className="brand-period">.</span></a>
      <nav aria-label="Main navigation" className={`nav-links ${menuOpen ? 'nav-open' : ''}`}>
        {navItems.map(item => <a key={item.id} className={active === item.id ? 'active' : ''} href={`#${item.id}`} onClick={() => setMenuOpen(false)}>{item.text}</a>)}
        <a className="mobile-nav-link" href="https://github.com/ahmardchain/FirstBell#readme" target="_blank" rel="noreferrer">{t.docs} ↗</a>
      </nav>
      <div className="nav-actions">
        <div className="language-control">
          <button className="control-button language-trigger" type="button" aria-expanded={languageOpen} aria-label={t.language} onClick={() => setLanguageOpen(open => !open)}><Globe2 size={15} /><span>{language === 'en' ? 'EN' : '中文'}</span><ChevronDown size={12} /></button>
          <AnimatePresence>{languageOpen && <motion.div className="language-menu" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}><button type="button" aria-pressed={language === 'en'} onClick={() => { setLanguage('en'); setLanguageOpen(false) }}>English {language === 'en' && <Check size={13} />}</button><button type="button" aria-pressed={language === 'zh'} onClick={() => { setLanguage('zh'); setLanguageOpen(false) }}>中文 {language === 'zh' && <Check size={13} />}</button></motion.div>}</AnimatePresence>
        </div>
        <button className="control-button theme-trigger" type="button" aria-label={t.theme} onClick={() => setTheme(value => value === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
        <a className="nav-cta" href="#assets" onClick={() => setMenuOpen(false)}>{t.explore}<ArrowUpRight size={15} /></a>
        <button className="control-button mobile-menu-button" type="button" aria-label={t.menu} aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>{menuOpen ? <X size={19} /> : <Menu size={19} />}</button>
      </div>
    </header>
    <main id="top">
      <div className="hero-wrap">
        <FloatingIconsHero title={t.hero} subtitle={t.heroSub} ctaText={t.heroCta} ctaHref="#assets" icons={icons} note={t.heroNote} className="landing-hero" />
        <span className="hero-eyebrow">{t.eyebrow}</span>
        <a href="#how" className="scroll-cue"><ArrowDown size={16} /> {t.scroll}</a>
        <span className="hero-coordinate" aria-hidden="true">01 / 04 — BSC</span>
      </div>
      <section className="logo-ribbon" aria-label={t.loop}><div className="ribbon-label">{t.loop}</div><LogoLoop logos={tokenLogos} speed={40} gap={72} logoHeight={42} pauseOnHover ariaLabel={t.loop} /></section>
      <section id="how" className="section-shell journey-section" aria-labelledby="how-title"><div className="section-inner">
        <Reveal className="section-heading-row"><div><SectionLabel index="01">{t.journeyLabel}</SectionLabel><h2 id="how-title" className="section-title">{t.journeyTitle}</h2></div><p className="section-intro">{t.journeyIntro}</p></Reveal>
        <div className="journey-grid">{[CreditCard, Wallet2, Layers3, ReceiptText].map((Icon, i) => <Reveal key={i} className="journey-item"><div className="journey-icon"><Icon size={23} strokeWidth={1.6} /></div><span className="journey-number">0{i + 1} / 04</span><h3>{t.journey[i][0]}</h3><p>{t.journey[i][1]}</p></Reveal>)}</div>
      </div></section>
      <section id="assets" className="section-shell assets-section" aria-labelledby="assets-title"><div className="section-inner">
        <Reveal className="section-heading-row"><div><SectionLabel index="02">{t.assetsLabel}</SectionLabel><h2 id="assets-title" className="section-title">{t.assetsTitle}</h2></div><p className="section-intro">{t.assetsIntro}</p></Reveal>
        <div className="asset-explorer"><div className="asset-list" role="group" aria-label={t.assetList}>{assets.map((asset, i) => <button key={asset.symbol} type="button" className={`asset-row ${selected.symbol === asset.symbol ? 'is-selected' : ''}`} aria-pressed={selected.symbol === asset.symbol} onClick={() => setSelected(asset)}><span className="asset-index">0{i + 1}</span><img className="asset-row-icon" src={`/assets/${asset.symbol.toLowerCase()}.png`} alt="" /><span className="asset-name"><strong>{asset.company}</strong><small>{asset.symbol}</small></span><ArrowUpRight size={18} /></button>)}</div>
          <motion.div className="asset-detail" layout><div className="detail-topline"><span>{t.profile}</span><span className="network-pill"><span /> BSC · ONDO</span></div>
            <AnimatePresence mode="wait"><motion.div key={selected.symbol} className="detail-content" initial={{ opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .22 }}><div className="detail-identity"><img src={`/assets/${selected.symbol.toLowerCase()}.png`} alt="" /><div><h3>{selected.company}</h3><p>{selected.symbol} · {t.tokenized}</p></div></div><dl className="detail-facts"><div><dt>{t.issuer}</dt><dd>Ondo Global Markets</dd></div><div><dt>{t.network}</dt><dd>BNB Smart Chain</dd></div><div><dt>{t.contract}</dt><dd><code>{selected.address.slice(0, 6)}…{selected.address.slice(-4)}</code></dd></div><div><dt>{t.quote}</dt><dd>{t.quoteValue}</dd></div></dl></motion.div></AnimatePresence>
            <label className="amount-label" htmlFor="amount">{t.amount} <span>USD</span></label><div className="amount-field"><span>$</span><input id="amount" type="number" min="1" step="any" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /><span>USD</span></div>
            <Button type="button" disabled={!Number.isFinite(Number(amount)) || Number(amount) <= 0} className="preview-button" onClick={() => setPreviewOpen(true)}>{t.preview}<ArrowRight size={17} /></Button>
            <a className="detail-link" href={`https://bscscan.com/token/${selected.address}`} target="_blank" rel="noreferrer">{t.onScan}<ExternalLink size={15} /></a><p className="detail-note">{t.eligibility}</p>
          </motion.div></div>
      </div></section>
      <section id="proof" className="section-shell proof-section" aria-labelledby="proof-title"><div className="section-inner proof-grid"><Reveal className="proof-copy"><SectionLabel index="03">{t.proofLabel}</SectionLabel><h2 id="proof-title" className="section-title">{t.proofTitle}</h2><p>{t.proofIntro}</p><div className="proof-points">{[Clock3, Fingerprint, LockKeyhole].map((Icon, i) => <div key={i}><Icon size={19} strokeWidth={1.7} /><span>{t.proofPoints[i]}</span></div>)}</div></Reveal><Reveal className="receipt-wrap"><div className="receipt-card"><div className="receipt-head"><span className="receipt-mark"><img src="/assets/firstbell-mark.svg" width="22" height="22" alt="" /></span><span>{t.receipt}</span></div><div className="receipt-body"><div className="receipt-overline">{t.receiptLabel}</div><h3>{t.receiptTitle}</h3><div className="receipt-progress">{[CreditCard, Wallet2, ArrowRight, Check].map((Icon, i) => <div key={i}><span className="progress-node"><Icon size={15} /></span><p><strong>{t.stages[i][0]}</strong><small>{t.stages[i][1]}</small></p><span className="stage-index">0{i + 1}</span></div>)}</div></div><div className="receipt-footer"><span>{t.illustrative}</span><span>{t.noTransaction}</span></div></div></Reveal></div></section>
      <section className="section-shell trust-section"><div className="section-inner trust-grid"><Reveal><SectionLabel index="04">{t.trustLabel}</SectionLabel><h2 className="section-title">{t.trustTitle}</h2></Reveal><div className="trust-list">{t.trust.map(([title, description], i) => <Reveal key={i} className="trust-row"><span>0{i + 1}</span><div><h3>{title}</h3><p>{description}</p></div><ArrowUpRight size={18} /></Reveal>)}</div></div></section>
      <section className="closing-section"><div className="section-inner closing-inner"><span className="closing-kicker">{t.closingKicker}</span><h2>{t.closing}</h2><Button asChild size="lg"><a href="#assets">{t.closingCta}<ArrowUpRight size={17} /></a></Button><p>{t.footerPreview}</p></div></section>
    </main>
    <footer className="site-footer"><div className="section-inner footer-grid"><div className="footer-brand"><a className="brand" href="#top"><img src="/assets/firstbell-mark.svg" width="28" height="28" alt="" />FirstBell<span className="brand-period">.</span></a><p>{t.footerText}</p><span>© 2026 FirstBell · {t.footerPreview}</span></div><div className="footer-column"><strong>{t.product}</strong><a href="#how">{t.nav[0]}</a><a href="#assets">{t.nav[1]}</a><a href="#proof">{t.nav[2]}</a></div><div className="footer-column"><strong>{t.resources}</strong><a href="https://github.com/ahmardchain/FirstBell#readme" target="_blank" rel="noreferrer">{t.docs} ↗</a><a href="https://docs.bnbchain.org/" target="_blank" rel="noreferrer">{t.bnbDocs} ↗</a><a href={manifest.sourceTokenList} target="_blank" rel="noreferrer">{t.tokenList} ↗</a></div><div className="footer-column"><strong>{t.social}</strong><a href="https://github.com/ahmardchain/FirstBell" target="_blank" rel="noreferrer"><span className="github-glyph">GH</span> {t.source} ↗</a><a href="https://x.com/BNBCHAIN" target="_blank" rel="noreferrer"><X size={16} /> {t.xOfficial} ↗</a><a href="#top">{t.backTop} ↑</a></div></div></footer>
    <AnimatePresence>{previewOpen && <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) setPreviewOpen(false) }}><motion.div role="dialog" aria-modal="true" aria-labelledby="modal-title" className="preview-modal" initial={{ opacity: 0, y: 28, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: .98 }} transition={{ duration: .25 }}><button className="modal-x" type="button" aria-label={t.close} onClick={() => setPreviewOpen(false)}><X size={19} /></button><span className="modal-kicker">FIRSTBELL / {t.modalTitle}</span><h2 id="modal-title">{t.modalTitle}</h2><p>{t.modalSub} <strong>{selected.company} · {selected.symbol}</strong></p><div className="modal-selection"><img src={`/assets/${selected.symbol.toLowerCase()}.png`} alt="" /><span>{selected.company}<small>{selected.symbol} · BNB Smart Chain</small></span></div><dl className="modal-facts"><div><dt>{t.youPay}</dt><dd>{displayAmount}</dd></div><div><dt>{t.youReceive}</dt><dd>—</dd></div></dl><p className="modal-unavailable">{t.unavailable}</p><p className="modal-explanation">{t.modalExplanation}</p><a href={`https://bscscan.com/token/${selected.address}`} target="_blank" rel="noreferrer" className="modal-contract">{t.modalContract}<ExternalLink size={15} /></a><button type="button" className="modal-done" onClick={() => setPreviewOpen(false)}>{t.modalClose}<ArrowRight size={16} /></button></motion.div></motion.div>}</AnimatePresence>
  </>
}
