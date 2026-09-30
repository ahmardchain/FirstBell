"use client";

import * as React from 'react'
import { useInView, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import ParticleSphereAnimation from '@/components/ui/orbiting-circles-02-utils/particalsphear'
import './orbiting-circles-02.css'

// Adapted from the Orbiting Circles 02 snippet supplied by the user.
// Local transparent company marks replace the technology logos. Each appears once.
const orbits = [
  {
    duration: 18,
    icons: [
      { mark: 'google', symbol: 'GOOGLx', angle: -60 },
      { mark: 'meta', symbol: 'METAx', angle: 0 },
      { mark: 'netflix', symbol: 'NFLXx', angle: 60 },
    ],
  },
  {
    duration: 24,
    icons: [
      { mark: 'coinbase', symbol: 'COINx', angle: -45 },
      { mark: 'intel', symbol: 'INTCx', angle: 45 },
    ],
  },
  {
    duration: 30,
    icons: [
      { mark: 'uber', symbol: 'UBERx', angle: -36 },
      { mark: 'cocacola', symbol: 'KO_x', angle: 0 },
      { mark: 'robinhood', symbol: 'HOODx', angle: 36 },
    ],
  },
] as const

export default function OrbitingCirclesGlobe({ className }: { className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { margin: '100px' })
  const reducedMotion = useReducedMotion()

  return (
    <div
      ref={ref}
      className={cn('orbit-globe', className)}
      data-running={inView && !reducedMotion}
      aria-hidden="true"
    >
      <div className="orbit-globe-sphere">
        <ParticleSphereAnimation running={inView && !reducedMotion} />
      </div>

      {orbits.map((orbit, index) => (
        <div key={index} className={`orbit-globe-ring orbit-globe-ring-${index + 1}`}>
          {orbit.icons.map(icon => (
            <div
              key={icon.symbol}
              className={`orbit-globe-arm ${index % 2 === 0 ? 'orbit-globe-cw' : 'orbit-globe-ccw'}`}
              style={{
                '--start-angle': `${icon.angle}deg`,
                '--counter-angle': `${-icon.angle}deg`,
                '--orbit-duration': `${orbit.duration}s`,
              } as React.CSSProperties}
            >
              <div className="orbit-globe-logo">
                <img
                  src={`/assets/marks/${icon.mark}.svg`}
                  alt=""
                  width={32}
                  height={32}
                  loading="lazy"
                  decoding="async"
                  data-symbol={icon.symbol}
                  className={`brand-mark brand-mark--${icon.mark}`}
                />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
