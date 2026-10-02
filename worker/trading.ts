import type { AccountNamespace } from './env.ts'
import { isAddress } from 'viem'
import { getTradingRoute, RouteError } from './binance-trading.ts'
import { verifyWalletIdentity } from './deposits.ts'
import { isSymbol, parseQuantity } from './market.ts'

type Env = {
  PRIVY_APP_ID: string; PRIVY_VERIFICATION_KEY?: string
  BINANCE_WEB3_API_KEY?: string; BINANCE_WEB3_SECRET_KEY?: string
  ACCOUNTS: AccountNamespace
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

// The Worker authenticates the access token before calling this read-only route.
export async function handleTradingRoute(request: Request, env: Env, userId: string): Promise<Response> {
  try {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
    if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site')
      throw new RouteError('invalid_origin', 403)
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new RouteError('invalid_trade_request', 400)
    if (!env.BINANCE_WEB3_API_KEY || !env.BINANCE_WEB3_SECRET_KEY) throw new RouteError('not_configured')
    const reader = request.body?.getReader()
    if (!reader) throw new RouteError('invalid_trade_request', 400)
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > 512) { await reader.cancel(); throw new RouteError('request_too_large', 413) }
        chunks.push(chunk.value)
      }
    } finally { reader.releaseLock() }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    let input: Record<string, unknown>
    try { input = JSON.parse(new TextDecoder().decode(bytes)) } catch { throw new RouteError('invalid_trade_request', 400) }
    if (!input || typeof input !== 'object' || Array.isArray(input) || typeof input.symbol !== 'string' || !isSymbol(input.symbol)
      || (input.side !== 'buy' && input.side !== 'sell') || !parseQuantity(input.amount)
      || typeof input.walletAddress !== 'string' || !isAddress(input.walletAddress)) throw new RouteError('invalid_trade_request', 400)
    if (!await verifyWalletIdentity(request.headers.get('privy-id-token'), env, userId, input.walletAddress)) throw new RouteError('wallet_not_verified', 403)
    const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName(userId))
    const allowed = await stub.fetch(new Request('https://account.internal/quote-rate', { method: 'POST', headers: { 'X-Privy-DID': userId } }))
    if (!allowed.ok) return json({ error: 'rate_limited' }, allowed.status)
    const route = await getTradingRoute(input.symbol, input.side, input.amount as string, input.walletAddress,
      { apiKey: env.BINANCE_WEB3_API_KEY, secretKey: env.BINANCE_WEB3_SECRET_KEY })
    return json({ route })
  } catch (error) {
    return json({ error: error instanceof RouteError ? error.reason : 'provider_error' }, error instanceof RouteError ? error.status : 503)
  }
}
