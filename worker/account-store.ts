import type { KeyValueStore } from './env.ts'
import type { FundingEnv } from './moonpay.ts'
import { handleStoredDeposits } from './deposits.ts'

type Account = {
  id: string
  createdAt: string
  lastSeenAt: string
  saved: string[]
}

const symbols = new Set(['AAPLon', 'TSLAon', 'NVDAon', 'MSFTon', 'AMZNon'])

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function handleAccountRequest(request: Request, env: FundingEnv, storage: KeyValueStore): Promise<Response> {
  const id = request.headers.get('X-Privy-DID')
  if (!id || !/^did:privy:[a-zA-Z0-9_-]{3,128}$/.test(id)) return json({ error: 'Invalid account' }, 400)

  const now = new Date().toISOString()
  if (new URL(request.url).pathname === '/trade-attempt') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const body = await request.json() as { action: string; requestId: string; typedDataHash: string; signatureHash: string; orderId?: string }
    if (!['get', 'start', 'complete'].includes(body?.action) || !/^[a-f0-9-]{36}$/.test(body.requestId)
      || !/^0x[a-fA-F0-9]{64}$/.test(body.typedDataHash) || !/^0x[a-fA-F0-9]{64}$/.test(body.signatureHash)
      || (body.action === 'complete' && !/^[A-Za-z0-9_-]{1,256}$/.test(body.orderId ?? ''))) return json({ error: 'Invalid trade attempt' }, 400)
    type Attempt = { requestId: string; typedDataHash: string; signatureHash: string; createdAt: number; orderId: string | null }
    let attempts = (await storage.get<Attempt[]>('tradeAttempts') ?? []).filter(item => item.createdAt > Date.now() - 86_400_000)
    let previous = attempts.find(item => item.requestId === body.requestId)
    if (previous && (previous.typedDataHash !== body.typedDataHash || previous.signatureHash !== body.signatureHash)) return json({ error: 'Trade attempt mismatch' }, 409)
    if (body.action !== 'get') {
      if (!previous) {
        if (body.action === 'complete') return json({ error: 'Trade attempt missing' }, 409)
        previous = { requestId: body.requestId, typedDataHash: body.typedDataHash, signatureHash: body.signatureHash, createdAt: Date.now(), orderId: null }
        attempts.push(previous)
      }
      if (body.action === 'complete') {
        if (previous.orderId && previous.orderId !== body.orderId) return json({ error: 'Trade attempt mismatch' }, 409)
        previous.orderId = body.orderId!
      }
      attempts = attempts.slice(-512)
      await storage.put('tradeAttempts', attempts)
    }
    return json({ started: Boolean(previous), orderId: previous?.orderId ?? null })
  }
  if (new URL(request.url).pathname.startsWith('/deposits')) {
    return handleStoredDeposits(request, env, storage)
  }
  const ratePath = new URL(request.url).pathname
  if (['/quote-rate', '/trade-write-rate', '/trade-status-rate'].includes(ratePath)) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const key = ratePath === '/quote-rate' ? 'quoteTimes' : `${ratePath.slice(1)}Times`
    const limit = ratePath === '/quote-rate' ? 6 : ratePath === '/trade-write-rate' ? 12 : 60
    const timestamps = (await storage.get<number[]>(key) ?? []).filter(value => value > Date.now() - 60_000)
    if (timestamps.length >= limit) return json({ error: 'Request limit reached. Try again in a minute.' }, 429)
    await storage.put(key, [...timestamps, Date.now()])
    return json({ allowed: true })
  }
  const account = await storage.get<Account>('account') ?? {
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
  await storage.put('account', account)
  return json({ account })
}
