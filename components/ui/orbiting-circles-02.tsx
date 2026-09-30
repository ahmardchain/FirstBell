"use client";

import * as React from 'react'
import { cn } from '@/lib/utils'
import ParticleSphereAnimation from '@/components/ui/orbiting-circles-02-utils/particalsphear'
import './orbiting-circles-02.css'

// Adapted from the Orbiting Circles 02 snippet supplied by the user.
// Local transparent company marks replace the technology logos. Each appears once.
const orbits = [
  {
    duration: 18,
    icons: [
      { mark: 'apple', symbol: 'AAPLon', angle: -60 },
      { mark: 'google', symbol: 'GOOGLx', angle: -20 },
      { mark: 'meta', symbol: 'METAx', angle: 20 },
      { mark: 'netflix', symbol: 'NFLXx', angle: 60 },
    ],
  },
  {
    duration: 24,
    icons: [
      { mark: 'nvidia', symbol: 'NVDAon', angle: -55 },
      { mark: 'coinbase', symbol: 'COINx', angle: -20 },
      { mark: 'intel', symbol: 'INTCx', angle: 20 },
      { mark: 'microsoft', symbol: 'MSFTon', angle: 55 },
    ],
  },
  {
    duration: 30,
    icons: [
      { mark: 'tesla', symbol: 'TSLAon', angle: -30 },
      { mark: 'amazon', symbol: 'AMZNon', angle: -15 },
      { mark: 'uber', symbol: 'UBERx', angle: 0 },
      { mark: 'cocacola', symbol: 'KO_x', angle: 15 },
      { mark: 'robinhood', symbol: 'HOODx', angle: 30 },
    ],
  },
] as const

export default function OrbitingCirclesGlobe({ className }: { className?: string }) {
  return (
    <div
      className={cn('orbit-globe', className)}
      aria-hidden="true"
    >
      <div className="orbit-globe-sphere">
        <ParticleSphereAnimation />
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
