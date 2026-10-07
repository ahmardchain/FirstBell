import * as React from 'react'
import { getIdentityToken, useIdentityToken } from '@privy-io/react-auth'
import { readWalletOrders, storeTradeReceipt, walletActivityEvent } from '../lib/trade-storage'
import { readWithdrawalHistory, type WithdrawalRecord } from '../lib/withdrawal-history'
import { needsOrderCheck } from '../lib/order-cancellation'
import { withWalletSession } from '../lib/wallet-session'
import type { AgentOrder } from '../lib/agent-trading'
import type { CashTransfer, PurchaseBasis, WalletActivityPage } from '../lib/portfolio-performance'
import { checkTrade } from './agent-api'

type GetAccessToken = () => Promise<string | null>
export function usePortfolioRecords(address: string | undefined, getAccessToken: GetAccessToken) {
  const { identityToken } = useIdentityToken()
  const identity = React.useRef(identityToken); identity.current = identityToken
  const [snapshot, setSnapshot] = React.useState<{ owner: string; orders: AgentOrder[]; withdrawals: WithdrawalRecord[] } | null>(null)
  const [orderError, setOrderError] = React.useState(false)
  React.useEffect(() => {
    setSnapshot(null); setOrderError(false)
    if (!address) return
    const controller = new AbortController()
    const enriched = new Set<string>(); let checking = false, cursor = 0
    const sync = () => {
      if (controller.signal.aborted) return
      setSnapshot({ owner: address, orders: readWalletOrders(localStorage, address), withdrawals: readWithdrawalHistory(localStorage, address) })
    }
    const changed = (event: Event) => {
      if (event instanceof CustomEvent && event.detail !== address.toLowerCase()) return
      if (event instanceof StorageEvent && event.key && !event.key.endsWith(address.toLowerCase())) return
      sync()
    }
    const poll = async () => {
      if (checking || document.hidden || controller.signal.aborted) return
      const jobs = readWalletOrders(localStorage, address).filter(order => needsOrderCheck(order)
        || order.status === 'FILLED' && !order.trade?.quotedOutputAmount && !enriched.has(order.orderId))
      if (!jobs.length) return
      checking = true
      const chosen = Array.from({ length: Math.min(3, jobs.length) }, (_, index) => jobs[(cursor + index) % jobs.length]); cursor += chosen.length
      try {
        const results = await withWalletSession({ getAccessToken, getIdentityToken: () => identity.current, refreshIdentityToken: getIdentityToken },
          session => Promise.allSettled(chosen.map(order => checkTrade(order, address, session, controller.signal))), controller.signal)
        if (controller.signal.aborted) return
        for (let index = 0; index < results.length; index++) {
          const result = results[index]
          if (result.status === 'fulfilled') { enriched.add(chosen[index].orderId); storeTradeReceipt(localStorage, address, result.value) }
        }
        setOrderError(results.some(result => result.status === 'rejected'))
      } catch { if (!controller.signal.aborted) setOrderError(true) }
      finally { checking = false }
    }
    sync()
    const initial = window.setTimeout(() => void poll(), 800)
    const timer = window.setInterval(() => void poll(), 15_000)
    window.addEventListener(walletActivityEvent, changed); window.addEventListener('storage', changed)
    return () => { controller.abort(); window.clearTimeout(initial); window.clearInterval(timer); window.removeEventListener(walletActivityEvent, changed); window.removeEventListener('storage', changed) }
  }, [address, getAccessToken])
  const records = snapshot?.owner.toLowerCase() === address?.toLowerCase() ? snapshot : null
  return { orders: records?.orders ?? [], withdrawals: records?.withdrawals ?? [], orderError }
}

export function useCashActivity(address: string | undefined, getAccessToken: GetAccessToken) {
  const { identityToken } = useIdentityToken()
  const identity = React.useRef(identityToken); identity.current = identityToken
  const [snapshot, setSnapshot] = React.useState<{ owner: string; transfers: CashTransfer[]; cursor: string | null } | null>(null)
  const [loading, setLoading] = React.useState(false), [error, setError] = React.useState(false)
  const live = React.useRef(address); live.current = address
  const operation = React.useRef<AbortController | null>(null)
  const busy = React.useRef(false)
  const read = React.useCallback(async (cursor = '') => {
    if (!address || busy.current) return
    busy.current = true; setLoading(true)
    const controller = new AbortController(); operation.current = controller
    try {
      const page = await withWalletSession({ getAccessToken, getIdentityToken: () => identity.current, refreshIdentityToken: getIdentityToken }, async session => {
        const response = await fetch('/api/wallet/activity', { method: 'POST', cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}`, 'privy-id-token': session.identityToken }, body: JSON.stringify({ walletAddress: address, cursor }) })
        const result = await response.json() as WalletActivityPage & { status: string }
        if (!response.ok || result.status !== 'ready' || !Array.isArray(result.transfers) || result.transfers.length > 100
          || !(result.cursor === null || typeof result.cursor === 'string' && result.cursor.length <= 512)
          || result.transfers.some(item => !item || !['deposit', 'withdrawal'].includes(item.kind) || !/^\d+(?:\.\d+)?$/.test(item.amount)
            || !/^0x[a-fA-F0-9]{64}$/.test(item.hash) || !Number.isFinite(Date.parse(item.createdAt)) || !['success', 'fail', 'pending'].includes(item.status))) throw new Error('activity_unavailable')
        return result
      }, controller.signal)
      if (controller.signal.aborted || live.current !== address) return
      setSnapshot(current => {
        const previous = current?.owner === address ? current.transfers : []
        // Refresh the first page while retaining earlier loaded pages. Pending
        // rows are replaced by their latest provider state, not duplicated.
        const merged = new Map(previous.map(item => [item.id, item]))
        for (const item of page.transfers) merged.set(item.id, item)
        return { owner: address, transfers: [...merged.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
          cursor: cursor || !previous.length ? page.cursor : current!.cursor }
      }); setError(false)
    } catch { if (!controller.signal.aborted && live.current === address) setError(true) }
    finally { if (operation.current === controller) { busy.current = false; if (live.current === address) setLoading(false) } }
  }, [address, getAccessToken])
  React.useEffect(() => {
    operation.current?.abort(); busy.current = false; setSnapshot(null); setError(false); setLoading(false)
    if (!address) return
    void read()
    const refresh = () => { if (!document.hidden) void read() }
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    return () => { operation.current?.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [address, read])
  const data = snapshot?.owner.toLowerCase() === address?.toLowerCase() ? snapshot : null
  return { transfers: data?.transfers ?? [], cursor: data?.cursor ?? null, loading, error, refresh: () => read(), more: () => read(data?.cursor ?? '') }
}
export type CashActivityController = ReturnType<typeof useCashActivity>

export function usePurchaseBasis(address: string | undefined, symbolsKey: string, checkedAt: number | undefined, getAccessToken: GetAccessToken) {
  const { identityToken } = useIdentityToken()
  const identity = React.useRef(identityToken); identity.current = identityToken
  const [snapshot, setSnapshot] = React.useState<{ owner: string; costs: Record<string, PurchaseBasis> } | null>(null)
  React.useEffect(() => {
    setSnapshot(null)
    if (!address || !symbolsKey) return
    const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), 20_000)
    const symbols = symbolsKey.split(',')
    void withWalletSession({ getAccessToken, getIdentityToken: () => identity.current, refreshIdentityToken: getIdentityToken }, async session => {
      for (let start = 0; start < symbols.length && !controller.signal.aborted; start += 6) {
        try {
          const response = await fetch('/api/wallet/cost-basis', { method: 'POST', cache: 'no-store', signal: controller.signal,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}`, 'privy-id-token': session.identityToken }, body: JSON.stringify({ walletAddress: address, symbols: symbols.slice(start, start + 6) }) })
          const result = await response.json() as { status: string; costs: PurchaseBasis[] }
          if (!response.ok || result.status !== 'ready' || !Array.isArray(result.costs)) continue
          const rows = result.costs.filter(item => item && symbols.slice(start, start + 6).includes(item.symbol) && typeof item.quantity === 'string' && /^\d+(?:\.\d+)?$/.test(item.quantity)
            && typeof item.cost === 'number' && Number.isFinite(item.cost) && item.cost > 0 && Number.isFinite(Date.parse(item.asOf))
            && Date.parse(item.asOf) >= Date.now() - 15 * 60_000 && Date.parse(item.asOf) <= Date.now() + 120_000)
          if (!controller.signal.aborted) setSnapshot(current => ({ owner: address, costs: { ...current?.costs, ...Object.fromEntries(rows.map(item => [item.symbol, item])) } }))
        } catch { /* Incomplete/unavailable purchase evidence stays unavailable. */ }
      }
    }, controller.signal).catch(() => {}).finally(() => window.clearTimeout(timeout))
    return () => { controller.abort(); window.clearTimeout(timeout) }
  }, [address, symbolsKey, checkedAt, getAccessToken])
  return snapshot && snapshot.owner.toLowerCase() === address?.toLowerCase() ? snapshot.costs : {}
}
