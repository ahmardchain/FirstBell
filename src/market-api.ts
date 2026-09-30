import type { Candle } from '@/components/spectrumui/charts/chart-engine'
import type { TradingRoute } from '../lib/trading'
export type { TradingRoute } from '../lib/trading'

export type Timeframe = '15m' | '1h' | '4h' | '1D'
export type MarketData = {
  status: 'ready'; symbol: string; source: 'ondo' | 'geckoterminal';
  priceUsd: number | null; change24hPct: number | null; asOf: string; candles: Candle[];
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
export type RwaResult = RwaContext | { status: 'unavailable'; reason: 'not_configured' | 'no_verified_asset' | 'provider_error' }

export async function getMarket(symbol: string, frame: Timeframe, signal: AbortSignal): Promise<MarketData | null> {
  const response = await fetch(`/api/market/${encodeURIComponent(symbol)}?frame=${frame}`, { signal })
  if (response.status === 503) return null
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
