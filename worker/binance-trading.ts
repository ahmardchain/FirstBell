import { createPublicClient, erc20Abi, formatUnits, http, isAddress, parseUnits } from 'viem'
import { bsc } from 'viem/chains'
import { BSC_USDT } from '../lib/funding.ts'
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

export class RouteError extends Error {
  reason: string
  status: number
  constructor(reason: string, status = 503) { super(reason); this.reason = reason; this.status = status }
}

export async function tradingRequest(method: 'GET' | 'POST', endpoint: string, input: Record<string, unknown>, credentials: Credentials): Promise<Json> {
  const body = method === 'POST' ? JSON.stringify(input) : ''
  const query = method === 'GET' ? new URLSearchParams(input as Record<string, string>).toString() : ''
  const path = `/build${endpoint}${query ? `?${query}` : ''}`
  const timestamp = new Date().toISOString()
  const response = await fetch(`https://web3.binance.com${path}`, {
    method, headers: {
      'X-OC-APIKEY': credentials.apiKey, 'X-OC-TIMESTAMP': timestamp,
      'X-OC-SIGN': await signPath(timestamp, method, path, body, credentials.secretKey),
      'X-OC-NONCE': crypto.randomUUID(), Accept: 'application/json', 'Content-Type': 'application/json',
    }, ...(body ? { body } : {}), signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new RouteError(response.status === 401 || response.status === 403 ? 'provider_auth_error' : 'provider_error')
  if (Number(response.headers.get('content-length') ?? 0) > 300_000) throw new RouteError('invalid_provider_response')
  const text = await response.text()
  if (text.length > 300_000) throw new RouteError('invalid_provider_response')
  let result: Json | null
  try { result = object(JSON.parse(text)) } catch { throw new RouteError('invalid_provider_response') }
  if (!result || result.code !== 0 || result.success !== true) {
    // Business codes are useful evidence; never log keys, user IDs or upstream bodies.
    console.warn('Binance route business error', typeof result?.code === 'number' ? result.code : 'missing')
    const reason = ({ 40304: 'provider_unavailable', 40367: 'market_closed', 40369: 'market_closed', 40374: 'no_verified_route', 40401: 'stale_quote', 40462: 'invalid_provider_response' } as Record<number, string>)[Number(result?.code)]
    throw new RouteError(reason ?? 'provider_error')
  }
  return result
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

export async function getQuoteContext(symbol: Symbol, side: 'buy' | 'sell', amount: string, walletAddress: string, credentials: Credentials, executableOnly = false) {
  if (!isSymbol(symbol) || !['buy', 'sell'].includes(side) || !parseQuantity(amount) || !isAddress(walletAddress)) throw new RouteError('invalid_trade_request', 400)
  if (!credentials.apiKey || !credentials.secretKey) throw new RouteError('not_configured')
  const [chains, tokenDecimals, rpcChain] = await Promise.all([
    tradingRequest('GET', '/api/v1/dex/aggregator/supported/chain', { binanceChainId: '56' }, credentials),
    tradingClient.readContract({ address: assets[symbol], abi: erc20Abi, functionName: 'decimals' }),
    tradingClient.getChainId(),
  ])
  if (rpcChain !== 56 || !Array.isArray(chains.data) || !chains.data.some(chain => object(chain)?.binanceChainId === '56')) throw new RouteError('chain_unavailable')
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 36) throw new RouteError('invalid_provider_response')
  const inputDecimals = side === 'buy' ? BSC_USDT.decimals : tokenDecimals
  if ((amount.split('.')[1]?.length ?? 0) > inputDecimals) throw new RouteError('invalid_amount', 400)
  const rawAmount = parseUnits(amount, inputDecimals).toString()
  if (!units(rawAmount)) throw new RouteError('invalid_amount', 400)
  const startedAt = Date.now()
  const result = await tradingRequest('GET', '/api/v1/dex/aggregator/quote', {
    binanceChainId: '56', amount: rawAmount,
    fromTokenAddress: side === 'buy' ? BSC_USDT.address : assets[symbol],
    toTokenAddress: side === 'buy' ? assets[symbol] : BSC_USDT.address,
    userWalletAddress: walletAddress,
  }, credentials)
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

export async function getTradingRoute(symbol: Symbol, side: 'buy' | 'sell', amount: string, walletAddress: string, credentials: Credentials): Promise<TradingRoute> {
  return (await getQuoteContext(symbol, side, amount, walletAddress, credentials)).route
}
