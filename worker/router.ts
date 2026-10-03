import type { ApiEnv } from './env.ts'
import { privyAuthConfigured, verifyPrivyToken } from './privy-auth.ts'
import { isFrame, isSymbol, marketSnapshot, parseQuantity, softQuote, tokenPrices } from './market.ts'
import { getRwaContext } from './binance-rwa.ts'
import { binanceFailure } from './binance-api.ts'
import { handleDepositRequest } from './deposits.ts'
import { handleTradingRoute } from './trading.ts'

const maxBodyBytes = 512

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function readSmallBody(request: Request): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBodyBytes) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(bytes)
}


async function getUserId(request: Request, env: ApiEnv): Promise<string | null> {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const payload = await verifyPrivyToken(authorization.slice(7), env)
  return typeof payload?.sub === 'string' ? payload.sub : null
}

export async function handleApiRequest(request: Request, env: ApiEnv): Promise<Response> {
  const pathname = new URL(request.url).pathname
  if (!pathname.startsWith('/api/')) return json({ error: 'Not found' }, 404)
  if (pathname === '/api/health' && request.method === 'GET') return json({ status: 'ok',
    walletVerification: { serverLookupConfigured: Boolean(env.PRIVY_APP_SECRET?.trim()) } })
  if (pathname === '/api/prices') {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
    const symbols = new URL(request.url).searchParams.get('symbols')?.split(',') ?? []
    if (!symbols.length || symbols.length > 100 || symbols.some(symbol => !isSymbol(symbol)))
      return json({ error: 'Invalid token batch' }, 400)
    if (!env.BINANCE_WEB3_API_KEY || !env.BINANCE_WEB3_SECRET_KEY)
      return json({ status: 'unavailable', reason: 'not_configured' }, 503)
    try {
      const prices = await tokenPrices(symbols, { apiKey: env.BINANCE_WEB3_API_KEY, secretKey: env.BINANCE_WEB3_SECRET_KEY })
      return json({ status: 'ready', source: 'binance-web3', prices })
    } catch (error) {
      console.warn('Binance price batch failed', error instanceof Error ? error.message : 'Unknown provider error')
      return json({ status: 'unavailable', ...binanceFailure(error) }, 503)
    }
  }
  if (pathname === '/api/deposits' || pathname.startsWith('/api/deposits/')) {
    if (!privyAuthConfigured(env)) return json({ error: 'account_not_configured' }, 503)
    const id = await getUserId(request, env)
    if (!id) return json({ error: 'unauthorized' }, 401)
    return handleDepositRequest(request, env, id)
  }
  if (pathname === '/api/trade/route') {
    if (!privyAuthConfigured(env)) return json({ error: 'account_not_configured' }, 503)
    const id = await getUserId(request, env)
    if (!id) return json({ error: 'unauthorized' }, 401)
    return handleTradingRoute(request, env, id)
  }
  const rwaMatch = /^\/api\/rwa\/([^/]+)$/.exec(pathname)
  if (rwaMatch) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
    if (!isSymbol(rwaMatch[1])) return json({ error: 'Unknown tokenized equity' }, 400)
    if (!env.BINANCE_WEB3_API_KEY || !env.BINANCE_WEB3_SECRET_KEY)
      return json({ status: 'unavailable', reason: 'not_configured' }, 503)
    try {
      const context = await getRwaContext(rwaMatch[1], { apiKey: env.BINANCE_WEB3_API_KEY, secretKey: env.BINANCE_WEB3_SECRET_KEY })
      return context ? json({ status: 'ready', ...context }) : json({ status: 'unavailable', reason: 'no_verified_asset' }, 503)
    } catch (error) {
      console.warn('Binance RWA read failed', error instanceof Error ? error.message : 'Unknown provider error')
      return json({ status: 'unavailable', ...binanceFailure(error) }, 503)
    }
  }
  const marketMatch = /^\/api\/market\/([^/]+)$/.exec(pathname)
  if (marketMatch) {
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
    const frame = new URL(request.url).searchParams.get('frame') ?? '15m'
    if (!isSymbol(marketMatch[1]) || !isFrame(frame)) return json({ error: 'Unknown market or timeframe' }, 400)
    const credentials = env.BINANCE_WEB3_API_KEY && env.BINANCE_WEB3_SECRET_KEY
      ? { apiKey: env.BINANCE_WEB3_API_KEY, secretKey: env.BINANCE_WEB3_SECRET_KEY } : undefined
    try {
      const result = await marketSnapshot(marketMatch[1], frame, env.ONDO_API_KEY, credentials)
      return json(result ? { status: 'ready', ...result } : { status: 'unavailable', symbol: marketMatch[1], candles: [] }, result ? 200 : 503)
    } catch (error) {
      console.warn('Binance market read failed', error instanceof Error ? error.message : 'Unknown provider error')
      return json({ status: 'unavailable', symbol: marketMatch[1], candles: [], ...binanceFailure(error) }, 503)
    }
  }
  if (pathname === '/api/trade/quote') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const origin = request.headers.get('Origin')
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Invalid origin' }, 403)
    if (Number(request.headers.get('Content-Length') || 0) > maxBodyBytes) return json({ error: 'Request too large' }, 413)
    if (!privyAuthConfigured(env) || !env.ONDO_API_KEY) return json({ error: 'Trade quote service is not configured' }, 503)
    const id = await getUserId(request, env)
    if (!id) return json({ error: 'Unauthorized' }, 401)
    const body = await readSmallBody(request)
    if (body === null) return json({ error: 'Request too large' }, 413)
    let input: Record<string, unknown>
    try { input = JSON.parse(body) } catch { return json({ error: 'Invalid JSON' }, 400) }
    if (!input || !isSymbol(String(input.symbol)) || (input.side !== 'buy' && input.side !== 'sell')) return json({ error: 'Invalid trade request' }, 400)
    const quantity = parseQuantity(input.quantity)
    if (!quantity) return json({ error: 'Enter a valid token quantity' }, 400)
    const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName(id))
    const allowed = await stub.fetch(new Request('https://account.internal/quote-rate', { method: 'POST', headers: { 'X-Privy-DID': id } }))
    if (!allowed.ok) return allowed
    try {
      const quote = await softQuote(input.symbol as Parameters<typeof softQuote>[0], input.side, quantity, env.ONDO_API_KEY)
      return quote ? json({ quote }) : json({ error: 'Ondo quote unavailable for this token and size' }, 503)
    } catch { return json({ error: 'Ondo quote unavailable right now' }, 503) }
  }
  if (pathname !== '/api/me' && pathname !== '/api/me/saved') return json({ error: 'Not found' }, 404)
  if (!privyAuthConfigured(env)) return json({ error: 'Account service is not configured' }, 503)
  if (pathname === '/api/me' && request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
  if (pathname === '/api/me/saved' && request.method !== 'PUT') return json({ error: 'Method not allowed' }, 405)

  if (request.method === 'PUT') {
    const origin = request.headers.get('Origin')
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'Invalid origin' }, 403)
    if (Number(request.headers.get('Content-Length') || 0) > maxBodyBytes) return json({ error: 'Request too large' }, 413)
  }
  const id = await getUserId(request, env)
  if (!id) return json({ error: 'Unauthorized' }, 401)

  const body = request.method === 'PUT' ? await readSmallBody(request) : undefined
  if (body === null) return json({ error: 'Request too large' }, 413)

  const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName(id))
  return stub.fetch(new Request('https://account.internal/', {
    method: request.method,
    headers: { 'X-Privy-DID': id },
    body,
  }))
}
