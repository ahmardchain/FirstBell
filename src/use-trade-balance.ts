import * as React from 'react'
import { readTradeBalance, type TradeBalance } from './wallet-balances'

export function useTradeBalance(owner: string | undefined, token: { symbol: string; address: string }) {
  const key = owner ? `${owner.toLowerCase()}:${token.address.toLowerCase()}` : ''
  const [snapshot, setSnapshot] = React.useState<{ key: string; balance: TradeBalance } | null>(null)
  const [request, setRequest] = React.useState({ key: '', loading: false, error: false })
  const [refreshKey, setRefreshKey] = React.useState(0)
  const refresh = React.useCallback(() => setRefreshKey(value => value + 1), [])
  React.useEffect(() => {
    if (!owner) return
    let active = true
    setRequest({ key, loading: true, error: false })
    readTradeBalance(owner, { symbol: token.symbol, address: token.address }).then(balance => {
      if (active) { setSnapshot({ key, balance }); setRequest({ key, loading: false, error: false }) }
    }).catch(() => { if (active) setRequest({ key, loading: false, error: true }) })
    return () => { active = false }
  }, [owner, key, token.address, token.symbol, refreshKey])
  return { balance: key && snapshot?.key === key ? snapshot.balance : null,
    loading: Boolean(owner) && (request.key !== key || request.loading),
    error: Boolean(owner) && request.key === key && request.error, refresh }
}
