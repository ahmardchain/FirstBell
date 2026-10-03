import type { Candle } from '@/components/spectrumui/charts/chart-engine'
import type { TradingRoute } from '../lib/trading'
export type { TradingRoute } from '../lib/trading'

export type Timeframe = '15m' | '1h' | '4h' | '1D'
export type MarketData = {
  status: 'ready'; symbol: string; source: 'ondo' | 'geckoterminal' | 'binance-web3';
  priceUsd: number | null; change24hPct: number | null; asOf: string; candles: Candle[];
  historyError?: { reason: MarketFailure; httpStatus?: number; providerCode?: number };
}

export type TokenPrice = { symbol: string; priceUsd: number | null; change24hPct: number | null; asOf: string | null }
export async function getTokenPrices(symbols: string[], signal?: AbortSignal): Promise<TokenPrice[]> {
  if (!symbols.length) return []
  if (symbols.length > 100) throw new Error('Too many tokens')
  const response = await fetch(`/api/prices?symbols=${encodeURIComponent(symbols.join(','))}`, { signal })
  if (!response.ok) throw new Error('Token prices unavailable')
  const raw: unknown = await response.json()
  const body = raw && typeof raw === 'object' ? raw as Record<string, unknown> : null
  if (body?.status !== 'ready' || !Array.isArray(body.prices)) throw new Error('Invalid token prices')
  const rows = body.prices as Partial<TokenPrice>[]
  return symbols.map(symbol => {
    const row = rows.find(item => item?.symbol === symbol)
    const at = typeof row?.asOf === 'string' ? Date.parse(row.asOf) : NaN
    const price = Number.isFinite(at) && at >= 1_500_000_000_000 && at <= Date.now() + 120_000
      && typeof row?.priceUsd === 'number' && Number.isFinite(row.priceUsd) && row.priceUsd > 0 ? row.priceUsd : null
    return { symbol, priceUsd: price,
      change24hPct: price !== null && typeof row?.change24hPct === 'number' && Number.isFinite(row.change24hPct) ? row.change24hPct : null,
      asOf: price !== null ? row!.asOf! : null }
  })
}
export type MarketFailure = 'provider_auth_error' | 'rate_limited' | 'provider_error'
export class MarketRequestError extends Error {
  reason: MarketFailure
  constructor(reason: MarketFailure) { super(reason); this.reason = reason }
}
export type TradeQuote = {
  symbol: string; side: 'buy' | 'sell'; quantity: string;
  priceUsd: string; estimatedTotalUsd: string; asOf: string; executable: false;
}
export type RwaContext = {
  status: 'ready'; symbol: string; source: 'binance-web3-rwa';
  tokenPriceUsd: number; referencePerShareUsd: number | null;
  priceUpdatedAt: string; fetchedAt: string;
  underlyingMarket: { session: string; open: boolean; nextOpenAt: string | null } | null;
}
export type RwaResult = RwaContext | { status: 'unavailable'; reason: 'not_configured' | 'no_verified_asset' | MarketFailure; httpStatus?: number; providerCode?: number }

export async function getMarket(symbol: string, frame: Timeframe, signal: AbortSignal): Promise<MarketData | null> {
  const response = await fetch(`/api/market/${encodeURIComponent(symbol)}?frame=${frame}`, { signal })
  if (response.status === 503) {
    const result = await response.json() as { status?: string; reason?: string }
    if (result.status !== 'unavailable') throw new MarketRequestError('provider_error')
    if (result.reason === 'provider_auth_error' || result.reason === 'rate_limited' || result.reason === 'provider_error') throw new MarketRequestError(result.reason)
    return null
  }
  if (!response.ok) throw new Error('Market data request failed')
  const body: MarketData = await response.json()
  if (body.status !== 'ready' || body.symbol !== symbol || !Array.isArray(body.candles)) throw new Error('Invalid market response')
  return body
}

export async function getRwa(symbol: string, signal: AbortSignal): Promise<RwaResult> {
  const response = await fetch(`/api/rwa/${encodeURIComponent(symbol)}`, { signal })
  if (response.status !== 200 && response.status !== 503) throw new Error('RWA data request failed')
  const result: RwaResult = await response.json()
  if (result.status === 'ready' && result.symbol === symbol && result.source === 'binance-web3-rwa') return result
  if (result.status === 'unavailable') return result
  throw new Error('Invalid RWA response')
}

export async function getTradeQuote(symbol: string, side: 'buy' | 'sell', quantity: string, token: string): Promise<TradeQuote> {
  const response = await fetch('/api/trade/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ symbol, side, quantity }),
  })
  const result = await response.json() as { quote?: TradeQuote; error?: string }
  if (!response.ok || !result.quote) throw new Error(result.error ?? 'Quote unavailable')
  return result.quote
}

export async function getTradingRoute(symbol: string, side: 'buy' | 'sell', amount: string, walletAddress: string,
  token: string, identityToken: string, signal: AbortSignal): Promise<TradingRoute> {
  const response = await fetch('/api/trade/route', {
    method: 'POST', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'privy-id-token': identityToken },
    body: JSON.stringify({ symbol, side, amount, walletAddress }),
  })
  const result = await response.json() as { route?: TradingRoute; error?: string }
  if (!response.ok || !result.route) throw new Error(result.error ?? 'provider_error')
  const route = result.route
  if (route.source !== 'binance-web3' || route.chainId !== 56 || route.symbol !== symbol || route.side !== side
    || typeof route.walletAddress !== 'string' || route.walletAddress.toLowerCase() !== walletAddress.toLowerCase()
    || route.inputAmount !== amount || route.inputSymbol !== (side === 'buy' ? 'USDT' : symbol)
    || route.outputSymbol !== (side === 'buy' ? symbol : 'USDT') || route.executionMode !== 'RFQ' || route.executable !== false
    || typeof route.outputAmount !== 'string' || !/^\d+(?:\.\d+)?$/.test(route.outputAmount)
    || typeof route.vendor !== 'string' || !Number.isFinite(Date.parse(route.refreshAt))) throw new Error('invalid_provider_response')
  return route
}
