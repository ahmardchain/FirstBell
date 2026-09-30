export type BinanceCredentials = { apiKey: string; secretKey: string }
export type BinanceFailure = 'provider_auth_error' | 'rate_limited' | 'provider_error'
type Json = Record<string, unknown>

export class BinanceApiError extends Error {
  reason: BinanceFailure
  httpStatus?: number
  providerCode?: number
  constructor(reason: BinanceFailure, httpStatus?: number, providerCode?: number) {
    super(`Binance API ${reason}${httpStatus ? ` HTTP ${httpStatus}` : ''}${providerCode !== undefined ? ` code ${providerCode}` : ''}`)
    this.reason = reason
    this.httpStatus = httpStatus
    this.providerCode = providerCode
  }
}

export function binanceFailure(error: unknown) {
  return error instanceof BinanceApiError
    ? { reason: error.reason, httpStatus: error.httpStatus, providerCode: error.providerCode }
    : { reason: 'provider_error' as const }
}

// Sign exactly the bytes sent on the wire, including /build and any POST body.
export async function signPath(at: string, method: string, path: string, body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(at + method + path + body))
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

export async function signedBinanceRequest(method: 'GET' | 'POST', endpoint: string, params: Record<string, string>,
  credentials: BinanceCredentials, body = ''): Promise<Json> {
  const query = Object.entries(params).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
  const path = `/build${endpoint}${query ? `?${query}` : ''}`
  const at = new Date().toISOString()
  const signature = await signPath(at, method, path, body, credentials.secretKey)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(`https://web3.binance.com${path}`, {
      method,
      headers: { 'X-OC-APIKEY': credentials.apiKey, 'X-OC-TIMESTAMP': at, 'X-OC-SIGN': signature,
        'X-OC-NONCE': crypto.randomUUID(), Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body } : {}), signal: controller.signal,
    })
    let result: Json | null = null
    if (Number(response.headers.get('content-length') || 0) > 300_000) throw new BinanceApiError('provider_error', response.status)
    const text = await response.text()
    if (text.length > 300_000) throw new BinanceApiError('provider_error', response.status)
    try {
      const parsed: unknown = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) result = parsed as Json
    } catch { /* HTTP errors can contain HTML instead of JSON. Never forward it. */ }
    const code = typeof result?.code === 'number' && Number.isInteger(result.code) ? result.code : undefined
    if (!response.ok || !result || (result.success !== undefined && result.success !== true) || code !== 0) {
      const reason = response.status === 429 || code === 42900 ? 'rate_limited'
        : response.status === 401 || response.status === 403 || (code !== undefined && ((code >= 40101 && code <= 40104) || (code >= 40301 && code <= 40303)))
          ? 'provider_auth_error' : 'provider_error'
      throw new BinanceApiError(reason, response.status, code)
    }
    return result
  } catch (error) {
    if (error instanceof BinanceApiError) throw error
    throw new BinanceApiError('provider_error')
  } finally { clearTimeout(timer) }
}
