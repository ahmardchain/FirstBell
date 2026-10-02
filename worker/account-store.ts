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
  if (new URL(request.url).pathname.startsWith('/deposits')) {
    return handleStoredDeposits(request, env, storage)
  }
  if (new URL(request.url).pathname === '/quote-rate') {
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
    const timestamps = (await storage.get<number[]>('quoteTimes') ?? []).filter(value => value > Date.now() - 60_000)
    if (timestamps.length >= 6) return json({ error: 'Quote limit reached. Try again in a minute.' }, 429)
    await storage.put('quoteTimes', [...timestamps, Date.now()])
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
