import * as React from 'react'
import { getIdentityToken, useIdentityToken } from '@privy-io/react-auth'
import { checkoutAsset, depositProvider, isCheckoutUrl, sessionAsset, type DepositConfig, type DepositSession, isDepositTerminal } from '../lib/funding'
import { WalletSessionError, withWalletSession } from '../lib/wallet-session'

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
  const { identityToken } = useIdentityToken()
  const identity = React.useRef(identityToken)
  identity.current = identityToken
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
    && depositProvider(session) === (config?.provider ?? 'moonpay')
    && sessionAsset(session).currencyCode === checkoutAsset(config?.mode, config?.provider).currencyCode
  const pendingId = selectedSession && matchesConfiguration(selectedSession) && (!isDepositTerminal(selectedSession.status) || selectedSession.status === 'expired')
    ? selectedSession.id : sessions.find(session => matchesConfiguration(session) && !isDepositTerminal(session.status))?.id
  React.useEffect(() => {
    if (!pendingId || !address) return
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
    const timeout = AbortSignal.timeout(20_000)
    try {
      // Checkout validates the current server configuration. A cached setup
      // failure must not block retries after the provider has been configured.
      const result = await withWalletSession({ getAccessToken, getIdentityToken: () => identity.current,
        refreshIdentityToken: getIdentityToken }, ({ accessToken, identityToken: proof }) => {
        if (activeAddress.current !== address) throw new DepositRequestError('unauthorized')
        return request<DepositResponse>('/api/deposits/checkout', async () => accessToken, {
          method: 'POST', signal: timeout, headers: { 'Content-Type': 'application/json', 'privy-id-token': proof },
          body: JSON.stringify({ walletAddress: address, sessionId, theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' }),
        })
      })
      if (activeAddress.current !== address) return
      if (!isCheckoutUrl(result.checkoutUrl ?? '', result.session)) throw new DepositRequestError('provider_unavailable')
      const url = new URL(result.checkoutUrl!)
      setSessions(current => [result.session, ...current.filter(session => session.id !== result.session.id)])
      setSelectedId(result.session.id)
      // Same-tab navigation avoids blocked popups on mobile. Status is durable
      // and redirectURL returns to the authenticated Portfolio screen.
      window.location.assign(url.toString())
    } catch (reason) {
      if (activeAddress.current === address) setError(timeout.aborted ? 'checkout_timeout'
        : reason instanceof DepositRequestError || reason instanceof WalletSessionError ? reason.message : 'provider_unavailable')
    } finally { if (activeAddress.current === address) setBusy(false) }
  }

  return { config, sessions, loading, busy, checking, error, selectedId,
    select: (id: string | null) => { setSelectedId(id); setError(null) },
    reload: () => setReloadKey(value => value + 1), refresh, checkout }
}

export type DepositController = ReturnType<typeof useDeposits>
