import * as React from 'react'
import { isOnramperDemoUrl } from '../lib/onramper-demo.ts'

export class OnramperDemoError extends Error {}

export async function requestOnramperDemoWidget(theme: 'light' | 'dark', signal: AbortSignal, fetcher = fetch): Promise<string> {
  const response = await fetcher(`/api/onramper/demo-widget?theme=${theme}`, { cache: 'no-store', signal })
  const result = await response.json() as { error?: string; demo?: boolean; mode?: string; widgetUrl?: string }
  if (!response.ok) throw new OnramperDemoError(result.error === 'demo_not_configured' ? result.error : 'provider_unavailable')
  if (result.demo !== true || result.mode !== 'sandbox' || !isOnramperDemoUrl(result.widgetUrl ?? ''))
    throw new OnramperDemoError('provider_unavailable')
  return result.widgetUrl!
}

export function useOnramperDemo(enabled: boolean) {
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const pending = React.useRef<AbortController | null>(null)
  const active = React.useRef(enabled)
  active.current = enabled
  React.useEffect(() => {
    if (!enabled) { setBusy(false); setError(null) }
    return () => { pending.current?.abort(); pending.current = null }
  }, [enabled])

  const checkout = async () => {
    if (!active.current || pending.current) return
    const controller = new AbortController()
    pending.current = controller
    const timeout = AbortSignal.timeout(10_000)
    setBusy(true); setError(null)
    try {
      const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
      const url = await requestOnramperDemoWidget(theme, AbortSignal.any([controller.signal, timeout]))
      if (!controller.signal.aborted && active.current) window.location.assign(url)
    } catch (reason) {
      if (!controller.signal.aborted && active.current) setError(timeout.aborted ? 'checkout_timeout'
        : reason instanceof OnramperDemoError ? reason.message : 'provider_unavailable')
    } finally {
      if (pending.current === controller) { pending.current = null; if (active.current) setBusy(false) }
    }
  }
  return { busy, error, checkout }
}
