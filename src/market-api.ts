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

export async function getMarket(symbol: string, frame: Timeframe, signal: AbortSignal): Promise<MarketData | null> {
  const response = await fetch(`/api/market/${encodeURIComponent(symbol)}?frame=${frame}`, { signal })
  if (response.status === 503) return null
  if (!response.ok) throw new Error('Market data request failed')
  const body: MarketData = await response.json()
  if (body.status !== 'ready' || body.symbol !== symbol || !Array.isArray(body.candles)) throw new Error('Invalid market response')
  return body
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
