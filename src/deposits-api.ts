import * as React from 'react'
import { getIdentityToken, useUser } from '@privy-io/react-auth'
import { checkoutAsset, sessionAsset, type DepositConfig, type DepositSession, isDepositTerminal } from '../lib/funding'

type GetAccessToken = () => Promise<string | null>
type DepositResponse = { session: DepositSession; checkoutUrl?: string }

export class DepositRequestError extends Error {}

async function request<T>(path: string, getAccessToken: GetAccessToken, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken()
  if (!token) throw new DepositRequestError('unauthorized')
  const response = await fetch(path, {
    ...init, cache: 'no-store',
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  })
  const result = await response.json() as { error?: unknown }
  if (!response.ok) throw new DepositRequestError(typeof result?.error === 'string' ? result.error : 'provider_unavailable')
  return result as T
}

export function useDeposits(address: string | undefined, getAccessToken: GetAccessToken) {
  const { refreshUser } = useUser()
  const [config, setConfig] = React.useState<DepositConfig | null>(null)
  const [sessions, setSessions] = React.useState<DepositSession[]>([])
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [checking, setChecking] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [reloadKey, setReloadKey] = React.useState(0)
  const [selectedId, setSelectedId] = React.useState<string | null>(() => new URLSearchParams(window.location.search).get('deposit'))
  const activeAddress = React.useRef(address)
  activeAddress.current = address

  React.useEffect(() => {
    setConfig(null); setSessions([]); setError(null); setChecking(false); setBusy(false)
    if (!address) { setLoading(false); return }
    let active = true
    const abort = new AbortController()
    setLoading(true)
    void Promise.allSettled([
      request<DepositConfig>('/api/deposits/config', getAccessToken, { signal: abort.signal }),
      request<{ sessions: DepositSession[] }>('/api/deposits', getAccessToken, { signal: abort.signal }),
    ]).then(([configuration, history]) => {
      if (!active) return
      if (configuration.status === 'fulfilled') setConfig(configuration.value)
      else setConfig({ ready: false, mode: null, fiatCurrencies: [], reason: configuration.reason instanceof DepositRequestError ? configuration.reason.message : 'provider_unavailable' })
      if (history.status === 'fulfilled') setSessions(history.value.sessions.filter(session => session.walletAddress.toLowerCase() === address.toLowerCase()))
      else setError(history.reason instanceof DepositRequestError ? history.reason.message : 'provider_unavailable')
      setLoading(false)
    })
    return () => { active = false; abort.abort() }
  }, [address, getAccessToken, reloadKey])

  const refresh = React.useCallback(async (id: string, signal?: AbortSignal) => {
    if (!address) return
    setChecking(true)
    try {
      const { session } = await request<DepositResponse>(`/api/deposits/${encodeURIComponent(id)}`, getAccessToken, { signal })
      if (signal?.aborted || activeAddress.current !== address) return
      setSessions(current => current.map(item => item.id === session.id ? session : item))
      setError(null)
    } catch (reason) {
      if (!signal?.aborted && activeAddress.current === address) setError(reason instanceof DepositRequestError ? reason.message : 'provider_unavailable')
    } finally { if (!signal?.aborted && activeAddress.current === address) setChecking(false) }
  }, [address, getAccessToken])

  const selectedSession = sessions.find(session => session.id === selectedId)
  const matchesConfiguration = (session: DepositSession) => session.mode === config?.mode
    && sessionAsset(session).currencyCode === checkoutAsset(config?.mode).currencyCode
  const pendingId = selectedSession && matchesConfiguration(selectedSession) && (!isDepositTerminal(selectedSession.status) || selectedSession.status === 'expired')
    ? selectedSession.id : sessions.find(session => matchesConfiguration(session) && !isDepositTerminal(session.status))?.id
  React.useEffect(() => {
    if (!pendingId || !address || !config?.ready) return
    const abort = new AbortController()
    let running = false
    const poll = async () => {
      if (running || document.hidden) return
      running = true
      try { await refresh(pendingId, abort.signal) } finally { running = false }
    }
    void poll()
    const timer = window.setInterval(() => void poll(), 15_000)
    const visible = () => { if (!document.hidden) void poll() }
    document.addEventListener('visibilitychange', visible)
    window.addEventListener('focus', visible)
    return () => { abort.abort(); window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); window.removeEventListener('focus', visible) }
  }, [pendingId, address, config?.ready, refresh])

  const checkout = async (sessionId?: string) => {
    if (!address || busy) return
    setBusy(true); setError(null)
    try {
      // A freshly created wallet may be newer than the current identity token.
      await refreshUser()
      const identityToken = await getIdentityToken()
      if (!identityToken) throw new DepositRequestError('identity_token_unavailable')
      const result = await request<DepositResponse>('/api/deposits/checkout', getAccessToken, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'privy-id-token': identityToken },
        body: JSON.stringify({ walletAddress: address, sessionId, theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' }),
      })
      if (activeAddress.current !== address) return
      const url = new URL(result.checkoutUrl ?? '')
      if (url.protocol !== 'https:' || !['buy.moonpay.com', 'buy-sandbox.moonpay.com'].includes(url.hostname)) throw new DepositRequestError('provider_unavailable')
      setSessions(current => [result.session, ...current.filter(session => session.id !== result.session.id)])
      setSelectedId(result.session.id)
      // Same-tab navigation avoids blocked popups on mobile. Status is durable
      // and redirectURL returns to the authenticated Portfolio screen.
      window.location.assign(url.toString())
    } catch (reason) {
      if (activeAddress.current === address) setError(reason instanceof DepositRequestError ? reason.message : 'provider_unavailable')
    } finally { if (activeAddress.current === address) setBusy(false) }
  }

  return { config, sessions, loading, busy, checking, error, selectedId,
    select: (id: string | null) => { setSelectedId(id); setError(null) },
    reload: () => setReloadKey(value => value + 1), refresh, checkout }
}

export type DepositController = ReturnType<typeof useDeposits>
