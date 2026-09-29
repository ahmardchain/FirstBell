import * as React from 'react'
import { FloatingIconsHero, type FloatingIconsHeroProps } from '@/components/ui/floating-icons-hero-section'

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

// Reuse recognizable assets around the composition. Each image is an actual
// BSC Ondo token icon in the bundled official token list.
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

export default function FloatingIconsHeroDemo() {
  return (
    <>
      <header className="absolute left-6 top-6 z-20 flex items-center gap-2.5 text-lg font-semibold tracking-[-.045em] text-foreground md:left-12 md:top-10">
        <img src="/assets/firstbell-mark.svg" width="28" height="28" alt="" />
        FirstBell
      </header>
      <FloatingIconsHero
        title="Your first tokenized equity starts here."
        subtitle="Choose an asset, pay by card, and follow every step until the token arrives in your wallet. No seed phrase setup."
        ctaText="Explore equities"
        ctaHref="#explore"
        icons={icons}
      />
      <section id="explore" className="bg-[#111419] px-6 py-20 md:px-[7vw]" aria-labelledby="explore-title">
        <div className="mx-auto max-w-6xl">
          <h2 id="explore-title" className="text-3xl font-semibold tracking-[-.055em] text-foreground md:text-5xl">A familiar name. A new way in.</h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">A visual preview of Ondo tokenized equities on BNB Smart Chain. Availability and purchase eligibility must be checked before checkout.</p>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ['AAPLon', 'Apple'], ['NVDAon', 'NVIDIA'], ['TSLAon', 'Tesla'],
              ['MSFTon', 'Microsoft'], ['AMZNon', 'Amazon'],
            ].map(([symbol, name]) => (
              <article key={symbol} className="rounded-2xl border border-border bg-card p-6">
                <img src={`/assets/${symbol.toLowerCase()}.png`} width="44" height="44" alt="" />
                <h3 className="mt-5 font-semibold text-foreground">{symbol}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{name} · Ondo tokenized</p>
              </article>
            ))}
          </div>
          <p className="mt-8 text-xs leading-relaxed text-muted-foreground">Concept preview. Card checkout, wallet funding, and token purchase are not connected yet.</p>
        </div>
      </section>
    </>
  )
}
