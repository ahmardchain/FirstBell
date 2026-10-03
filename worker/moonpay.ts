import { createPublicClient, decodeEventLog, erc20Abi, formatUnits, http, isAddress, parseUnits, type Hex } from 'viem'
import { bsc } from 'viem/chains'
import { BSC_USDT, checkoutAsset, type DepositSession, type FiatOption, type FundingMode } from '../lib/funding.ts'

export type FundingEnv = {
  MOONPAY_PUBLISHABLE_KEY?: string
  MOONPAY_SECRET_KEY?: string
  MOONPAY_ENVIRONMENT?: string
  PRIVY_APP_ID: string
  PRIVY_VERIFICATION_KEY?: string
}
export type MoonPayCredentials = { publishableKey: string; secretKey: string; mode: FundingMode }
type Json = Record<string, unknown>
const object = (value: unknown): Json | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : null
const currenciesCache = new Map<string, { expires: number; currencies: unknown[] }>()
const client = createPublicClient({ chain: bsc, transport: http('https://bsc-dataseed.bnbchain.org', { timeout: 8_000, retryCount: 0 }) })

export class FundingError extends Error {
  reason: string
  status: number
  constructor(reason: string, status = 503) { super(reason); this.reason = reason; this.status = status }
}

export function getMoonPayCredentials(env: FundingEnv): MoonPayCredentials {
  if (!env.MOONPAY_PUBLISHABLE_KEY || !env.MOONPAY_SECRET_KEY) throw new FundingError('not_configured')
  const mode = env.MOONPAY_ENVIRONMENT
  if (mode !== 'sandbox' && mode !== 'live') throw new FundingError('invalid_configuration')
  const suffix = mode === 'live' ? 'live' : 'test'
  if (!env.MOONPAY_PUBLISHABLE_KEY.startsWith(`pk_${suffix}_`) || !env.MOONPAY_SECRET_KEY.startsWith(`sk_${suffix}_`)) throw new FundingError('invalid_configuration')
  return { publishableKey: env.MOONPAY_PUBLISHABLE_KEY, secretKey: env.MOONPAY_SECRET_KEY, mode }
}

export async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return btoa(String.fromCharCode(...new Uint8Array(signed)))
}

export async function signWidgetUrl(url: string, secret: string): Promise<string> {
  return `${url}&signature=${encodeURIComponent(await hmac(new URL(url).search, secret))}`
}

export function canonicalIp(input: string | null): string | null {
  if (!input) return null
  let value = input.trim()
  if (value.startsWith('[')) value = value.slice(1, value.indexOf(']'))
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(value)) value = value.split(':')[0]
  if (/^\d+\.\d+\.\d+\.\d+$/.test(value)) {
    const bytes = value.split('.').map(Number)
    return bytes.every(byte => byte >= 0 && byte <= 255) ? bytes.join('.') : null
  }
  try {
    const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1)
    const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized)
    if (mapped) {
      const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16)
      return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
    }
    return normalized || null
  } catch { return null }
}

export function customerIp(request: Request): string | null {
  // Cloudflare supplies these headers at the edge. Never use X-Forwarded-For
  // or accept an IP in the JSON body. Prefer True-Client-IP when it agrees
  // with Cloudflare's address; restore the real IPv6 under Pseudo IPv4.
  const cf = canonicalIp(request.headers.get('CF-Connecting-IP'))
  const v6 = canonicalIp(request.headers.get('CF-Connecting-IPv6'))
  const actual = cf && Number(cf.split('.')[0]) >= 240 && cf.includes('.') ? v6 : cf
  const preferred = canonicalIp(request.headers.get('True-Client-IP'))
  return preferred && preferred === actual ? preferred : actual
}

async function providerGet(path: string, publishableKey: string): Promise<unknown> {
  const url = new URL(path, 'https://api.moonpay.com')
  url.searchParams.set('apiKey', publishableKey)
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) })
  if (response.status === 404 && path.startsWith('/v1/transactions/ext/')) return []
  if (!response.ok) throw new FundingError('provider_unavailable')
  const body = await response.text()
  if (body.length > 1_500_000) throw new FundingError('provider_unavailable')
  try { return JSON.parse(body) } catch { throw new FundingError('provider_unavailable') }
}

export function matchesBscUsdt(value: unknown): boolean {
  const currency = object(value), metadata = object(currency?.metadata)
  return currency?.type === 'crypto' && currency.code === BSC_USDT.currencyCode
    && String(metadata?.chainId) === String(BSC_USDT.chainId)
    && typeof metadata?.contractAddress === 'string'
    && metadata.contractAddress.toLowerCase() === BSC_USDT.address
}

export function matchesCheckoutAsset(value: unknown, mode: FundingMode): boolean {
  if (mode === 'live') return matchesBscUsdt(value)
  const currency = object(value), metadata = object(currency?.metadata)
  return currency?.type === 'crypto' && currency.code === 'eth'
    && String(metadata?.chainId) === '1' && metadata?.networkCode === 'ethereum'
    && metadata?.contractAddress === '0x0000000000000000000000000000000000000000'
}

export async function getFiatOptions(credentials: MoonPayCredentials): Promise<FiatOption[]> {
  let cached = currenciesCache.get(credentials.publishableKey)
  if (!cached || cached.expires <= Date.now()) {
    const result = await providerGet('/v3/currencies?show=enabled', credentials.publishableKey)
    if (!Array.isArray(result)) throw new FundingError('provider_unavailable')
    cached = { expires: Date.now() + 180_000, currencies: result }
    currenciesCache.set(credentials.publishableKey, cached)
  }
  const asset = cached.currencies.map(object).find(currency => matchesCheckoutAsset(currency, credentials.mode))
  if (!asset || asset.isSuspended !== false) throw new FundingError(credentials.mode === 'sandbox' ? 'sandbox_asset_unavailable' : 'asset_unavailable')
  if (credentials.mode === 'sandbox' && asset.supportsTestMode !== true) throw new FundingError('sandbox_asset_unavailable')
  if (credentials.mode === 'live' && asset.supportsLiveMode === false) throw new FundingError('asset_unavailable')
  const fiats = cached.currencies.map(object).filter((currency): currency is Json => Boolean(currency && currency.type === 'fiat'
    && typeof currency.code === 'string' && /^[a-z]{3}$/.test(currency.code)
    && (credentials.mode === 'live' || ['usd', 'gbp'].includes(currency.code))
    && currency.isSuspended !== true && typeof currency.minBuyAmount === 'number' && typeof currency.maxBuyAmount === 'number'
    && Number.isFinite(currency.minBuyAmount) && Number.isFinite(currency.maxBuyAmount)
    && currency.minBuyAmount > 0 && currency.maxBuyAmount >= currency.minBuyAmount))
    .map(currency => ({ code: currency.code as string, name: typeof currency.name === 'string' ? currency.name : String(currency.code), min: Math.ceil(currency.minBuyAmount as number), max: Math.floor(currency.maxBuyAmount as number) }))
  if (!fiats.length) throw new FundingError('asset_unavailable')
  return fiats.sort((a, b) => a.code === 'usd' ? -1 : b.code === 'usd' ? 1 : a.code.localeCompare(b.code))
}

export function validateFiatAmount(amount: unknown, code: unknown, options: FiatOption[]): { amount: string; fiatCurrency: string } {
  if (typeof amount !== 'string' || !/^[1-9]\d{0,8}$/.test(amount) || typeof code !== 'string') throw new FundingError('invalid_amount', 400)
  const option = options.find(fiat => fiat.code === code)
  if (!option || Number(amount) < option.min || Number(amount) > option.max) throw new FundingError('invalid_amount', 400)
  return { amount, fiatCurrency: code }
}

export async function createCheckoutUrl(credentials: MoonPayCredentials, session: DepositSession, origin: string, ip: string, theme: 'dark' | 'light'): Promise<string> {
  const asset = checkoutAsset(credentials.mode)
  if (!isAddress(session.walletAddress) || session.mode !== credentials.mode
    || (session.currencyCode ?? BSC_USDT.currencyCode) !== asset.currencyCode) throw new FundingError('invalid_session', 400)
  const redirect = new URL('/app/', origin)
  if (redirect.protocol !== 'https:') throw new FundingError('https_required')
  redirect.searchParams.set('tab', 'portfolio')
  redirect.searchParams.set('deposit', session.id)
  const params = new URLSearchParams({
    apiKey: credentials.publishableKey,
    currencyCode: asset.currencyCode,
    walletAddress: session.walletAddress,
    ...(session.amountSelection === 'moonpay' ? {} : {
      baseCurrencyCode: session.fiatCurrency,
      baseCurrencyAmount: session.amount,
      lockAmount: 'true',
      paymentMethod: 'credit_debit_card',
    }),
    externalTransactionId: session.id,
    externalCustomerId: session.customerId,
    redirectURL: redirect.toString(),
    theme,
    allowedIpAddress: await hmac(ip, credentials.secretKey),
  })
  const base = credentials.mode === 'live' ? 'https://buy.moonpay.com/' : 'https://buy-sandbox.moonpay.com/'
  return signWidgetUrl(`${base}?${params.toString()}`, credentials.secretKey)
}

export function normalizeTransaction(value: unknown, session: DepositSession): DepositSession & { expectedAmount?: string | null } {
  // The endpoint describes an array but its OpenAPI response shows one object.
  // Accept both shapes. Multiple orders are ambiguous and require review.
  const rows = Array.isArray(value) ? value : [value]
  if (!rows.length) return session
  if (rows.length !== 1) throw new FundingError('ambiguous_transaction')
  const transaction = object(rows[0]), baseCurrency = object(transaction?.baseCurrency)
  const providerSelection = session.amountSelection === 'moonpay' && !session.transactionId
  const fiatAmount = transaction?.baseCurrencyAmount
  const validProviderAmount = (typeof fiatAmount === 'number' || typeof fiatAmount === 'string')
    && /^\d{1,9}(?:\.\d{1,8})?$/.test(String(fiatAmount)) && Number(fiatAmount) > 0
    && typeof baseCurrency?.code === 'string' && /^[a-z]{3}$/.test(baseCurrency.code)
    && (session.mode !== 'sandbox' || ['usd', 'gbp'].includes(baseCurrency.code))
  if (!transaction || transaction.externalTransactionId !== session.id || transaction.externalCustomerId !== session.customerId
    || typeof transaction.walletAddress !== 'string' || transaction.walletAddress.toLowerCase() !== session.walletAddress.toLowerCase()
    || (session.currencyCode ?? BSC_USDT.currencyCode) !== checkoutAsset(session.mode).currencyCode
    || !matchesCheckoutAsset(transaction.currency, session.mode)
    || (providerSelection ? !validProviderAmount : baseCurrency?.code !== session.fiatCurrency
      || Number(transaction.baseCurrencyAmount) !== Number(session.amount))
    || typeof transaction.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(transaction.id)) throw new FundingError('transaction_mismatch')
  if (session.transactionId && transaction.id !== session.transactionId) throw new FundingError('transaction_mismatch')
  const statuses = { waitingAuthorization: 'action_required', waitingPayment: 'processing', pending: 'processing', failed: 'failed', completed: 'confirming' } as const
  if (typeof transaction.status !== 'string' || !Object.hasOwn(statuses, transaction.status)) throw new FundingError('provider_unavailable')
  const hash = typeof transaction.cryptoTransactionId === 'string' && /^0x[a-fA-F0-9]{64}$/.test(transaction.cryptoTransactionId) ? transaction.cryptoTransactionId : null
  const quote = transaction.quoteCurrencyAmount
  const amount = (typeof quote === 'number' || typeof quote === 'string') && /^\d+(?:\.\d{1,18})?$/.test(String(quote)) && Number(quote) > 0 ? String(quote) : null
  return { ...session, ...(providerSelection ? { amount: String(fiatAmount), fiatCurrency: baseCurrency!.code as string } : {}),
    transactionId: transaction.id, transactionHash: hash, receivedAmount: null,
    status: statuses[transaction.status as keyof typeof statuses],
    ...(transaction.status === 'completed' && session.mode === 'sandbox' ? { status: 'test_completed' as const } : {}),
    // Keep the quote private to this check until its transfer is verified.
    expectedAmount: amount,
  }
}

export function confirmedTransfer(receipt: { status: string; blockNumber: bigint; logs: readonly { address: string; data: Hex; topics: readonly Hex[] }[] }, latest: bigint, address: string, expectedAmount: string): string | null {
  if (receipt.status !== 'success' || latest < receipt.blockNumber + 2n) return null
  let total = 0n
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== BSC_USDT.address) continue
    try {
      const event = decodeEventLog({ abi: erc20Abi, eventName: 'Transfer', data: log.data, topics: log.topics as [Hex, ...Hex[]] })
      if (event.args.to?.toLowerCase() === address.toLowerCase() && typeof event.args.value === 'bigint') total += event.args.value
    } catch { /* Ignore logs that are not a valid USDT Transfer. */ }
  }
  return total > 0n && total >= parseUnits(expectedAmount, BSC_USDT.decimals) ? formatUnits(total, BSC_USDT.decimals) : null
}

export async function checkDeposit(session: DepositSession, credentials: MoonPayCredentials): Promise<DepositSession> {
  if (session.mode !== credentials.mode || (session.currencyCode ?? BSC_USDT.currencyCode) !== checkoutAsset(credentials.mode).currencyCode)
    throw new FundingError('environment_changed')
  const data = await providerGet(`/v1/transactions/ext/${encodeURIComponent(session.id)}`, credentials.publishableKey)
  const normalized = normalizeTransaction(data, session)
  const { expectedAmount, ...result } = normalized
  if (result.status === 'confirming' && result.transactionHash && expectedAmount && result.mode === 'live') {
    try {
      const [chain, receipt, latest] = await Promise.all([
        client.getChainId(), client.getTransactionReceipt({ hash: result.transactionHash as Hex }), client.getBlockNumber(),
      ])
      if (chain !== BSC_USDT.chainId) throw new FundingError('chain_unavailable')
      const received = confirmedTransfer(receipt, latest, result.walletAddress, expectedAmount)
      if (received) { result.status = 'completed'; result.receivedAmount = received }
    } catch { /* Retry confirmation later; never credit a missing or failed receipt. */ }
  }
  if (result.status === 'awaiting_payment' && Date.now() - Date.parse(result.createdAt) > 86_400_000) result.status = 'expired'
  return { ...result, checkedAt: new Date().toISOString() }
}
