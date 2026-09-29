import * as React from 'react'
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion'
import { cn } from '@/lib/utils'

interface IconProps {
  id: number
  icon: React.FC<React.SVGProps<SVGSVGElement>>
  className: string
}

export interface FloatingIconsHeroProps extends React.HTMLAttributes<HTMLElement> {
  title: string
  subtitle: string
  ctaText: string
  ctaHref: string
  icons: IconProps[]
  note?: string
}

function FloatingIcon({
  pointer,
  iconData,
  index,
}: {
  pointer: React.RefObject<{ x: number; y: number }>
  iconData: IconProps
  index: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const springX = useSpring(x, { stiffness: 300, damping: 20 })
  const springY = useSpring(y, { stiffness: 300, damping: 20 })
  const reducedMotion = useReducedMotion()

  React.useEffect(() => {
    if (reducedMotion) return
    const handlePointerMove = () => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      const dx = pointer.current.x - (rect.left + rect.width / 2)
      const dy = pointer.current.y - (rect.top + rect.height / 2)
      const distance = Math.hypot(dx, dy)
      if (distance > 0 && distance < 150) {
        const force = (1 - distance / 150) * 50
        x.set((-dx / distance) * force)
        y.set((-dy / distance) * force)
      } else {
        x.set(0)
        y.set(0)
      }
    }
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    return () => window.removeEventListener('pointermove', handlePointerMove)
  }, [pointer, reducedMotion, x, y])

  return (
    <motion.div
      ref={ref}
      style={reducedMotion ? undefined : { x: springX, y: springY }}
      initial={reducedMotion ? false : { opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.055, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={cn('absolute', iconData.className)}
      aria-hidden="true"
    >
      <motion.div
        className="floating-icon-tile"
        animate={reducedMotion ? undefined : { y: [0, -7, 0, 7, 0], x: [0, 5, 0, -5, 0], rotate: [0, 4, 0, -4, 0] }}
        transition={{ duration: 6 + (index % 4) * 0.85, repeat: Infinity, ease: 'easeInOut' }}
      >
        <iconData.icon className="floating-icon-mark" />
      </motion.div>
    </motion.div>
  )
}

const FloatingIconsHero = React.forwardRef<HTMLElement, FloatingIconsHeroProps>(
  ({ className, title, subtitle, ctaText, ctaHref, icons, note, onPointerMove, onPointerLeave, ...props }, ref) => {
    const pointer = React.useRef({ x: -1000, y: -1000 })

    return (
      <section
        ref={ref}
        onPointerMove={(event) => {
          pointer.current = { x: event.clientX, y: event.clientY }
          onPointerMove?.(event)
        }}
        onPointerLeave={(event) => {
          pointer.current = { x: -1000, y: -1000 }
          onPointerLeave?.(event)
        }}
        className={cn('relative isolate flex min-h-[720px] w-full items-center justify-center overflow-hidden bg-background px-5 py-28 md:min-h-[800px] md:h-svh', className)}
        {...props}
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {icons.map((iconData, index) => (
            <FloatingIcon key={iconData.id} pointer={pointer} iconData={iconData} index={index} />
          ))}
        </div>
        <div className="relative z-10 mx-auto max-w-[790px] text-center">
          <h1 className="text-balance text-[clamp(3rem,9vw,6.6rem)] font-semibold leading-[.98] tracking-[-.075em] text-foreground">{title}</h1>
          <p className="mx-auto mt-7 max-w-[510px] text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">{subtitle}</p>
          <div className="mt-9">
            <a className="hero-cta" href={ctaHref}>{ctaText}<span aria-hidden="true">↗</span></a>
          </div>
          {note && <p className="mx-auto mt-5 text-xs text-muted-foreground">{note}</p>}
        </div>
      </section>
    )
  },
)
FloatingIconsHero.displayName = 'FloatingIconsHero'

export { FloatingIconsHero }
