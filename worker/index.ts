import { DurableObject } from 'cloudflare:workers'
import { importSPKI, jwtVerify } from 'jose'
import { isFrame, isSymbol, marketSnapshot, parseQuantity, softQuote } from './market'
import { getRwaContext } from './binance-rwa'
import { handleDepositRequest, handleStoredDeposits } from './deposits'

type Account = {
  id: string
  createdAt: string
  lastSeenAt: string
  saved: string[]
}

interface Env {
  ASSETS: Fetcher
  ACCOUNTS: DurableObjectNamespace
  PRIVY_APP_ID: string
  PRIVY_VERIFICATION_KEY?: string
  ONDO_API_KEY?: string
  BINANCE_WEB3_API_KEY?: string
  BINANCE_WEB3_SECRET_KEY?: string
  MOONPAY_PUBLISHABLE_KEY?: string
  MOONPAY_SECRET_KEY?: string
  MOONPAY_ENVIRONMENT?: string
}

const symbols = new Set(['AAPLon', 'TSLAon', 'NVDAon', 'MSFTon', 'AMZNon'])
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

export class AccountStore extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const id = request.headers.get('X-Privy-DID')
    if (!id || !/^did:privy:[a-zA-Z0-9_-]{3,128}$/.test(id)) return json({ error: 'Invalid account' }, 400)

    const now = new Date().toISOString()
    if (new URL(request.url).pathname.startsWith('/deposits')) {
      return this.ctx.blockConcurrencyWhile(() => handleStoredDeposits(request, this.env, this.ctx.storage))
    }
    if (new URL(request.url).pathname === '/quote-rate') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
      const timestamps = (await this.ctx.storage.get<number[]>('quoteTimes') ?? []).filter(value => value > Date.now() - 60_000)
      if (timestamps.length >= 6) return json({ error: 'Quote limit reached. Try again in a minute.' }, 429)
      await this.ctx.storage.put('quoteTimes', [...timestamps, Date.now()])
      return json({ allowed: true })
    }
    const account = await this.ctx.storage.get<Account>('account') ?? {
      id, createdAt: now, lastSeenAt: now, saved: [],
    }
    if (account.id !== id) return json({ error: 'Account mismatch' }, 409)

    if (request.method === 'PUT') {
      let change: unknown
      try { change = await request.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
      if (!change || typeof change !== 'object' || !('symbol' in change) || !('saved' in change)
        || typeof change.symbol !== 'string' || !symbols.has(change.symbol)
        || typeof change.saved !== 'boolean') return json({ error: 'Invalid saved asset' }, 400)
      account.saved = change.saved
        ? [...new Set([...account.saved, change.symbol])]
        : account.saved.filter(symbol => symbol !== change.symbol)
    } else if (request.method !== 'GET') {
      return json({ error: 'Method not allowed' }, 405)
    }

    account.lastSeenAt = now
    await this.ctx.storage.put('account', account)
    return json({ account })
  }
}

async function getUserId(request: Request, env: Env): Promise<string | null> {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ') || !env.PRIVY_VERIFICATION_KEY) return null
  try {
    const key = await importSPKI(env.PRIVY_VERIFICATION_KEY.replace(/\\n/g, '\n'), 'ES256')
    const { payload } = await jwtVerify(authorization.slice(7), key, {
      issuer: 'privy.io', audience: env.PRIVY_APP_ID, algorithms: ['ES256'],
    })
    return typeof payload.sub === 'string' && /^did:privy:[a-zA-Z0-9_-]{3,128}$/.test(payload.sub)
      ? payload.sub : null
  } catch {
    return null
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const pathname = new URL(request.url).pathname
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    if (pathname === '/api/health' && request.method === 'GET') return json({ status: 'ok' })
    if (pathname === '/api/deposits' || pathname.startsWith('/api/deposits/')) {
      if (!env.PRIVY_VERIFICATION_KEY) return json({ error: 'account_not_configured' }, 503)
      const id = await getUserId(request, env)
      if (!id) return json({ error: 'unauthorized' }, 401)
      return handleDepositRequest(request, env, id)
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
        return json({ status: 'unavailable', reason: 'provider_error' }, 503)
      }
    }
    const marketMatch = /^\/api\/market\/([^/]+)$/.exec(pathname)
    if (marketMatch) {
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405)
      const frame = new URL(request.url).searchParams.get('frame') ?? '15m'
      if (!isSymbol(marketMatch[1]) || !isFrame(frame)) return json({ error: 'Unknown market or timeframe' }, 400)
      const result = await marketSnapshot(marketMatch[1], frame, env.ONDO_API_KEY)
      return json(result ? { status: 'ready', ...result } : { status: 'unavailable', symbol: marketMatch[1], candles: [] }, result ? 200 : 503)
    }
    if (pathname === '/api/trade/quote') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
      const origin = request.headers.get('Origin')
      if (origin && origin !== new URL(request.url).origin) return json({ error: 'Invalid origin' }, 403)
      if (Number(request.headers.get('Content-Length') || 0) > maxBodyBytes) return json({ error: 'Request too large' }, 413)
      if (!env.PRIVY_VERIFICATION_KEY || !env.ONDO_API_KEY) return json({ error: 'Trade quote service is not configured' }, 503)
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
    if (!env.PRIVY_VERIFICATION_KEY) return json({ error: 'Account service is not configured' }, 503)
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
  },
}
