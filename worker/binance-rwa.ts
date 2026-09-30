import { assets, type Symbol } from './market.ts'

const base = 'https://web3.binance.com'
const chainId = '56'
const allowedSessions = new Set(['premarket', 'regular', 'postmarket', 'overnight', 'closed', 'pause'])

type Credentials = { apiKey: string; secretKey: string }
type Json = Record<string, unknown>

export type RwaContext = {
  symbol: Symbol
  source: 'binance-web3-rwa'
  tokenPriceUsd: number
  referencePerShareUsd: number | null
  priceUpdatedAt: string
  fetchedAt: string
  underlyingMarket: {
    session: string
    open: boolean
    nextOpenAt: string | null
  } | null
}

const object = (value: unknown): Json | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : null

const amount = (value: unknown): number | null => {
  if (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value)) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const timestamp = (value: unknown): string | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1_500_000_000_000
  && value <= Date.now() + 120_000 ? new Date(value).toISOString() : null

const nextOpenTimestamp = (value: unknown): string | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= Date.now()
  && value <= Date.now() + 366 * 24 * 60 * 60 * 1000 ? new Date(value).toISOString() : null

// Binance signs the exact encoded request path, including /build and the query.
export async function signPath(timestampIso: string, method: string, pathWithQuery: string, body: string, secretKey: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secretKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(timestampIso + method + pathWithQuery + body))
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

async function signedGet(endpoint: string, params: Record<string, string>, credentials: Credentials): Promise<Json> {
  const query = Object.entries(params).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
  const path = `/build${endpoint}?${query}`
  const now = new Date().toISOString()
  const signature = await signPath(now, 'GET', path, '', credentials.secretKey)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(`${base}${path}`, {
      headers: {
        'X-OC-APIKEY': credentials.apiKey,
        'X-OC-TIMESTAMP': now,
        'X-OC-SIGN': signature,
        'X-OC-NONCE': crypto.randomUUID(),
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Binance RWA HTTP ${response.status}`)
    if (Number(response.headers.get('content-length') || 0) > 300_000) throw new Error('Binance RWA response too large')
    const body = await response.text()
    if (body.length > 300_000) throw new Error('Binance RWA response too large')
    const result = object(JSON.parse(body))
    if (!result || result.success !== true || result.code !== 0) throw new Error(`Binance RWA business status ${String(result?.code ?? 'missing')}`)
    return result
  } finally {
    clearTimeout(timer)
  }
}

function matchesAsset(data: Json, address: string): boolean {
  return String(data.binanceChainId) === chainId
    && typeof data.tokenContractAddress === 'string'
    && data.tokenContractAddress.toLowerCase() === address.toLowerCase()
    && data.platformId === 'ondo'
}

function parsePrice(result: Json, address: string) {
  if (!Array.isArray(result.data)) return null
  const record = result.data.map(object).find(item => item && matchesAsset(item, address))
  if (!record) return null
  const price = amount(record.tokenPrice)
  const updatedAt = timestamp(record.tokenPriceUpdatedAt)
  if (price === null || !updatedAt) return null
  return { price, updatedAt, reference: amount(record.referencePrice) }
}

function parseMarket(result: Json, address: string): RwaContext['underlyingMarket'] {
  const data = object(result.data)
  if (!data || !matchesAsset(data, address)) return null
  const status = object(data.statusInfo)
  if (!status || typeof status.marketStatus !== 'string' || !allowedSessions.has(status.marketStatus)
    || typeof status.openState !== 'boolean') return null
  return {
    session: status.marketStatus,
    open: status.openState,
    nextOpenAt: nextOpenTimestamp(status.nextOpenTime),
  }
}

const cache = new Map<Symbol, { expires: number; data: RwaContext }>()

export async function getRwaContext(symbol: Symbol, credentials: Credentials): Promise<RwaContext | null> {
  const cached = cache.get(symbol)
  if (cached && cached.expires > Date.now()) return cached.data
  const address = assets[symbol]
  const prices = await signedGet('/api/v1/dex/market/rwa/price', {
    binanceChainId: chainId, tokenContractAddresses: address,
  }, credentials)
  const price = parsePrice(prices, address)
  if (!price) return null

  // The underlying status is useful but must not hide a valid token price if it fails.
  let market: RwaContext['underlyingMarket'] = null
  try {
    const response = await signedGet('/api/v1/dex/market/rwa/underlying-market', {
      binanceChainId: chainId, tokenContractAddress: address,
    }, credentials)
    market = parseMarket(response, address)
  } catch { /* show price without an unverified market-status claim */ }

  const result: RwaContext = {
    symbol, source: 'binance-web3-rwa', tokenPriceUsd: price.price,
    referencePerShareUsd: price.reference, priceUpdatedAt: price.updatedAt,
    fetchedAt: timestamp(prices.timestamp) ?? new Date().toISOString(),
    underlyingMarket: market,
  }
  if (cache.size > 12) cache.clear()
  cache.set(symbol, { expires: Date.now() + 30_000, data: result })
  return result
}
