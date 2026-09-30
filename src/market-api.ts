import type { Candle } from '@/components/spectrumui/charts/chart-engine'

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
