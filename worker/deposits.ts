import type { AccountNamespace } from './env.ts'
import { importSPKI, jwtVerify } from 'jose'
import { isAddress } from 'viem'
import { BSC_USDT, checkoutAsset, type DepositConfig, type DepositSession, isDepositTerminal } from '../lib/funding.ts'
import { checkDeposit, createCheckoutUrl, customerIp, FundingError, getFiatOptions, getMoonPayCredentials, hmac, validateFiatAmount, type FundingEnv } from './moonpay.ts'

type Store = {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
}
type Env = FundingEnv & { ACCOUNTS: AccountNamespace }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const validId = (value: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)

export async function verifyWalletIdentity(token: string | null, env: FundingEnv, userId: string, address: string): Promise<boolean> {
  if (!token || !env.PRIVY_VERIFICATION_KEY || !isAddress(address)) return false
  try {
    const key = await importSPKI(env.PRIVY_VERIFICATION_KEY.replace(/\\n/g, '\n'), 'ES256')
    const { payload } = await jwtVerify(token, key, { issuer: 'privy.io', audience: env.PRIVY_APP_ID, algorithms: ['ES256'] })
    if (payload.sub !== userId || typeof payload.exp !== 'number' || typeof payload.linked_accounts !== 'string') return false
    const accounts: unknown = JSON.parse(payload.linked_accounts)
    return Array.isArray(accounts) && accounts.some(account => account && account.type === 'wallet'
      && account.chain_type === 'ethereum' && ['privy', 'privy_v2'].includes(account.wallet_client_type)
      && typeof account.address === 'string' && account.address.toLowerCase() === address.toLowerCase())
  } catch { return false }
}

async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new FundingError('invalid_request', 400)
  const reader = request.body?.getReader()
  if (!reader) throw new FundingError('invalid_request', 400)
  let text = '', size = 0
  const decoder = new TextDecoder()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 1024) { await reader.cancel(); throw new FundingError('request_too_large', 413) }
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
  } finally { reader.releaseLock() }
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error()
    return value
  } catch { throw new FundingError('invalid_request', 400) }
}

export async function handleDepositRequest(request: Request, env: Env, userId: string): Promise<Response> {
  try {
    const url = new URL(request.url), path = url.pathname
    if (request.method === 'POST') {
      if (request.headers.get('Origin') !== url.origin) throw new FundingError('invalid_origin', 403)
      if (request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new FundingError('invalid_origin', 403)
    }
    const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName(userId))
    if (path === '/api/deposits/config') {
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)
      let config: DepositConfig
      try {
        const credentials = getMoonPayCredentials(env)
        config = { ready: true, mode: credentials.mode, reason: null, fiatCurrencies: await getFiatOptions(credentials) }
      } catch (error) {
        config = { ready: false, mode: env.MOONPAY_ENVIRONMENT === 'live' ? 'live' : env.MOONPAY_ENVIRONMENT === 'sandbox' ? 'sandbox' : null,
          reason: error instanceof FundingError ? error.reason : 'provider_unavailable', fiatCurrencies: [] }
      }
      return json(config)
    }
    if (path === '/api/deposits' && request.method === 'GET') return stub.fetch(new Request('https://account.internal/deposits', { headers: { 'X-Privy-DID': userId } }))
    const match = /^\/api\/deposits\/([a-f0-9-]+)$/.exec(path)
    if (match && validId(match[1]) && request.method === 'GET') return stub.fetch(new Request(`https://account.internal/deposits/${match[1]}`, { headers: { 'X-Privy-DID': userId } }))
    if (path !== '/api/deposits/checkout') return json({ error: 'not_found' }, 404)
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
    const credentials = getMoonPayCredentials(env)
    const input = await body(request)
    if (typeof input.walletAddress !== 'string' || !isAddress(input.walletAddress)) throw new FundingError('invalid_wallet', 400)
    if (!await verifyWalletIdentity(request.headers.get('privy-id-token'), env, userId, input.walletAddress)) throw new FundingError('wallet_not_verified', 403)
    const ip = customerIp(request)
    if (!ip) throw new FundingError('connection_unverified', 400)
    if (url.protocol !== 'https:') throw new FundingError('https_required')
    const options = await getFiatOptions(credentials)
    if (input.sessionId !== undefined && (typeof input.sessionId !== 'string' || !validId(input.sessionId))) throw new FundingError('invalid_session', 400)
    const amount = input.sessionId ? {} : validateFiatAmount(input.amount, input.fiatCurrency, options)
    // The stable external customer ID is pseudonymous, not a raw Privy DID.
    const customerId = (await hmac(userId, env.PRIVY_APP_ID)).replace(/[^a-zA-Z0-9]/g, '')
    return stub.fetch(new Request('https://account.internal/deposits/checkout', {
      method: 'POST', headers: { 'X-Privy-DID': userId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...amount, sessionId: input.sessionId, walletAddress: input.walletAddress, customerId, ip,
        origin: url.origin, theme: input.theme === 'dark' ? 'dark' : 'light' }),
    }))
  } catch (error) {
    return json({ error: error instanceof FundingError ? error.reason : 'provider_unavailable' }, error instanceof FundingError ? error.status : 503)
  }
}

// Called only for the authenticated user, within the hosting adapter's
// serialized or atomic storage update.
export async function handleStoredDeposits(request: Request, env: FundingEnv, storage: Store): Promise<Response> {
  try {
    const path = new URL(request.url).pathname
    const sessions = await storage.get<DepositSession[]>('deposits') ?? []
    if (path === '/deposits' && request.method === 'GET') return json({ sessions })
    const credentials = getMoonPayCredentials(env)
    if (path === '/deposits/checkout' && request.method === 'POST') {
      const times = (await storage.get<number[]>('depositTimes') ?? []).filter(time => time > Date.now() - 60_000)
      if (times.length >= 3) throw new FundingError('rate_limited', 429)
      const input = await request.json() as { sessionId?: string; walletAddress: string; amount: string; fiatCurrency: string; customerId: string; ip: string; origin: string; theme: 'dark' | 'light' }
      let session = input.sessionId ? sessions.find(item => item.id === input.sessionId) : undefined
      if (input.sessionId && (!session || isDepositTerminal(session.status) || session.walletAddress.toLowerCase() !== input.walletAddress.toLowerCase()
        || session.mode !== credentials.mode || (session.currencyCode ?? BSC_USDT.currencyCode) !== checkoutAsset(credentials.mode).currencyCode
        || session.customerId !== input.customerId)) throw new FundingError('invalid_session', 409)
      if (!session) {
        if (sessions.filter(item => !isDepositTerminal(item.status)).length >= 10) throw new FundingError('too_many_pending', 409)
        session = { id: crypto.randomUUID(), customerId: input.customerId, walletAddress: input.walletAddress, amount: input.amount, fiatCurrency: input.fiatCurrency,
          mode: credentials.mode, currencyCode: checkoutAsset(credentials.mode).currencyCode,
          status: 'awaiting_payment', createdAt: new Date().toISOString(), checkedAt: null,
          transactionId: null, transactionHash: null, receivedAmount: null }
      }
      const checkoutUrl = await createCheckoutUrl(credentials, session, input.origin, input.ip, input.theme)
      if (!input.sessionId) {
        sessions.unshift(session)
        // Retain pending/expired sessions plus 20 finalized payment records.
        let terminal = 0
        await storage.put('deposits', sessions.filter(item => !isDepositTerminal(item.status) || item.status === 'expired' || terminal++ < 20))
      }
      await storage.put('depositTimes', [...times, Date.now()])
      return json({ session, checkoutUrl })
    }
    const match = /^\/deposits\/([a-f0-9-]+)$/.exec(path)
    const session = match && validId(match[1]) ? sessions.find(item => item.id === match[1]) : undefined
    if (!session || request.method !== 'GET') return json({ error: 'not_found' }, 404)
    // A local inactivity timeout does not cancel a signed provider checkout.
    // Continue checking expired records so late payments can be confirmed.
    if (isDepositTerminal(session.status) && session.status !== 'expired' || session.checkedAt && Date.now() - Date.parse(session.checkedAt) < 15_000) return json({ session })
    const checkTimes = (await storage.get<number[]>('depositCheckTimes') ?? []).filter(time => time > Date.now() - 60_000)
    if (checkTimes.length >= 12) throw new FundingError('rate_limited', 429)
    await storage.put('depositCheckTimes', [...checkTimes, Date.now()])
    const updated = await checkDeposit(session, credentials)
    await storage.put('deposits', sessions.map(item => item.id === updated.id ? updated : item))
    return json({ session: updated })
  } catch (error) {
    return json({ error: error instanceof FundingError ? error.reason : 'provider_unavailable' }, error instanceof FundingError ? error.status : 503)
  }
}
