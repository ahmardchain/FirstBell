// Market data is read-only. Ondo primary-market and GeckoTerminal DEX pool prices
// are deliberately labeled separately; neither is an executable order price.
import { BinanceApiError, binanceFailure, signedBinanceRequest, type BinanceCredentials } from './binance-api.ts'
export const assets = {
  AAPLon: '0x390a684EF9cADE28A7AD0DFa61AB1Eb3842618c4',
  TSLAon: '0x2494b603319d4D9F9715c9f4496d9E0364B59d93',
  NVDAon: '0xA9eE28C80f960B889dFbd1902055218cBa016F75',
  MSFTon: '0x6Bfe75D1ad432050eA973C3A3DcD88F02e2444C3',
  AMZNon: '0x4553cFe1C09f37f38b12dC509F676964e392F8Fc',
} as const

export type Symbol = keyof typeof assets
export type Frame = '15m' | '1h' | '4h' | '1D'
export type Candle = { t: number; open: number; high: number; low: number; close: number; volume: number }
export type MarketSnapshot = {
  symbol: Symbol; source: 'ondo' | 'geckoterminal' | 'binance-web3'; priceUsd: number | null;
  change24hPct: number | null; asOf: string; candles: Candle[];
  historyError?: ReturnType<typeof binanceFailure>;
}

const frames: Record<Frame, { ondo: [string, string]; gecko: [string, number] }> = {
  '15m': { ondo: ['15min', '1day'], gecko: ['minute', 15] },
  '1h': { ondo: ['1hour', '1month'], gecko: ['hour', 1] },
  '4h': { ondo: ['4hour', '1month'], gecko: ['hour', 4] },
  '1D': { ondo: ['1day', '3month'], gecko: ['day', 1] },
}

export const isSymbol = (value: string): value is Symbol => Object.hasOwn(assets, value)
export const isFrame = (value: string): value is Frame => Object.hasOwn(frames, value)

const finite = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !/^[-+]?\d+(\.\d+)?$/.test(value)) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
const positive = (value: unknown): number | null => {
  const n = finite(value)
  return n !== null && n > 0 ? n : null
}
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

function candle(t: unknown, open: unknown, high: unknown, low: unknown, close: unknown, volume: unknown): Candle | null {
  const timestamp = finite(t), o = positive(open), h = positive(high), l = positive(low), c = positive(close)
  const v = finite(volume) ?? 0
  if (timestamp === null || timestamp < 1_500_000_000_000 || timestamp > Date.now() + 86_400_000
    || o === null || h === null || l === null || c === null || l > Math.min(o, c)
    || h < Math.max(o, c) || v < 0) return null
  return { t: timestamp, open: o, high: h, low: l, close: c, volume: v }
}

function candlesFrom(rows: unknown, source: 'ondo' | 'geckoterminal'): Candle[] {
  if (!Array.isArray(rows)) return []
  const parsed = rows.slice(0, 200).map(row => {
    if (source === 'geckoterminal' && Array.isArray(row)) return candle(Number(row[0]) * 1000, row[1], row[2], row[3], row[4], row[5])
    const r = record(row)
    return r ? candle(r.timestamp, r.open, r.high, r.low, r.close, 0) : null
  }).filter((item): item is Candle => item !== null)
  // Ignore malformed and duplicate bars, ensuring the chart sees ascending timestamps.
  return [...new Map(parsed.sort((a, b) => a.t - b.t).map(item => [item.t, item])).values()]
}

async function getJson(url: string, apiKey?: string): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(url, {
      headers: apiKey ? { 'x-api-key': apiKey, Accept: 'application/json' } : { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Market provider: ${response.status}`)
    if (Number(response.headers.get('content-length') || 0) > 1_000_000) throw new Error('Oversize market response')
    const body = await response.text()
    if (body.length > 1_000_000) throw new Error('Oversize market response')
    const value = record(JSON.parse(body))
    if (!value) throw new Error('Invalid market response')
    return value
  } finally { clearTimeout(timer) }
}

async function ondoMarket(symbol: Symbol, frame: Frame, apiKey: string): Promise<MarketSnapshot | null> {
  const base = `https://api.gm.ondo.finance/v1/assets/${symbol}`
  const [interval, range] = frames[frame].ondo
  const [market, history] = await Promise.all([
    getJson(`${base}/market`, apiKey),
    getJson(`${base}/prices/ohlc?interval=${interval}&range=${range}`, apiKey),
  ])
  const primary = record(market.primaryMarket)
  const series = record(history.primaryMarket)
  if (primary?.symbol !== symbol || series?.symbol !== symbol) return null
  const bars = candlesFrom(series.data, 'ondo')
  const price = positive(primary.price)
  if (!price && !bars.length) return null
  const timestamp = finite(market.timestamp)
  return {
    symbol, source: 'ondo', priceUsd: price,
    change24hPct: finite(primary.priceChangePct24h),
    asOf: new Date(timestamp && timestamp > 1_500_000_000_000 ? timestamp : (bars.at(-1)?.t ?? Date.now())).toISOString(),
    candles: bars,
  }
}

async function geckoMarket(symbol: Symbol, frame: Frame): Promise<MarketSnapshot | null> {
  const address = assets[symbol].toLowerCase()
  const root = 'https://api.geckoterminal.com/api/v2'
  const pools = await getJson(`${root}/networks/bsc/tokens/${address}/pools?page=1`)
  if (!Array.isArray(pools.data)) return null
  const candidates = pools.data.map(item => {
    const pool = record(item), attrs = record(pool?.attributes), relationships = record(pool?.relationships)
    const base = record(record(relationships?.base_token)?.data)?.id
    const quote = record(record(relationships?.quote_token)?.data)?.id
    const target = `bsc_${address}`
    if (typeof base !== 'string' || typeof quote !== 'string' || (base.toLowerCase() !== target && quote.toLowerCase() !== target)) return null
    const poolAddress = attrs?.address
    const liquidity = positive(attrs?.reserve_in_usd) ?? 0
    if (typeof poolAddress !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(poolAddress) || liquidity < 10_000) return null
    return { attrs, poolAddress, liquidity, isBase: base.toLowerCase() === target }
  }).filter((item): item is { attrs: Record<string, unknown>; poolAddress: string; liquidity: number; isBase: boolean } => item !== null)
    .sort((a, b) => b.liquidity - a.liquidity)
  const selected = candidates[0]
  if (!selected) return null
  const [period, aggregate] = frames[frame].gecko
  const ohlc = await getJson(`${root}/networks/bsc/pools/${selected.poolAddress}/ohlcv/${period}?aggregate=${aggregate}&currency=usd&token=${address}&limit=100`)
  const rows = record(record(ohlc.data)?.attributes)?.ohlcv_list
  const bars = candlesFrom(rows, 'geckoterminal')
  if (!bars.length) return null
  const change = record(selected.attrs.price_change_percentage)
  const price = positive(selected.attrs[selected.isBase ? 'base_token_price_usd' : 'quote_token_price_usd'])
  return {
    symbol, source: 'geckoterminal', priceUsd: price,
    change24hPct: finite(change?.h24), asOf: new Date(bars.at(-1)!.t).toISOString(), candles: bars,
  }
}

async function binanceMarket(symbol: Symbol, frame: Frame, credentials: BinanceCredentials): Promise<MarketSnapshot | null> {
  const address = assets[symbol]
  const [history, trading] = await Promise.allSettled([
    signedBinanceRequest('GET', '/api/v1/dex/market/candles', {
      binanceChainId: '56', tokenContractAddress: address, bar: frame === '1D' ? '1d' : frame, limit: '100',
    }, credentials),
    signedBinanceRequest('POST', '/api/v1/dex/market/price-info', {}, credentials,
      JSON.stringify([{ binanceChainId: '56', tokenContractAddress: address }])),
  ])
  // Binance's tuple is [open, high, low, close, volume, timestamp_ms, tradeCount].
  // It is different from GeckoTerminal's timestamp-first tuple.
  const rows = history.status === 'fulfilled' && Array.isArray(history.value.data) ? history.value.data : []
  const bars = rows.slice(0, 200).map(row => Array.isArray(row) && row.length === 7 && finite(row[4]) !== null
    && finite(row[5]) !== null && Number(row[5]) <= Date.now() + 120_000
    ? candle(row[5], row[0], row[1], row[2], row[3], row[4]) : null)
    .filter((bar): bar is Candle => bar !== null)
  const candles = [...new Map(bars.sort((a, b) => a.t - b.t).map(bar => [bar.t, bar])).values()]
  const prices = trading.status === 'fulfilled' && Array.isArray(trading.value.data) ? trading.value.data : []
  const exact = prices.map(record).find(item => item && String(item.binanceChainId) === '56'
    && typeof item.tokenContractAddress === 'string' && item.tokenContractAddress.toLowerCase() === address.toLowerCase())
  const at = finite(exact?.time)
  const price = at !== null && at >= 1_500_000_000_000 && at <= Date.now() + 120_000 ? positive(exact?.price) : null
  const invalidHistory = history.status === 'fulfilled' && (!Array.isArray(history.value.data) || (rows.length > 0 && candles.length === 0))
  if (!candles.length && price === null) {
    const failure = [history, trading].find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') throw failure.reason
    if (invalidHistory) throw new BinanceApiError('provider_error')
    return null
  }
  return {
    symbol, source: 'binance-web3', priceUsd: price,
    change24hPct: price !== null ? finite(exact?.priceChange24H) : null,
    asOf: new Date(price !== null ? at! : candles.at(-1)!.t).toISOString(), candles,
    ...(history.status === 'rejected' ? { historyError: binanceFailure(history.reason) }
      : invalidHistory ? { historyError: { reason: 'provider_error' as const } } : {}),
  }
}

// A short isolate-local cache reduces public API load. Failures are never cached.
const cache = new Map<string, { until: number; data: MarketSnapshot }>()
export async function marketSnapshot(symbol: Symbol, frame: Frame, ondoKey?: string, binance?: BinanceCredentials): Promise<MarketSnapshot | null> {
  const cacheKey = `${symbol}:${frame}:${ondoKey ? 'ondo' : 'public'}:${binance ? 'binance' : 'no-binance'}`
  const hit = cache.get(cacheKey)
  if (hit && hit.until > Date.now()) return hit.data
  let data: MarketSnapshot | null = null
  let binanceError: unknown
  if (binance) {
    try { data = await binanceMarket(symbol, frame, binance) } catch (error) { binanceError = error }
  }
  if (!data && ondoKey) {
    try { data = await ondoMarket(symbol, frame, ondoKey) } catch { /* source unavailable; try public DEX */ }
  }
  if (!data) {
    try { data = await geckoMarket(symbol, frame) } catch { /* no verified pool/feed */ }
  }
  if (data) {
    if (cache.size > 24) cache.clear()
    if (!data.historyError) cache.set(cacheKey, { until: Date.now() + 30_000, data })
  }
  if (!data && binanceError) throw binanceError
  return data
}

export function parseQuantity(value: unknown): string | null {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,8})(?:\.\d{1,18})?$/.test(value)) return null
  if (!/[1-9]/.test(value)) return null
  return value
}

export function decimalFromUnits(value: bigint, decimals = 18): string {
  const base = 10n ** BigInt(decimals)
  const fraction = (value % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return `${value / base}${fraction ? `.${fraction}` : ''}`
}

export type SoftQuote = { symbol: Symbol; side: 'buy' | 'sell'; quantity: string; priceUsd: string; estimatedTotalUsd: string; asOf: string; executable: false }
export async function softQuote(symbol: Symbol, side: 'buy' | 'sell', quantity: string, apiKey: string): Promise<SoftQuote | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch('https://api.gm.ondo.finance/v1/attestations/soft', {
      method: 'POST', headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ chainId: 'bsc-56', symbol, side, tokenAmount: quantity, duration: 'short' }),
      signal: controller.signal,
    })
    if (!response.ok) return null
    const body = await response.text()
    if (body.length > 20_000) return null
    const quote = record(JSON.parse(body))
    if (!quote || quote.symbol !== symbol || quote.chainId !== '56'
      || quote.side !== (side === 'buy' ? '0' : '1')
      || typeof quote.assetAddress !== 'string' || quote.assetAddress.toLowerCase() !== assets[symbol].toLowerCase()
      || typeof quote.price !== 'string' || !/^\d{1,80}$/.test(quote.price)
      || typeof quote.tokenAmount !== 'string' || !/^\d{1,80}$/.test(quote.tokenAmount)) return null
    const units = BigInt(quantity.split('.')[0]) * 10n ** 18n + BigInt((quantity.split('.')[1] ?? '').padEnd(18, '0') || '0')
    if (BigInt(quote.tokenAmount) !== units || BigInt(quote.price) <= 0n) return null
    return {
      symbol, side, quantity, priceUsd: decimalFromUnits(BigInt(quote.price)),
      estimatedTotalUsd: decimalFromUnits(BigInt(quote.price) * units / 10n ** 18n),
      asOf: new Date().toISOString(), executable: false,
    }
  } finally { clearTimeout(timer) }
}
