import type { AccountNamespace } from './env.ts'
import { verifyWalletIdentity, WalletVerificationError } from './wallet-verification.ts'
export { verifyWalletIdentity } from './wallet-verification.ts'
import { isAddress } from 'viem'
import { BSC_USDT, checkoutAsset, depositProvider, type DepositConfig, type DepositSession, isDepositTerminal } from '../lib/funding.ts'
import { checkDeposit, createCheckoutUrl, customerIp, FundingError, getFiatOptions, getMoonPayCredentials, hmac, validateFiatAmount, type FundingEnv } from './moonpay.ts'
import { applyOnramperEvent, checkOnramperDeposit, createOnramperCheckoutUrl, createPartnerContext, getOnramperCredentials, getOnramperMode } from './onramper.ts'

type Store = {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
}
type Env = FundingEnv & { ACCOUNTS: AccountNamespace }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const validId = (value: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)

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
        if (env.CARD_FUNDING_PROVIDER === 'moonpay') {
          const credentials = getMoonPayCredentials(env)
          config = { ready: true, mode: credentials.mode, reason: null, fiatCurrencies: await getFiatOptions(credentials) }
        } else {
          const credentials = await getOnramperCredentials(env)
          config = { provider: 'onramper', ready: true, mode: credentials.mode, reason: null, fiatCurrencies: [] }
        }
      } catch (error) {
        const legacy = env.CARD_FUNDING_PROVIDER === 'moonpay'
        const mode = legacy ? env.MOONPAY_ENVIRONMENT : getOnramperMode(env)
        config = { ...(legacy ? {} : { provider: 'onramper' as const }), ready: false, mode: mode === 'live' ? 'live' : mode === 'sandbox' ? 'sandbox' : null,
          reason: error instanceof FundingError ? error.reason : 'provider_unavailable', fiatCurrencies: [] }
      }
      return json(config)
    }
    if (path === '/api/deposits' && request.method === 'GET') return stub.fetch(new Request('https://account.internal/deposits', { headers: { 'X-Privy-DID': userId } }))
    const match = /^\/api\/deposits\/([a-f0-9-]+)$/.exec(path)
    if (match && validId(match[1]) && request.method === 'GET') return stub.fetch(new Request(`https://account.internal/deposits/${match[1]}`, { headers: { 'X-Privy-DID': userId } }))
    if (path !== '/api/deposits/checkout') return json({ error: 'not_found' }, 404)
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
    const provider = env.CARD_FUNDING_PROVIDER === 'moonpay' ? 'moonpay' : 'onramper'
    const credentials = provider === 'moonpay' ? getMoonPayCredentials(env) : null
    if (provider === 'onramper') await getOnramperCredentials(env)
    const input = await body(request)
    if (typeof input.walletAddress !== 'string' || !isAddress(input.walletAddress)) throw new FundingError('invalid_wallet', 400)
    if (!await verifyWalletIdentity(request.headers.get('privy-id-token'), env, userId, input.walletAddress)) throw new FundingError('wallet_not_verified', 403)
    const ip = customerIp(request)
    if (provider === 'moonpay' && !ip) throw new FundingError('connection_unverified', 400)
    if (url.protocol !== 'https:') throw new FundingError('https_required')
    const options = credentials ? await getFiatOptions(credentials) : []
    if (input.sessionId !== undefined && (typeof input.sessionId !== 'string' || !validId(input.sessionId))) throw new FundingError('invalid_session', 400)
    if (provider === 'onramper' && (input.amount !== undefined || input.fiatCurrency !== undefined)) throw new FundingError('invalid_request', 400)
    const amount = input.sessionId ? {} : input.amount === undefined && input.fiatCurrency === undefined
      ? { amount: '', fiatCurrency: '', amountSelection: provider }
      : validateFiatAmount(input.amount, input.fiatCurrency, options)
    // The stable external customer ID is pseudonymous, not a raw Privy DID.
    const customerId = (await hmac(userId, env.PRIVY_APP_ID)).replace(/[^a-zA-Z0-9]/g, '')
    return stub.fetch(new Request('https://account.internal/deposits/checkout', {
      method: 'POST', headers: { 'X-Privy-DID': userId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...amount, sessionId: input.sessionId, walletAddress: input.walletAddress, customerId, ip,
        origin: url.origin, theme: input.theme === 'dark' ? 'dark' : 'light' }),
    }))
  } catch (error) {
    if (error instanceof WalletVerificationError) return json({ error: error.message }, error.status)
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
    if (path === '/deposits/onramper-event' && request.method === 'POST') {
      const input = await request.json() as { sessionId: string; event: Record<string, unknown> }
      const session = sessions.find(item => item.id === input.sessionId)
      if (!session) throw new FundingError('invalid_session', 404)
      const updated = applyOnramperEvent(session, input.event, env.ONRAMPER_API_KEY?.trim() ?? '')
      if (updated.transactionHash && sessions.some(item => item.id !== updated.id && item.transactionHash === updated.transactionHash)) throw new FundingError('transaction_mismatch', 409)
      await storage.put('deposits', sessions.map(item => item.id === updated.id ? updated : item))
      return json({ received: true })
    }
    if (path === '/deposits/checkout' && request.method === 'POST') {
      const provider = env.CARD_FUNDING_PROVIDER === 'moonpay' ? 'moonpay' : 'onramper'
      const onramper = provider === 'onramper' ? await getOnramperCredentials(env) : null
      const credentials = provider === 'moonpay' ? getMoonPayCredentials(env) : null
      const mode = onramper?.mode ?? credentials!.mode
      const times = (await storage.get<number[]>('depositTimes') ?? []).filter(time => time > Date.now() - 60_000)
      if (times.length >= 3) throw new FundingError('rate_limited', 429)
      const input = await request.json() as { sessionId?: string; walletAddress: string; amount: string; fiatCurrency: string; amountSelection?: 'moonpay' | 'onramper'; customerId: string; ip: string; origin: string; theme: 'dark' | 'light' }
      let session = input.sessionId ? sessions.find(item => item.id === input.sessionId) : undefined
      if (input.sessionId && (!session || isDepositTerminal(session.status) || session.walletAddress.toLowerCase() !== input.walletAddress.toLowerCase()
        || depositProvider(session) !== provider || session.mode !== mode || (session.currencyCode ?? BSC_USDT.currencyCode) !== checkoutAsset(mode, provider).currencyCode
        || session.customerId !== input.customerId)) throw new FundingError('invalid_session', 409)
      if (!session) {
        if (sessions.filter(item => !isDepositTerminal(item.status)).length >= 10) throw new FundingError('too_many_pending', 409)
        session = { id: crypto.randomUUID(), customerId: input.customerId, walletAddress: input.walletAddress, amount: input.amount, fiatCurrency: input.fiatCurrency,
          mode, currencyCode: checkoutAsset(mode, provider).currencyCode,
          ...(provider === 'onramper' ? { provider: 'onramper' as const, providerCryptoId: onramper!.cryptoId, amountSelection: 'onramper' as const }
            : input.amountSelection === 'moonpay' ? { amountSelection: 'moonpay' as const } : {}),
          status: 'awaiting_payment', createdAt: new Date().toISOString(), checkedAt: null,
          transactionId: null, transactionHash: null, receivedAmount: null }
        if (onramper) session.partnerContext = await createPartnerContext(request.headers.get('X-Privy-DID') ?? '', session.id, onramper.webhookSecret)
      }
      const checkoutUrl = onramper ? await createOnramperCheckoutUrl(onramper, session, input.origin, input.theme)
        : await createCheckoutUrl(credentials!, session, input.origin, input.ip, input.theme)
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
    const updated = depositProvider(session) === 'onramper' ? await checkOnramperDeposit(session) : await checkDeposit(session, getMoonPayCredentials(env))
    await storage.put('deposits', sessions.map(item => item.id === updated.id ? updated : item))
    return json({ session: updated })
  } catch (error) {
    return json({ error: error instanceof FundingError ? error.reason : 'provider_unavailable' }, error instanceof FundingError ? error.status : 503)
  }
}
