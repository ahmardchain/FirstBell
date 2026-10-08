import * as React from 'react'
import { getIdentityToken, useIdentityToken } from '@privy-io/react-auth'
import { clearSignedTrade, readSignedTrades, readWalletOrders, storeTradeReceipt, walletActivityEvent } from '../lib/trade-storage'
import { readWithdrawalHistory, type WithdrawalRecord } from '../lib/withdrawal-history'
import { needsOrderCheck } from '../lib/order-cancellation'
import { withWalletSession } from '../lib/wallet-session'
import type { AgentOrder } from '../lib/agent-trading'
import type { CashTransfer, PurchaseBasis, WalletActivityPage, WalletTrade } from '../lib/portfolio-performance'
import { tokenAddresses } from '../lib/asset-catalog'
import { checkTrade, recoverTrade } from './agent-api'

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
      const orders = readWalletOrders(localStorage, address)
      const jobs = [...orders.filter(order => needsOrderCheck(order)
        || order.status === 'FILLED' && !order.trade?.quotedOutputAmount && !enriched.has(order.orderId)).map(order => ({ order, attempt: null })),
        ...readSignedTrades(localStorage, address).filter(attempt => !orders.some(order => order.trade?.requestId === attempt.plan.requestId)).map(attempt => ({ order: null, attempt }))]
      if (!jobs.length) return
      checking = true
      const chosen = Array.from({ length: Math.min(3, jobs.length) }, (_, index) => jobs[(cursor + index) % jobs.length]); cursor += chosen.length
      try {
        const results = await withWalletSession({ getAccessToken, getIdentityToken: () => identity.current, refreshIdentityToken: getIdentityToken },
          session => Promise.allSettled(chosen.map(job => job.order ? checkTrade(job.order, address, session, controller.signal)
            : recoverTrade(job.attempt!.plan, job.attempt!.signature, session, controller.signal))), controller.signal)
        if (controller.signal.aborted) return
        for (let index = 0; index < results.length; index++) {
          const result = results[index]
          if (result.status === 'fulfilled' && result.value) {
            enriched.add(result.value.orderId); storeTradeReceipt(localStorage, address, result.value)
            if (chosen[index].attempt) clearSignedTrade(localStorage, address, chosen[index].attempt)
          }
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
  const [snapshot, setSnapshot] = React.useState<{ owner: string; transfers: CashTransfer[]; trades: WalletTrade[]; cursor: string | null } | null>(null)
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
        const response = await fetch('/api/wallet/activity', { method: 'POST', cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}`, 'privy-id-token': session.identityToken }, body: JSON.stringify({ walletAddress: address, cursor }) })
        const result = await response.json() as WalletActivityPage & { status: string }
        if (!response.ok || result.status !== 'ready' || !Array.isArray(result.transfers) || result.transfers.length > 100
          || !(result.cursor === null || typeof result.cursor === 'string' && result.cursor.length <= 512)
          || result.partial !== undefined && typeof result.partial !== 'boolean'
          || result.transfers.some(item => !item || !['deposit', 'withdrawal'].includes(item.kind) || typeof item.amount !== 'string' || !/^\d+(?:\.\d+)?$/.test(item.amount)
            || !/^0x[a-fA-F0-9]{40}$/.test(item.counterparty) || !/^0x[a-fA-F0-9]{64}$/.test(item.hash) || !Number.isFinite(Date.parse(item.createdAt)) || !['success', 'fail', 'pending'].includes(item.status))
          || result.trades !== undefined && (!Array.isArray(result.trades) || result.trades.length > 40 || result.trades.some(item => !item
            || !Object.hasOwn(tokenAddresses, item.symbol) || !['buy', 'sell'].includes(item.side)
            || (item.side === 'buy' ? item.inputSymbol !== 'USDT' || item.outputSymbol !== item.symbol : item.outputSymbol !== 'USDT' || item.inputSymbol !== item.symbol)
            || !/^0x[a-fA-F0-9]{112}$/.test(item.orderId) || item.orderId.slice(66, 106).toLowerCase() !== address.slice(2).toLowerCase()
            || !/^0x[a-fA-F0-9]{64}:\d+$/.test(item.id) || !/^0x[a-fA-F0-9]{64}$/.test(item.hash)
            || !item.id.toLowerCase().startsWith(`${item.hash.toLowerCase()}:`)
            || typeof item.inputAmount !== 'string' || typeof item.outputAmount !== 'string' || !/^\d+(?:\.\d+)?$/.test(item.inputAmount) || !/^\d+(?:\.\d+)?$/.test(item.outputAmount)
            || !Number.isFinite(Date.parse(item.createdAt)) || Date.parse(item.createdAt) > Date.now() + 120_000))) throw new Error('activity_unavailable')
        return result
      }, controller.signal)
      if (controller.signal.aborted || live.current !== address) return
      setSnapshot(current => {
        const previous = current?.owner === address ? current.transfers : []
        // Refresh the first page while retaining earlier loaded pages. Pending
        // rows are replaced by their latest provider state, not duplicated.
        const merged = new Map(previous.map(item => [item.id, item]))
        for (const item of page.transfers) merged.set(item.id, item)
        const trades = new Map((current?.owner === address ? current.trades : []).map(item => [item.id, item]))
        for (const item of page.trades ?? []) trades.set(item.id, item)
        return { owner: address, transfers: [...merged.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
          trades: [...trades.values()],
          cursor: cursor || !previous.length ? page.cursor : current!.cursor }
      }); setError(Boolean(page.partial))
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
    window.addEventListener(walletActivityEvent, refresh)
    return () => { operation.current?.abort(); window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener(walletActivityEvent, refresh) }
  }, [address, read])
  const data = snapshot?.owner.toLowerCase() === address?.toLowerCase() ? snapshot : null
  return { transfers: data?.transfers ?? [], trades: data?.trades ?? [], cursor: data?.cursor ?? null, loading, error, refresh: () => read(), more: () => read(data?.cursor ?? '') }
}
export type CashActivityController = ReturnType<typeof useCashActivity>

export function usePurchaseBasis(address: string | undefined, symbolsKey: string, checkedAt: number | undefined, getAccessToken: GetAccessToken) {
  const { identityToken } = useIdentityToken()
  const identity = React.useRef(identityToken); identity.current = identityToken
  const [snapshot, setSnapshot] = React.useState<{ owner: string; costs: Record<string, PurchaseBasis> } | null>(null)
  React.useEffect(() => {
    const symbols = symbolsKey ? symbolsKey.split(',') : []
    // Preserve fresh purchase evidence during a same-wallet background read.
    // The position still checks it against the current on-chain quantity.
    setSnapshot(current => current && address && current.owner.toLowerCase() === address.toLowerCase() ? { owner: address,
      costs: Object.fromEntries(Object.entries(current.costs).filter(([symbol, basis]) => symbols.includes(symbol)
        && Date.parse(basis.asOf) >= Date.now() - 15 * 60_000)) } : null)
    if (!address || !symbolsKey) return
    const controller = new AbortController(), timeout = window.setTimeout(() => controller.abort(), 20_000)
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
          if (!controller.signal.aborted) setSnapshot(current => ({ owner: address, costs: {
            ...Object.fromEntries(Object.entries(current?.owner === address ? current.costs : {}).filter(([symbol]) => !symbols.slice(start, start + 6).includes(symbol))),
            ...Object.fromEntries(rows.map(item => [item.symbol, item])),
          } }))
        } catch { /* Incomplete/unavailable purchase evidence stays unavailable. */ }
      }
    }, controller.signal).catch(() => {}).finally(() => window.clearTimeout(timeout))
    return () => { controller.abort(); window.clearTimeout(timeout) }
  }, [address, symbolsKey, checkedAt, getAccessToken])
  return snapshot && snapshot.owner.toLowerCase() === address?.toLowerCase() ? snapshot.costs : {}
}
