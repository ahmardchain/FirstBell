import { assets, tokenPrices, type Symbol } from './market.ts'
import { signedBinanceRequest, type BinanceCredentials } from './binance-api.ts'

const hour = 3_600_000
// Use the most recent completed hourly candle at/before seven days ago.
// Gaps over one hour and malformed bars are unavailable, never a zero change.
export function sevenDayChange(price: number, asOf: string, rows: unknown) {
  const target = Date.parse(asOf) - 7 * 24 * hour
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(target) || !Array.isArray(rows)) return null
  const valid = rows.filter((bar): bar is unknown[] => Array.isArray(bar) && bar.length === 7)
    .filter(bar => bar.slice(0, 6).every(value => typeof value === 'number' || typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value)))
    .map(bar => bar.map(Number)).filter(bar => bar.every(Number.isFinite) && bar[0] > 0 && bar[1] > 0 && bar[2] > 0 && bar[3] > 0
      && bar[2] <= Math.min(bar[0], bar[3]) && bar[1] >= Math.max(bar[0], bar[3]) && bar[4] >= 0
      && bar[5] >= 1_500_000_000_000 && bar[5] + hour <= target && target - (bar[5] + hour) < hour)
    .sort((a, b) => b[5] - a[5])
  const result = valid.length ? (price / valid[0][3] - 1) * 100 : null
  return result !== null && Number.isFinite(result) ? result : null
}
const cache = new Map<string, { until: number; value: number | null }>()
const pending = new Map<string, Promise<number | null>>()
export async function portfolioChanges(symbols: Symbol[], credentials: BinanceCredentials) {
  const prices = await tokenPrices(symbols, credentials)
  const values: { symbol: string; change7dPct: number | null; asOf: string | null }[] = []
  // A small batch, three parallel reads at a time, only for actual holdings.
  for (let offset = 0; offset < prices.length; offset += 3) {
    values.push(...await Promise.all(prices.slice(offset, offset + 3).map(async price => {
      let value: number | null = null
      if (price.priceUsd !== null && price.asOf) {
        const key = `${credentials.apiKey}:${price.symbol}:${price.asOf}:${price.priceUsd}`
        const cached = cache.get(key)
        if (cached && cached.until > Date.now()) value = cached.value
        else {
          let task = pending.get(key)
          if (!task) {
            task = (async () => {
              const target = Date.parse(price.asOf!) - 7 * 24 * hour
              try {
                const result = await signedBinanceRequest('GET', '/api/v1/dex/market/candles', { binanceChainId: '56', tokenContractAddress: assets[price.symbol],
                  bar: '1h', after: String(target + 1), before: String(target - 2 * hour - 1), limit: '3' }, credentials)
                const change = sevenDayChange(price.priceUsd!, price.asOf!, result.data)
                if (cache.size >= 200) cache.delete(cache.keys().next().value!)
                cache.set(key, { until: Date.now() + 60_000, value: change })
                return change
              } catch { return null }
            })().finally(() => pending.delete(key))
            pending.set(key, task)
          }
          value = await task
        }
      }
      return { symbol: price.symbol, change7dPct: value, asOf: price.asOf }
    })))
  }
  return values
}
