// Adapted from React Bits Scroll Float. See third_party/REACT_BITS_LICENSE.md.
import * as React from 'react'
import { useReducedMotion } from 'framer-motion'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

interface ScrollFloatProps {
  children: string
  id?: string
  className?: string
  scrollStart?: string
  scrollEnd?: string
}

function splitLine(line: string, lineIndex: number) {
  // Keep English words intact on narrow screens; let Chinese wrap by character.
  const segments = /[\u3400-\u9fff]/u.test(line) ? Array.from(line) : line.split(/(\s+)/u)

  return (
    <span className="scroll-float-line" key={lineIndex}>
      {segments.map((segment, segmentIndex) =>
        /^\s+$/u.test(segment) ? (
          <React.Fragment key={segmentIndex}>{segment}</React.Fragment>
        ) : (
          <span className="scroll-float-word" key={segmentIndex}>
            {Array.from(segment).map((character, characterIndex) => (
              <span className="scroll-float-char" key={characterIndex} data-scroll-float-char>
                {character}
              </span>
            ))}
          </span>
        ),
      )}
    </span>
  )
}

export default function ScrollFloat({
  children,
  id,
  className = '',
  scrollStart = 'top 92%',
  scrollEnd = 'top 55%',
}: ScrollFloatProps) {
  const headingRef = React.useRef<HTMLHeadingElement>(null)
  const reducedMotion = useReducedMotion()
  const lines = React.useMemo(() => children.split('\n').map(splitLine), [children])

  React.useEffect(() => {
    const heading = headingRef.current
    if (!heading) return
    const characters = heading.querySelectorAll<HTMLElement>('[data-scroll-float-char]')
    if (reducedMotion || characters.length === 0) return

    const animation = gsap.fromTo(
      characters,
      { opacity: 0, yPercent: 120, scaleY: 2.3, scaleX: 0.7, transformOrigin: '50% 0%' },
      {
        opacity: 1,
        yPercent: 0,
        scaleY: 1,
        scaleX: 1,
        duration: 1,
        ease: 'back.inOut(2)',
        stagger: 0.015,
        scrollTrigger: { trigger: heading, start: scrollStart, end: scrollEnd, scrub: true },
      },
    )

    return () => {
      animation.scrollTrigger?.kill()
      animation.kill()
      gsap.set(characters, { clearProps: 'all' })
    }
  }, [children, reducedMotion, scrollStart, scrollEnd])

  return (
    <h2 ref={headingRef} id={id} className={`scroll-float ${className}`} aria-label={children.replaceAll('\n', ' ')}>
      <span className="scroll-float-text" aria-hidden="true">{lines}</span>
    </h2>
  )
}
