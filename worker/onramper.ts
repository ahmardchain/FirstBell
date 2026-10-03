import { importPKCS8 } from 'jose'
import { createPublicClient, http, isAddress, type Hex } from 'viem'
import { bsc } from 'viem/chains'
import { BSC_USDT, type DepositSession, type FundingMode } from '../lib/funding.ts'
import type { AccountNamespace } from './env.ts'
import { confirmedTransfer, FundingError, type FundingEnv } from './moonpay.ts'

type Credentials = { apiKey: string; privateKey: CryptoKey; webhookSecret: string; cryptoId: string; mode: FundingMode }
const encoder = new TextEncoder()
const client = createPublicClient({ chain: bsc, transport: http('https://bsc-dataseed.bnbchain.org', { timeout: 8_000, retryCount: 0 }) })
const validId = (value: string) => /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
const validUser = (value: string) => /^did:privy:[a-zA-Z0-9_-]{3,128}$/.test(value)
const base64 = (value: Uint8Array) => btoa(String.fromCharCode(...value))
const base64url = (value: Uint8Array) => base64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const decode = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })

export function getOnramperMode(env: FundingEnv): FundingMode | null {
  const declared = env.ONRAMPER_ENVIRONMENT?.trim()
  if (declared === 'sandbox' || declared === 'live') return declared
  if (declared) return null
  // Test keys can only open the simulated .dev environment. Live use still
  // requires an explicit environment choice; mismatched keys are rejected.
  return env.ONRAMPER_API_KEY?.trim().startsWith('pk_test_') ? 'sandbox' : null
}

function missingConfiguration(env: FundingEnv): string[] {
  const names = ['ONRAMPER_API_KEY', 'ONRAMPER_SIGNING_PRIVATE_KEY', 'ONRAMPER_WEBHOOK_SECRET', 'ONRAMPER_BSC_USDT_ID'] as const
  const missing = names.filter(name => !env[name]?.trim()) as string[]
  if (!env.ONRAMPER_ENVIRONMENT?.trim() && !getOnramperMode(env)) missing.push('ONRAMPER_ENVIRONMENT')
  return missing
}

export async function getOnramperSetup(env: FundingEnv) {
  let reason: string | null = null
  try { await getOnramperCredentials(env) }
  catch (error) { reason = error instanceof FundingError ? error.reason : 'invalid_configuration' }
  return { mode: getOnramperMode(env), configured: reason === null, missing: missingConfiguration(env), reason }
}

// Onramper IDs are account catalog values, not MoonPay currency codes. Require
// the exact USDT / BNB Smart Chain ID confirmed during partner onboarding.
export async function getOnramperCredentials(env: FundingEnv): Promise<Credentials> {
  const apiKey = env.ONRAMPER_API_KEY?.trim(), pem = env.ONRAMPER_SIGNING_PRIVATE_KEY?.trim().replace(/\\n/g, '\n')
  const webhookSecret = env.ONRAMPER_WEBHOOK_SECRET?.trim(), cryptoId = env.ONRAMPER_BSC_USDT_ID?.trim()
  if (!apiKey || !pem || !webhookSecret || !cryptoId || missingConfiguration(env).length) throw new FundingError('not_configured')
  const mode = getOnramperMode(env)
  if (!mode || !apiKey.startsWith(mode === 'live' ? 'pk_prod_' : 'pk_test_')
    || !/^[a-z0-9][a-z0-9_-]{0,127}$/.test(cryptoId) || webhookSecret.length < 16) throw new FundingError('invalid_configuration')
  try {
    const privateKey = await importPKCS8(pem, 'EdDSA')
    if (privateKey.algorithm.name !== 'Ed25519') throw new Error()
    return { apiKey, privateKey, webhookSecret, cryptoId, mode: mode as FundingMode }
  } catch { throw new FundingError('invalid_configuration') }
}

async function contextKey(secret: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function createPartnerContext(userId: string, sessionId: string, secret: string): Promise<string> {
  if (!validUser(userId) || !validId(sessionId)) throw new FundingError('invalid_session', 400)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('firstbell-onramper-v1') },
    await contextKey(secret), encoder.encode(JSON.stringify({ userId, sessionId })))
  return `fb1.${base64url(iv)}.${base64url(new Uint8Array(encrypted))}`
}

export async function readPartnerContext(context: string, secret: string): Promise<{ userId: string; sessionId: string }> {
  try {
    if (context.length > 1024 || !/^fb1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(context)) throw new Error()
    const [, nonce, ciphertext] = context.split('.'), iv = decode(nonce)
    if (iv.length !== 12) throw new Error()
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('firstbell-onramper-v1') },
      await contextKey(secret), decode(ciphertext))
    const value = JSON.parse(new TextDecoder().decode(plain)) as { userId: string; sessionId: string }
    if (typeof value.userId !== 'string' || !validUser(value.userId) || typeof value.sessionId !== 'string' || !validId(value.sessionId)) throw new Error()
    return value
  } catch { throw new FundingError('invalid_webhook', 400) }
}

export async function createOnramperCheckoutUrl(credentials: Credentials, session: DepositSession, origin: string, theme: 'dark' | 'light'): Promise<string> {
  if (session.provider !== 'onramper' || session.mode !== credentials.mode || session.currencyCode !== BSC_USDT.currencyCode
    || session.providerCryptoId !== credentials.cryptoId || !session.partnerContext || !isAddress(session.walletAddress)) throw new FundingError('invalid_session', 400)
  const site = new URL(origin)
  if (site.protocol !== 'https:' || site.origin !== origin) throw new FundingError('https_required')
  const redirect = `${origin}/app/?tab=portfolio&deposit=${session.id}`
  const fields: Record<string, string> = {
    apiKey: credentials.apiKey, mode: 'buy', defaultCrypto: credentials.cryptoId, onlyCryptos: credentials.cryptoId,
    wallets: `${credentials.cryptoId}:${session.walletAddress}`, isAddressEditable: 'false',
    defaultPaymentMethod: 'creditcard', redirectAtCheckout: 'true', partnerContext: session.partnerContext,
    successRedirectUrl: redirect, failureRedirectUrl: redirect,
    ...(credentials.mode === 'sandbox' ? { onlyOnramps: 'banxa', defaultFiat: 'eur', onlyFiats: 'eur,gbp' } : {}),
  }
  // V2 signs every core field using form encoding. Amount, fiat and provider
  // remain owned by Onramper in live checkout. No mobile IP binding is imposed.
  const canonical = new URLSearchParams(fields); canonical.sort()
  const timestamp = new Date().toISOString(), nonce = crypto.randomUUID()
  const content = ['ONRAMPER-SIG-V2', timestamp, nonce, 'GET', '/', canonical.toString(), '',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'].join('\n')
  const signature = await crypto.subtle.sign('Ed25519', credentials.privateKey, encoder.encode(content))
  const url = new URL(credentials.mode === 'live' ? 'https://buy.onramper.com/' : 'https://buy.onramper.dev/')
  for (const [name, value] of Object.entries(fields)) url.searchParams.set(name, value)
  url.searchParams.set('themeName', theme)
  url.searchParams.set('sigV2', `v2:${base64(new Uint8Array(signature))}`)
  url.searchParams.set('sigV2Timestamp', timestamp)
  url.searchParams.set('sigV2Nonce', nonce)
  url.searchParams.set('sigV2Expiry', new Date(Date.parse(timestamp) + 15 * 60_000).toISOString())
  url.searchParams.set('sigV2Fields', Object.keys(fields).sort().join(','))
  return url.toString()
}

type Event = Record<string, unknown>
const positiveAmount = (value: unknown): string | null => typeof value === 'number' && Number.isFinite(value) && value >= 1e-18 && value <= 1e9
  ? (value < 1e-6 ? value.toFixed(18).replace(/0+$/, '').replace(/\.$/, '') : value.toString()) : null

export function applyOnramperEvent(session: DepositSession, event: Event, apiKey: string): DepositSession {
  const amount = positiveAmount(event.inAmount), expected = positiveAmount(event.outAmount)
  const date = typeof event.statusDate === 'string' ? Date.parse(event.statusDate) : NaN
  const status = event.status
  if (session.provider !== 'onramper' || event.apiKey !== apiKey || event.partnerContext !== session.partnerContext
    || event.transactionType !== 'buy' || event.targetCurrency !== session.providerCryptoId || event.alternateRouteData != null
    || typeof event.transactionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(event.transactionId)
    || typeof event.sourceCurrency !== 'string' || !/^[a-z]{3}$/.test(event.sourceCurrency) || !amount
    || !Number.isFinite(date) || date > Date.now() + 300_000 || date < Date.parse(session.createdAt) - 300_000
    || !['new', 'pending', 'paid', 'completed', 'canceled', 'failed'].includes(String(status))
    || (event.walletAddress != null && event.walletAddress !== '' && (typeof event.walletAddress !== 'string' || event.walletAddress.toLowerCase() !== session.walletAddress.toLowerCase()))
    || (session.transactionId && session.transactionId !== event.transactionId)
    || (session.amount && (session.amount !== amount || session.fiatCurrency !== event.sourceCurrency))) throw new FundingError('transaction_mismatch', 409)
  // Repeated or older callbacks cannot regress a payment, and a completed
  // receipt stays final even if a provider later emits a pending callback.
  if ((session.providerStatusDate && date < Date.parse(session.providerStatusDate))
    || ['completed', 'test_completed'].includes(session.status)) return session
  if (['confirming', 'failed'].includes(session.status) && status !== 'completed') return session
  if (session.status === 'processing' && status === 'new') return session
  const complete = status === 'completed'
  // Hash and wallet are optional in Onramper's contract. A missing hash leaves
  // live completion confirming; only an independently checked receipt credits it.
  const hash = event.transactionHash
  if (complete && (!expected || (hash != null && hash !== '' && (typeof hash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(hash)))))
    throw new FundingError('transaction_mismatch', 409)
  if (session.transactionHash && complete && hash && session.transactionHash !== hash) throw new FundingError('transaction_mismatch', 409)
  if (session.expectedAmount && complete && session.expectedAmount !== expected) throw new FundingError('transaction_mismatch', 409)
  return { ...session, amount, fiatCurrency: event.sourceCurrency, transactionId: event.transactionId,
    providerStatusDate: new Date(date).toISOString(), checkedAt: null,
    status: complete ? session.mode === 'sandbox' ? 'test_completed' : 'confirming'
      : status === 'canceled' || status === 'failed' ? 'failed' : status === 'paid' || status === 'pending' ? 'processing' : 'awaiting_payment',
    ...(complete && session.mode === 'live' ? { ...(hash ? { transactionHash: hash as string } : {}), expectedAmount: expected! } : {}),
    receivedAmount: null }
}

export async function checkOnramperDeposit(session: DepositSession): Promise<DepositSession> {
  const updated = { ...session, checkedAt: new Date().toISOString() }
  if (updated.status === 'confirming' && updated.mode === 'live' && updated.transactionHash && updated.expectedAmount) {
    try {
      const [chain, receipt, latest] = await Promise.all([client.getChainId(), client.getTransactionReceipt({ hash: updated.transactionHash as Hex }), client.getBlockNumber()])
      if (chain !== BSC_USDT.chainId) throw new Error()
      const received = confirmedTransfer(receipt, latest, updated.walletAddress, updated.expectedAmount)
      if (received) { updated.status = 'completed'; updated.receivedAmount = received }
    } catch { /* Keep pending until a real BSC receipt can be checked. */ }
  }
  if (updated.status === 'awaiting_payment' && Date.now() - Date.parse(updated.createdAt) > 86_400_000) updated.status = 'expired'
  return updated
}

export async function handleOnramperWebhook(request: Request, env: FundingEnv & { ACCOUNTS: AccountNamespace }): Promise<Response> {
  try {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
    const secret = env.ONRAMPER_WEBHOOK_SECRET?.trim(), apiKey = env.ONRAMPER_API_KEY?.trim()
    if (!secret || !apiKey) throw new FundingError('not_configured')
    const signature = request.headers.get('X-Onramper-Webhook-Signature')
    if (!signature || !/^[a-fA-F0-9]{64}$/.test(signature)) throw new FundingError('invalid_signature', 401)
    if (!request.headers.get('Content-Type')?.startsWith('application/json') || !request.body) throw new FundingError('invalid_webhook', 400)
    const reader = request.body.getReader(), chunks: Uint8Array[] = []
    let size = 0
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break
        size += chunk.value.byteLength
        if (size > 16_384) { await reader.cancel(); throw new FundingError('request_too_large', 413) }
        chunks.push(chunk.value)
      }
    } finally { reader.releaseLock() }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const mac = Uint8Array.from(signature.match(/../g)!, pair => parseInt(pair, 16))
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    if (!await crypto.subtle.verify('HMAC', key, mac, bytes)) throw new FundingError('invalid_signature', 401)
    let event: Event
    try {
      const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
      event = parsed as Event
    } catch { throw new FundingError('invalid_webhook', 400) }
    if (event.apiKey !== apiKey || typeof event.partnerContext !== 'string') throw new FundingError('invalid_webhook', 400)
    const context = await readPartnerContext(event.partnerContext, secret)
    const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName(context.userId))
    return stub.fetch(new Request('https://account.internal/deposits/onramper-event', {
      method: 'POST', headers: { 'X-Privy-DID': context.userId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: context.sessionId, event }),
    }))
  } catch (error) {
    return json({ error: error instanceof FundingError ? error.reason : 'invalid_webhook' }, error instanceof FundingError ? error.status : 400)
  }
}
