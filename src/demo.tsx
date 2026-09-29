import * as React from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Clock3, CreditCard, ExternalLink, Fingerprint, Layers3, LockKeyhole, ReceiptText, Wallet2 } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { FloatingIconsHero, type FloatingIconsHeroProps } from '@/components/ui/floating-icons-hero-section'
import { Button } from '@/components/ui/button'
import manifest from '@/asset-sources.json'

const makeTokenIcon = (src: string): React.FC<React.SVGProps<SVGSVGElement>> =>
  function TokenIcon(props) {
    return (
      <svg viewBox="0 0 64 64" role="presentation" {...props}>
        <image href={src} width="64" height="64" />
      </svg>
    )
  }

const Apple = makeTokenIcon('/assets/aaplon.png')
const Nvidia = makeTokenIcon('/assets/nvdaon.png')
const Tesla = makeTokenIcon('/assets/tslaon.png')
const Microsoft = makeTokenIcon('/assets/msfton.png')
const Amazon = makeTokenIcon('/assets/amznon.png')

const icons: FloatingIconsHeroProps['icons'] = [
  { id: 1, icon: Apple, className: 'tile-1' },
  { id: 2, icon: Nvidia, className: 'tile-2' },
  { id: 3, icon: Tesla, className: 'tile-3' },
  { id: 4, icon: Microsoft, className: 'tile-4' },
  { id: 5, icon: Amazon, className: 'tile-5' },
  { id: 6, icon: Apple, className: 'tile-6' },
  { id: 7, icon: Nvidia, className: 'tile-7' },
  { id: 8, icon: Tesla, className: 'tile-8' },
  { id: 9, icon: Microsoft, className: 'tile-9' },
  { id: 10, icon: Amazon, className: 'tile-10' },
  { id: 11, icon: Apple, className: 'tile-11' },
  { id: 12, icon: Nvidia, className: 'tile-12' },
]

const assets = manifest.assets.map((asset) => ({
  ...asset,
  company: asset.name.split(' (Ondo')[0],
}))

type Asset = (typeof assets)[number]

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const reducedMotion = useReducedMotion()
  return (
    <motion.div
      className={className}
      initial={reducedMotion ? false : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function SectionLabel({ index, children }: { index: string; children: React.ReactNode }) {
  return <p className="section-label"><span>{index}</span>{children}</p>
}

function TokenExplorer() {
  const [selected, setSelected] = React.useState<Asset>(assets[0])

  return (
    <section id="assets" className="section-shell assets-section" aria-labelledby="assets-title">
      <div className="section-inner">
        <Reveal className="section-heading-row">
          <div>
            <SectionLabel index="02">THE FIRST CHOICE</SectionLabel>
            <h2 id="assets-title" className="section-title">Start with a name<br />you already know.</h2>
          </div>
          <p className="section-intro">Explore actual Ondo tokenized equities on BNB Smart Chain. Pick one to see the information FirstBell would put in front of you before checkout.</p>
        </Reveal>
        <div className="asset-explorer">
          <div className="asset-list" role="group" aria-label="Tokenized equity examples">
            {assets.map((asset, index) => (
              <button
                key={asset.symbol}
                type="button"
                onClick={() => setSelected(asset)}
                className={`asset-row ${selected.symbol === asset.symbol ? 'is-selected' : ''}`}
                aria-pressed={selected.symbol === asset.symbol}
              >
                <span className="asset-index">0{index + 1}</span>
                <span className="asset-icon"><img src={`/assets/${asset.symbol.toLowerCase()}.png`} width="36" height="36" alt="" /></span>
                <span className="asset-name"><strong>{asset.company}</strong><small>{asset.symbol}</small></span>
                <ArrowUpRight size={17} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="asset-detail" aria-live="polite">
            <div className="detail-topline"><span>ASSET PROFILE</span><span className="detail-dot">BSC · ONDO</span></div>
            <div className="detail-identity">
              <img src={`/assets/${selected.symbol.toLowerCase()}.png`} width="64" height="64" alt="" />
              <div><h3>{selected.company}</h3><p>{selected.symbol} · Ondo tokenized</p></div>
            </div>
            <div className="detail-rule" />
            <dl className="detail-facts">
              <div><dt>Issuer</dt><dd>Ondo Global Markets</dd></div>
              <div><dt>Network</dt><dd>BNB Smart Chain</dd></div>
              <div><dt>Contract</dt><dd><code>{selected.address.slice(0, 6)}…{selected.address.slice(-4)}</code></dd></div>
              <div><dt>Live quote</dt><dd>Shown during checkout</dd></div>
            </dl>
            <a className="detail-link" href={`https://bscscan.com/token/${selected.address}`} target="_blank" rel="noopener noreferrer">
              View token on BscScan <ExternalLink size={15} aria-hidden="true" />
            </a>
            <p className="detail-note">Tokenized equity terms and eligibility depend on the issuer and your location. Review them before purchasing.</p>
          </div>
        </div>
      </div>
    </section>
  )
}

const journey = [
  { icon: CreditCard, number: '01', title: 'Choose & pay', text: 'Pick an eligible tokenized equity and pay with a supported card method.' },
  { icon: Wallet2, number: '02', title: 'Wallet ready', text: 'A wallet is created behind the familiar sign-in flow. No seed phrase setup screen.' },
  { icon: Layers3, number: '03', title: 'Review the trade', text: 'See the funding route, current quote, fees, and expected amount before approval.' },
  { icon: ReceiptText, number: '04', title: 'See the proof', text: 'Follow payment, funding, swap, and delivery as separate steps, then open the chain receipt.' },
]

function Journey() {
  return (
    <section id="how" className="section-shell journey-section" aria-labelledby="how-title">
      <div className="section-inner">
        <Reveal className="journey-header">
          <div>
            <SectionLabel index="01">THE JOURNEY</SectionLabel>
            <h2 id="how-title" className="section-title">A first purchase<br />that makes sense.</h2>
          </div>
          <p className="section-intro">The complexity stays visible where it matters. You know what is happening to your money at every step.</p>
        </Reveal>
        <div className="journey-grid">
          {journey.map(({ icon: Icon, number, title, text }) => (
            <Reveal key={number} className="journey-item">
              <div className="journey-icon"><Icon size={24} strokeWidth={1.6} aria-hidden="true" /></div>
              <span className="journey-number">{number} / 04</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

function ReceiptSection() {
  return (
    <section id="proof" className="section-shell proof-section" aria-labelledby="proof-title">
      <div className="section-inner proof-grid">
        <Reveal className="proof-copy">
          <SectionLabel index="03">THE RECEIPT</SectionLabel>
          <h2 id="proof-title" className="section-title">No disappearing<br />into a spinner.</h2>
          <p>Card authorization, wallet funding, token purchase, and delivery are different events. FirstBell is designed to show each one clearly, including where to look when a step takes longer.</p>
          <div className="proof-points">
            <div><Clock3 size={19} strokeWidth={1.7} aria-hidden="true" /><span>Progress you can follow</span></div>
            <div><Fingerprint size={19} strokeWidth={1.7} aria-hidden="true" /><span>One clear approval before a trade</span></div>
            <div><LockKeyhole size={19} strokeWidth={1.7} aria-hidden="true" /><span>Wallet access without seed phrase setup</span></div>
          </div>
        </Reveal>
        <Reveal className="receipt-wrap">
          <div className="receipt-card">
            <div className="receipt-head"><span className="receipt-mark"><img src="/assets/firstbell-mark.svg" alt="" width="23" height="23" /></span><span>FIRSTBELL / JOURNEY PREVIEW</span></div>
            <div className="receipt-body">
              <div className="receipt-overline">ONE CLEAR PATH</div>
              <h3>From card<br />to wallet.</h3>
              <div className="receipt-progress" aria-label="Illustrative purchase stages">
                <div><span className="progress-node"><CreditCard size={15} /></span><p><strong>Card payment</strong><small>Provider authorization</small></p><span className="stage-index">01</span></div>
                <div><span className="progress-node"><Wallet2 size={15} /></span><p><strong>Wallet funded</strong><small>Funds received on BSC</small></p><span className="stage-index">02</span></div>
                <div><span className="progress-node"><ArrowRight size={15} /></span><p><strong>Swap submitted</strong><small>Quote reviewed and approved</small></p><span className="stage-index">03</span></div>
                <div><span className="progress-node"><Check size={15} /></span><p><strong>Token delivered</strong><small>Balance and transaction link</small></p><span className="stage-index">04</span></div>
              </div>
            </div>
            <div className="receipt-footer"><span>ILLUSTRATIVE FLOW</span><span>NO TRANSACTION PROCESSED</span></div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function TrustSection() {
  return (
    <section className="section-shell trust-section" aria-labelledby="trust-title">
      <div className="section-inner trust-grid">
        <Reveal>
          <SectionLabel index="04">BUILT FOR CLARITY</SectionLabel>
          <h2 id="trust-title" className="section-title">Know what<br />you hold.</h2>
        </Reveal>
        <div className="trust-list">
          <Reveal className="trust-row"><span>01</span><div><h3>The issuer and the rights</h3><p>See who issued the token and read what holding it actually means.</p></div><ArrowUpRight size={18} /></Reveal>
          <Reveal className="trust-row"><span>02</span><div><h3>The market-hours gap</h3><p>Know when the underlying market is closed and its reference price may be stale.</p></div><ArrowUpRight size={18} /></Reveal>
          <Reveal className="trust-row"><span>03</span><div><h3>The full cost</h3><p>Review payment fees, swap quote, and network costs before approval.</p></div><ArrowUpRight size={18} /></Reveal>
        </div>
      </div>
    </section>
  )
}

export default function FirstBellLanding() {
  return (
    <>
      <header className="site-nav">
        <a className="brand" href="#top" aria-label="FirstBell home"><img src="/assets/firstbell-mark.svg" width="30" height="30" alt="" />FirstBell</a>
        <nav aria-label="Main navigation" className="nav-links"><a href="#how">How it works</a><a href="#assets">Equities</a><a href="#proof">The receipt</a></nav>
        <a className="nav-cta" href="#assets">Explore <ArrowUpRight size={15} aria-hidden="true" /></a>
      </header>
      <main id="top">
        <FloatingIconsHero
          title="Your first tokenized equity. From card to wallet."
          subtitle="Designed for a sub-minute purchase by eligible returning buyers. Choose an asset, review the trade, and follow every step. No seed phrase setup."
          ctaText="See how it works"
          ctaHref="#how"
          icons={icons}
          note="Product concept · Card checkout and purchases are not live yet"
          className="landing-hero"
        />
        <a href="#how" className="scroll-cue" aria-label="Scroll to how it works"><ArrowDown size={16} aria-hidden="true" /> SCROLL TO EXPLORE</a>
        <Journey />
        <TokenExplorer />
        <ReceiptSection />
        <TrustSection />
        <section className="closing-section" aria-labelledby="closing-title">
          <div className="section-inner closing-inner">
            <span className="closing-kicker">FIRSTBELL / A CLEARER WAY IN</span>
            <h2 id="closing-title">The first step<br />should feel simple.</h2>
            <Button asChild size="lg" className="rounded-[10px] px-7 font-semibold"><a href="#assets">Explore the assets <ArrowUpRight size={17} className="ml-3" aria-hidden="true" /></a></Button>
            <p>Product concept preview. Purchases are not available on this site yet.</p>
          </div>
        </section>
      </main>
      <footer className="site-footer"><div className="section-inner footer-inner"><a className="brand" href="#top"><img src="/assets/firstbell-mark.svg" width="24" height="24" alt="" />FirstBell</a><p>Tokenized equities, explained at every step.</p><span>© 2026 FirstBell · Concept preview</span></div></footer>
    </>
  )
}
