"use client";

import * as React from 'react'

// The supplied snippet references this utility without including its source.
// This local canvas implementation needs no WebGL or additional dependencies.
const points = Array.from({ length: 1100 }, (_, index) => {
  const y = 1 - (index / 1099) * 2
  const radius = Math.sqrt(1 - y * y)
  const angle = index * Math.PI * (3 - Math.sqrt(5))
  return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius }
})

export default function ParticleSphereAnimation({ running = true }: { running?: boolean }) {
  const ref = React.useRef<HTMLCanvasElement>(null)

  React.useEffect(() => {
    const canvas = ref.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    let frame = 0
    let lastFrame = 0
    let size = 0
    let angle = 0.35
    let color = getComputedStyle(canvas).color

    function draw() {
      if (!context || !canvas || size === 0) return
      context.clearRect(0, 0, size, size)
      context.fillStyle = color
      const sin = Math.sin(angle)
      const cos = Math.cos(angle)
      const radius = size * 0.47

      for (const point of points) {
        const x = point.x * cos - point.z * sin
        const z = point.x * sin + point.z * cos
        const depth = (z + 1) / 2
        context.globalAlpha = 0.12 + depth * 0.58
        context.beginPath()
        context.arc(size / 2 + x * radius, size / 2 + point.y * radius, 0.6 + depth * 0.65, 0, Math.PI * 2)
        context.fill()
      }
      context.globalAlpha = 1
    }

    function resize() {
      if (!canvas || !context) return
      size = canvas.getBoundingClientRect().width
      const scale = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(size * scale)
      canvas.height = Math.round(size * scale)
      context.setTransform(scale, 0, 0, scale, 0, 0)
      draw()
    }

    function animate(time: number) {
      if (time - lastFrame >= 32) {
        // Cap elapsed time when a browser restores a background tab.
        angle += Math.min(time - (lastFrame || time), 64) * 0.00012
        lastFrame = time
        draw()
      }
      frame = requestAnimationFrame(animate)
    }

    function resume() {
      cancelAnimationFrame(frame)
      lastFrame = 0
      if (running && !document.hidden) frame = requestAnimationFrame(animate)
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    const themeObserver = new MutationObserver(() => {
      color = getComputedStyle(canvas).color
      draw()
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    document.addEventListener('visibilitychange', resume)
    resize()
    resume()

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      document.removeEventListener('visibilitychange', resume)
    }
  }, [running])

  return <canvas ref={ref} aria-hidden="true" />
}
