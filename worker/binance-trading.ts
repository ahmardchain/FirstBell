import { createPublicClient, erc20Abi, formatUnits, http, isAddress, parseUnits } from 'viem'
import { bsc } from 'viem/chains'
import { BSC_USDT } from '../lib/funding.ts'
import { validUsdMinimum } from '../lib/trade-error.ts'
import type { TradingRoute } from '../lib/trading.ts'
import { signPath } from './binance-rwa.ts'
import { assets, isSymbol, parseQuantity, type Symbol } from './market.ts'

export type Credentials = { apiKey: string; secretKey: string }
type Json = Record<string, unknown>
const object = (value: unknown): Json | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : null
const units = (value: unknown): value is string => typeof value === 'string' && /^[1-9]\d{0,77}$/.test(value)
const sameToken = (value: unknown, address: string, decimals: number) => {
  const token = object(value)
  return typeof token?.tokenContractAddress === 'string' && token.tokenContractAddress.toLowerCase() === address.toLowerCase() && String(token.decimal) === String(decimals)
}
export const tradingClient = createPublicClient({ chain: bsc, transport: http('https://bsc-dataseed.bnbchain.org', { timeout: 8_000, retryCount: 0 }) })

const metadata = new Map<string, { promise: Promise<unknown>; expiresAt: number }>()
const metadataTtl = 60_000
// No prices, balances, allowances, quotes, orders, or failures enter this cache.
function cachedMetadata<T>(key: string, read: () => Promise<T>): Promise<T> {
  const previous = metadata.get(key)
  if (previous && previous.expiresAt > Date.now()) return previous.promise as Promise<T>
  if (metadata.size >= 512) metadata.delete(metadata.keys().next().value!)
  const entry = { promise: Promise.resolve().then(read) as Promise<unknown>, expiresAt: Date.now() + 8_000 }
  metadata.set(key, entry)
  entry.promise = entry.promise.then(value => { entry.expiresAt = Date.now() + metadataTtl; return value }, error => {
    if (metadata.get(key) === entry) metadata.delete(key)
    throw error
  })
  return entry.promise as Promise<T>
}
export function clearTradingMetadataCache() { metadata.clear() }
function readTokenDecimals(symbol: Symbol) {
  return cachedMetadata(`bsc-decimals:${assets[symbol].toLowerCase()}`, async () => {
    const value = await tradingClient.readContract({ address: assets[symbol], abi: erc20Abi, functionName: 'decimals' })
    if (!Number.isInteger(value) || value < 0 || value > 36) throw new RouteError('invalid_provider_response')
    return value
  })
}
function toRawAmount(amount: string, decimals: number) {
  if ((amount.split('.')[1]?.length ?? 0) > decimals) throw new RouteError('invalid_amount', 400)
  const raw = parseUnits(amount, decimals).toString()
  if (!units(raw)) throw new RouteError('invalid_amount', 400)
  return raw
}
export async function getTradingInputAmount(symbol: Symbol, side: 'buy' | 'sell', amount: string) {
  if (!isSymbol(symbol) || !['buy', 'sell'].includes(side) || !parseQuantity(amount)) throw new RouteError('invalid_trade_request', 400)
  return toRawAmount(amount, side === 'buy' ? BSC_USDT.decimals : await readTokenDecimals(symbol))
}
async function credentialScope(credentials: Credentials) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([credentials.apiKey, credentials.secretKey])))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export class RouteError extends Error {
  reason: string
  status: number
  minimumUsd: string | null
  constructor(reason: string, status = 503, minimumUsd?: unknown) {
    super(reason); this.reason = reason; this.status = status
    this.minimumUsd = reason === 'minimum_order_not_met' ? validUsdMinimum(minimumUsd) : null
  }
}

export async function tradingRequest(method: 'GET' | 'POST', endpoint: string, input: Record<string, unknown>, credentials: Credentials, signal?: AbortSignal): Promise<Json> {
  const body = method === 'POST' ? JSON.stringify(input) : ''
  const query = method === 'GET' ? new URLSearchParams(input as Record<string, string>).toString() : ''
  const path = `/build${endpoint}${query ? `?${query}` : ''}`
  const timestamp = new Date().toISOString()
  const timeout = AbortSignal.timeout(8_000)
  const boundedSignal = signal ? AbortSignal.any([signal, timeout]) : timeout
  const start = performance.now()
  try {
    const signature = await signPath(timestamp, method, path, body, credentials.secretKey)
    boundedSignal.throwIfAborted()
    const response = await fetch(`https://web3.binance.com${path}`, {
    method, headers: {
      'X-OC-APIKEY': credentials.apiKey, 'X-OC-TIMESTAMP': timestamp,
      'X-OC-SIGN': signature,
      'X-OC-NONCE': crypto.randomUUID(), Accept: 'application/json', 'Content-Type': 'application/json',
    }, ...(body ? { body } : {}), signal: boundedSignal,
    })
    if (!response.ok) throw new RouteError(response.status === 401 || response.status === 403 ? 'provider_auth_error' : 'provider_error')
    if (Number(response.headers.get('content-length') ?? 0) > 300_000) throw new RouteError('invalid_provider_response')
    const text = await response.text()
    boundedSignal.throwIfAborted()
    if (text.length > 300_000) throw new RouteError('invalid_provider_response')
    let result: Json | null
    try { result = object(JSON.parse(text)) } catch { throw new RouteError('invalid_provider_response') }
    if (!result || result.code !== 0 || result.success !== true) {
      // Business codes are useful evidence; never log keys, user IDs or upstream bodies.
      console.warn('Binance route business error', typeof result?.code === 'number' ? result.code : 'missing')
      if (result?.code === 40375) {
        const minimum = typeof result.msg === 'string' && result.msg.length <= 512
          ? result.msg.match(/\bminimum order amount is ((?:0|[1-9]\d{0,8})(?:\.\d{1,2})?) USD\b/i)?.[1] : undefined
        throw new RouteError('minimum_order_not_met', 400, minimum)
      }
      const reason = ({ 40304: 'provider_unavailable', 40367: 'market_closed', 40369: 'market_closed', 40374: 'no_verified_route', 40401: 'stale_quote', 40462: 'invalid_provider_response' } as Record<number, string>)[Number(result?.code)]
      throw new RouteError(reason ?? 'provider_error')
    }
    return result
  } catch (error) {
    if (boundedSignal.aborted && (method === 'GET' || endpoint.endsWith('/simulate'))) throw new RouteError('quote_timeout', 504)
    throw error
  } finally {
    // A fixed stage label and duration only: no URL, wallet, keys, body or signature.
    const stage = endpoint.endsWith('/supported/chain') ? 'support' : endpoint.endsWith('/quote') ? 'quote'
      : endpoint.endsWith('/swap') ? 'build' : endpoint.endsWith('/simulate') ? 'simulation' : 'order'
    console.info('TRADE_PROVIDER_TIMING', { stage, durationMs: Math.round(performance.now() - start) })
  }
}

export function normalizeRoutes(result: Json, request: {
  symbol: Symbol; side: 'buy' | 'sell'; amount: string; rawAmount: string; walletAddress: string; tokenDecimals: number; startedAt: number
}): TradingRoute {
  if (!Array.isArray(result.data)) throw new RouteError('invalid_provider_response')
  if (typeof result.timestamp !== 'number' || !Number.isSafeInteger(result.timestamp)
    || result.timestamp < request.startedAt - 30_000 || result.timestamp > Date.now() + 10_000
    || Date.now() - request.startedAt >= 30_000) throw new RouteError('stale_quote')
  const buying = request.side === 'buy'
  const fromAddress = buying ? BSC_USDT.address : assets[request.symbol]
  const toAddress = buying ? assets[request.symbol] : BSC_USDT.address
  const fromDecimals = buying ? BSC_USDT.decimals : request.tokenDecimals
  const toDecimals = buying ? request.tokenDecimals : BSC_USDT.decimals
  const matchesToken = (value: unknown, address: string, decimals: number) => {
    const token = object(value)
    return typeof token?.tokenContractAddress === 'string' && token.tokenContractAddress.toLowerCase() === address.toLowerCase()
      && String(token.decimal) === String(decimals)
  }
  const routes = result.data.map(object).filter((route): route is Json => Boolean(route
    && route.binanceChainId === '56' && route.fromTokenAmount === request.rawAmount && units(route.toTokenAmount)
    && matchesToken(route.fromToken, fromAddress, fromDecimals) && matchesToken(route.toToken, toAddress, toDecimals)
    // Binance documents equity routes as signed RFQ orders, not ordinary swaps.
    && route.executionMode === 'RFQ' && typeof route.vendorName === 'string' && /^[A-Za-z0-9 ._-]{1,64}$/.test(route.vendorName)
    && typeof route.quoteId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(route.quoteId)))
  if (!routes.length) throw new RouteError('no_verified_route')
  const route = routes.reduce((best, candidate) => BigInt(candidate.toTokenAmount as string) > BigInt(best.toTokenAmount as string) ? candidate : best)
  return {
    source: 'binance-web3', chainId: 56, symbol: request.symbol, side: request.side, walletAddress: request.walletAddress,
    inputAmount: request.amount, inputSymbol: buying ? 'USDT' : request.symbol,
    outputAmount: formatUnits(BigInt(route.toTokenAmount as string), toDecimals), outputSymbol: buying ? request.symbol : 'USDT',
    vendor: route.vendorName as string, executionMode: 'RFQ', checkedAt: new Date().toISOString(),
    // This is a display refresh deadline, not a binding execution guarantee.
    refreshAt: new Date(request.startedAt + 30_000).toISOString(), executable: false,
  }
}

export async function getQuoteContext(symbol: Symbol, side: 'buy' | 'sell', amount: string, walletAddress: string, credentials: Credentials, executableOnly = false, signal?: AbortSignal) {
  if (!isSymbol(symbol) || !['buy', 'sell'].includes(side) || !parseQuantity(amount) || !isAddress(walletAddress)) throw new RouteError('invalid_trade_request', 400)
  if (!credentials.apiKey || !credentials.secretKey) throw new RouteError('not_configured')
  signal?.throwIfAborted()
  // Buy input units are already known. Do not serialize a live quote behind
  // independent output metadata/RPC discovery. Sells still await real decimals.
  const buyAmount = side === 'buy' ? toRawAmount(amount, BSC_USDT.decimals) : null
  const scope = await credentialScope(credentials)
  signal?.throwIfAborted()
  const supported = cachedMetadata(`${scope}:bsc-support`, async () => {
    const chains = await tradingRequest('GET', '/api/v1/dex/aggregator/supported/chain', { binanceChainId: '56' }, credentials)
    if (!Array.isArray(chains.data) || !chains.data.some(chain => object(chain)?.binanceChainId === '56')) throw new RouteError('chain_unavailable')
    return true
  })
  const rpc = cachedMetadata('bsc-rpc-chain', async () => {
    if (await tradingClient.getChainId() !== 56) throw new RouteError('chain_unavailable')
    return true
  })
  const decimals = readTokenDecimals(symbol)
  const [[, , tokenDecimals], quoted] = await Promise.all([
    Promise.all([supported, rpc, decimals]),
    (async () => {
      const inputAmount = buyAmount ?? toRawAmount(amount, await decimals)
      const startedAt = Date.now()
      const result = await tradingRequest('GET', '/api/v1/dex/aggregator/quote', {
        binanceChainId: '56', amount: inputAmount,
        fromTokenAddress: side === 'buy' ? BSC_USDT.address : assets[symbol],
        toTokenAddress: side === 'buy' ? assets[symbol] : BSC_USDT.address,
        userWalletAddress: walletAddress,
      }, credentials, signal)
      return { rawAmount: inputAmount, startedAt, result }
    })(),
  ])
  const { rawAmount, startedAt, result } = quoted
  signal?.throwIfAborted()
  // Only the audited CoW Order schema is executable. Other RFQ vendors remain
  // available to the existing read-only route checker.
  const selected = executableOnly && Array.isArray(result.data) ? { ...result, data: result.data.filter(row => object(row)?.vendorName === 'CowSwap') } : result
  const context = { symbol, side, amount, rawAmount, walletAddress, tokenDecimals, startedAt }
  const route = normalizeRoutes(selected, context)
  const providerRoute = (selected.data as Json[]).find(row => row.vendorName === route.vendor
    && row.binanceChainId === '56' && row.executionMode === 'RFQ' && row.fromTokenAmount === rawAmount && units(row.toTokenAmount)
    && sameToken(row.fromToken, side === 'buy' ? BSC_USDT.address : assets[symbol], side === 'buy' ? BSC_USDT.decimals : tokenDecimals)
    && sameToken(row.toToken, side === 'buy' ? assets[symbol] : BSC_USDT.address, side === 'buy' ? tokenDecimals : BSC_USDT.decimals)
    && typeof row.quoteId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(row.quoteId)
    && formatUnits(BigInt(row.toTokenAmount), side === 'buy' ? tokenDecimals : BSC_USDT.decimals) === route.outputAmount)!
  if (!providerRoute) throw new RouteError('invalid_provider_response')
  return { route, providerRoute, ...context }
}

export async function getTradingRoute(symbol: Symbol, side: 'buy' | 'sell', amount: string, walletAddress: string, credentials: Credentials, signal?: AbortSignal): Promise<TradingRoute> {
  return (await getQuoteContext(symbol, side, amount, walletAddress, credentials, false, signal)).route
}
