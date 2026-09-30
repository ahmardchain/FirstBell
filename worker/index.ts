import { DurableObject } from 'cloudflare:workers'
import { importSPKI, jwtVerify } from 'jose'

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
