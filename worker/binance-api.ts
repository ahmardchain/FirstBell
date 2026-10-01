export type BinanceCredentials = { apiKey: string; secretKey: string; supportCaptureUntil?: string }
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

// Redact actual request values before truncating, including common encoded echoes.
// Provider data, headers, HTML and exception messages never enter this helper.
function diagnosticMessage(value: unknown, privateValues: string[]): string | null {
  if (typeof value !== 'string') return null
  const variants = [...new Set(privateValues.filter(Boolean).flatMap(secret => {
    const encoded = encodeURIComponent(secret)
    return [secret, encoded, encoded.replace(/%[0-9A-F]{2}/g, code => code.toLowerCase()), JSON.stringify(secret).slice(1, -1)]
  }))].sort((a, b) => b.length - a.length)
  let message = value
  for (const secret of variants) message = message.replaceAll(secret, '[redacted]')
  return message.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 200)
}

// Temporary support capture: opt-in, expiring, at most once PER ISOLATE/window.
// This is deliberately not a deployment-wide one-shot guarantee.
let capturedSupportExpiry: string | undefined
function captureSupportRequest(method: string, path: string, body: string, at: string, signature: string,
  nonce: string, credentials: BinanceCredentials, response: Response, text: string): void {
  try {
    const until = credentials.supportCaptureUntil
    const expiry = until ? Date.parse(until) : NaN
    if (!until || !Number.isFinite(expiry) || expiry <= Date.now() || expiry - Date.now() > 15 * 60_000
      || capturedSupportExpiry === until || method !== 'POST' || path !== '/build/api/v1/dex/market/price-info'
      || body !== '[{"binanceChainId":"56","tokenContractAddress":"0xA9eE28C80f960B889dFbd1902055218cBa016F75"}]') return

    const variants = [...new Set([credentials.apiKey, credentials.secretKey].filter(Boolean).flatMap(value => {
      const encoded = encodeURIComponent(value)
      return [value, encoded, encoded.replace(/%[0-9A-F]{2}/g, code => code.toLowerCase()), JSON.stringify(value).slice(1, -1)]
    }))].sort((a, b) => b.length - a.length)
    let redacted = false
    const redact = (value: string): string => {
      let safe = value
      for (const secret of variants) safe = safe.replaceAll(secret, '[redacted]')
      if (safe !== value) redacted = true
      return safe
    }
    const headers: Record<string, string> = {}
    const omittedHeaders: string[] = []
    for (const [key, value] of response.headers) {
      if (/^(set-cookie|cookie|authorization|proxy-authorization|x-api-key|x-oc-apikey)$/i.test(key) || /token/i.test(key)) {
        omittedHeaders.push(key)
      } else headers[redact(key)] = redact(value)
    }
    const responseText = redact(text)
    const entry = {
      captureId: 'binance-support-170818889', timestamp: new Date().toISOString(), expires: until,
      scope: 'once-per-isolate-per-expiry',
      request: {
        method, url: `https://web3.binance.com${path}`, body,
        headers: {
          'X-OC-APIKEY': credentials.apiKey.length > 8 ? credentials.apiKey.slice(0, 8) + '…' : '[omitted]',
          'X-OC-TIMESTAMP': at, 'X-OC-SIGN': signature, 'X-OC-NONCE': nonce,
          Accept: 'application/json', 'Content-Type': 'application/json',
        },
      },
      response: { httpStatus: response.status, headers, omittedHeaders, text: responseText, credentialsRedacted: redacted },
    }
    // Do not emit a truncated body and present it as a complete support capture.
    if (new TextEncoder().encode(JSON.stringify(entry)).byteLength > 24_000) return
    capturedSupportExpiry = until
    console.log('BINANCE_CAPTURE', entry)
  } catch { /* Never log exception strings or change the existing response path. */ }
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
  const nonce = crypto.randomUUID()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8_000)
  let httpStatus: number | undefined
  let result: Json | null = null
  let code: number | undefined
  try {
    const response = await fetch(`https://web3.binance.com${path}`, {
      method,
      headers: { 'X-OC-APIKEY': credentials.apiKey, 'X-OC-TIMESTAMP': at, 'X-OC-SIGN': signature,
        'X-OC-NONCE': nonce, Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body } : {}), signal: controller.signal,
    })
    httpStatus = response.status
    if (Number(response.headers.get('content-length') || 0) > 300_000) throw new BinanceApiError('provider_error', response.status)
    const text = await response.text()
    if (text.length > 300_000) throw new BinanceApiError('provider_error', response.status)
    captureSupportRequest(method, path, body, at, signature, nonce, credentials, response, text)
    try {
      const parsed: unknown = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) result = parsed as Json
    } catch { /* HTTP errors can contain HTML instead of JSON. Never forward it. */ }
    code = typeof result?.code === 'number' && Number.isInteger(result.code) ? result.code : undefined
    if (!response.ok || !result || (result.success !== undefined && result.success !== true) || code !== 0) {
      const reason = response.status === 429 || code === 42900 ? 'rate_limited'
        : response.status === 401 || response.status === 403 || (code !== undefined && ((code >= 40101 && code <= 40104) || (code >= 40301 && code <= 40303)))
          ? 'provider_auth_error' : 'provider_error'
      throw new BinanceApiError(reason, response.status, code)
    }
    return result
  } catch (error) {
    const failure = error instanceof BinanceApiError ? error : new BinanceApiError('provider_error')
    try {
      const privateValues = [credentials.apiKey, credentials.secretKey, signature, nonce]
      console.warn('BINANCE_DIAG', {
        source: 'binance-web3', method,
        path: diagnosticMessage('/build' + endpoint.split(/[?#]/, 1)[0], privateValues),
        requestTimestamp: at, httpStatus: httpStatus ?? null, providerCode: code ?? null,
        reason: failure.reason,
        msg: diagnosticMessage(typeof result?.msg === 'string' ? result.msg : result?.message,
          [...privateValues, path, query, body, ...Object.values(params)]),
      })
    } catch { /* Diagnostics must not change the existing public failure behavior. */ }
    throw failure
  } finally { clearTimeout(timer) }
}
