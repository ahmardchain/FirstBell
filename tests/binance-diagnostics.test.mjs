import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { BinanceApiError, binanceFailure, signedBinanceRequest } from '../worker/binance-api.ts'

const originalFetch = globalThis.fetch
const originalWarn = console.warn
const credentials = { apiKey: 'BX-private-api-key-123456789', secretKey: 'private/secret+value="quoted"' }
afterEach(() => { globalThis.fetch = originalFetch; console.warn = originalWarn })

function capture() {
  const entries = []
  console.warn = (marker, entry) => {
    assert.equal(marker, 'BINANCE_DIAG')
    entries.push(entry)
  }
  return entries
}

test('concurrent endpoint failures log their own signed timestamps with credential and request echoes redacted', async () => {
  const entries = capture()
  const requests = []
  const privateQuery = 'never-record-query-value'
  const body = JSON.stringify({ marker: 'never-record-request-body' })
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    const values = [credentials.apiKey, credentials.secretKey, options.headers['X-OC-SIGN'], options.headers['X-OC-NONCE'],
      encodeURIComponent(credentials.secretKey), encodeURIComponent(credentials.secretKey).replace(/%[0-9A-F]{2}/g, code => code.toLowerCase()),
      JSON.stringify(credentials.secretKey).slice(1, -1), url, options.body ?? '', new URL(url).searchParams.get('debug') ?? '']
    return Response.json({ code: 40304, msg: 'Restricted\u0007 ' + values.join(' '), data: { rawProviderData: credentials.secretKey } })
  }
  const results = await Promise.allSettled([
    signedBinanceRequest('GET', '/api/v1/dex/market/candles', { debug: privateQuery }, credentials),
    signedBinanceRequest('POST', '/api/v1/dex/market/price-info', {}, credentials, body),
  ])
  assert.equal(entries.length, 2)
  assert.deepEqual(new Set(entries.map(entry => entry.path)), new Set(['/build/api/v1/dex/market/candles', '/build/api/v1/dex/market/price-info']))
  for (const [index, result] of results.entries()) {
    assert.equal(result.status, 'rejected')
    assert.deepEqual(binanceFailure(result.reason), { reason: 'provider_error', httpStatus: 200, providerCode: 40304 })
    const request = requests[index]
    const entry = entries.find(value => value.method === request.options.method)
    assert.equal(entry.requestTimestamp, request.options.headers['X-OC-TIMESTAMP'])
    assert.equal(entry.httpStatus, 200)
    assert.equal(entry.providerCode, 40304)
    assert.equal(entry.reason, 'provider_error')
    assert.ok(entry.msg.startsWith('Restricted '))
    assert.ok(entry.msg.length <= 200)
    assert.ok(!/[\u0000-\u001f\u007f-\u009f]/.test(entry.msg))
    const logged = JSON.stringify(entry)
    for (const secret of [credentials.apiKey, credentials.secretKey, encodeURIComponent(credentials.secretKey),
      request.options.headers['X-OC-SIGN'], request.options.headers['X-OC-NONCE'], privateQuery, 'never-record-request-body', 'rawProviderData']) {
      assert.ok(!logged.includes(secret), 'private request/provider value leaked')
    }
    assert.ok(!JSON.stringify(binanceFailure(result.reason)).includes('Restricted'))
  }
})

test('code-only successes stay accepted and quiet, while explicit false and missing codes still fail', async () => {
  const entries = capture()
  for (const response of [{ code: 0, data: [] }, { code: 0, success: true, data: [] }]) {
    globalThis.fetch = async () => Response.json(response)
    assert.deepEqual(await signedBinanceRequest('GET', '/api/v1/dex/market/candles', {}, credentials), response)
  }
  assert.equal(entries.length, 0)
  for (const response of [{ code: 0, success: false, msg: 'Rejected' }, { message: 'Missing code' }, null]) {
    globalThis.fetch = async () => Response.json(response)
    await assert.rejects(() => signedBinanceRequest('GET', '/api/v1/dex/market/candles', {}, credentials), BinanceApiError)
  }
  assert.equal(entries.length, 3)
  assert.equal(entries[0].providerCode, 0)
  assert.equal(entries[0].msg, 'Rejected')
  assert.equal(entries[1].providerCode, null)
  assert.equal(entries[1].msg, 'Missing code')
  assert.equal(entries[2].msg, null)
})

test('HTML, oversized bodies and network exceptions produce fixed diagnostics without raw content', async () => {
  const entries = capture()
  for (const fetcher of [
    async () => new Response('<html>RAW_HTML ' + credentials.secretKey + '</html>', { status: 403 }),
    async () => new Response('RAW_OVERSIZE ' + credentials.secretKey, { headers: { 'Content-Length': '300001' } }),
    async () => new Response(JSON.stringify({ code: 40304, msg: credentials.secretKey + 'x'.repeat(300001) })),
    async () => { throw new Error('RAW_EXCEPTION ' + credentials.secretKey) },
  ]) {
    globalThis.fetch = fetcher
    await assert.rejects(() => signedBinanceRequest('GET', '/api/v1/dex/market/candles', {}, credentials), BinanceApiError)
  }
  assert.equal(entries.length, 4)
  assert.deepEqual(entries.map(entry => entry.httpStatus), [403, 200, 200, null])
  assert.ok(entries.every(entry => entry.providerCode === null && entry.msg === null))
  const output = JSON.stringify(entries)
  for (const value of [credentials.secretKey, 'RAW_HTML', 'RAW_OVERSIZE', 'RAW_EXCEPTION']) assert.ok(!output.includes(value))
})

test('messages are redacted before truncation can expose a partial credential', async () => {
  const entries = capture()
  globalThis.fetch = async () => Response.json({ code: 40304, msg: 'x'.repeat(190) + credentials.secretKey + '\n' })
  await assert.rejects(() => signedBinanceRequest('GET', '/api/v1/dex/market/candles', {}, credentials), BinanceApiError)
  assert.ok(entries[0].msg.length <= 200)
  assert.ok(entries[0].msg.includes('[redacted]'))
  assert.ok(!entries[0].msg.includes(credentials.secretKey.slice(0, 8)))
})

test('a logging failure cannot replace the provider error returned to the app', async () => {
  console.warn = () => { throw new Error(credentials.secretKey) }
  globalThis.fetch = async () => Response.json({ code: 40304, msg: 'Restricted' })
  await assert.rejects(() => signedBinanceRequest('GET', '/api/v1/dex/market/candles', {}, credentials), error => {
    assert.deepEqual(binanceFailure(error), { reason: 'provider_error', httpStatus: 200, providerCode: 40304 })
    assert.ok(!error.message.includes(credentials.secretKey))
    return true
  })
})
