import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { signedBinanceRequest, binanceFailure } from '../worker/binance-api.ts'

const originalFetch = globalThis.fetch, originalLog = console.log, originalWarn = console.warn
afterEach(() => { globalThis.fetch = originalFetch; console.log = originalLog; console.warn = originalWarn })
const base = { apiKey: 'BX-support-private-key-123456', secretKey: 'support/secret+"quoted"' }
const body = '[{"binanceChainId":"56","tokenContractAddress":"0xA9eE28C80f960B889dFbd1902055218cBa016F75"}]'
const path = '/api/v1/dex/market/price-info'
const call = credentials => signedBinanceRequest('POST', path, {}, credentials, body)
function setup(text = '{"code":40304,"msg":"Service not available due to compliance restriction"}') {
  const logs = [], requests = []
  console.log = (marker, entry) => { assert.equal(marker, 'BINANCE_CAPTURE'); logs.push(entry) }
  console.warn = () => {}
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options })
    return new Response(text, { headers: { 'content-type': 'application/json', 'set-cookie': 'private-cookie' } })
  }
  return { logs, requests }
}
test('capture stays disabled without a valid short-lived opt-in', async () => {
  const { logs } = setup()
  for (const supportCaptureUntil of [undefined, 'invalid', new Date(Date.now() - 1000).toISOString(), new Date(Date.now() + 86_400_000).toISOString()]) {
    await assert.rejects(call({ ...base, supportCaptureUntil }))
  }
  assert.equal(logs.length, 0)
})
test('capture contains actual signed request and unchanged raw response, once per isolate/window', async () => {
  const { logs, requests } = setup()
  const credentials = { ...base, supportCaptureUntil: new Date(Date.now() + 600_000).toISOString() }
  const results = await Promise.allSettled([call(credentials), call(credentials)])
  assert.equal(logs.length, 1)
  const entry = logs[0], actual = requests.find(r => r.options.headers['X-OC-SIGN'] === entry.request.headers['X-OC-SIGN'])
  assert.ok(actual)
  assert.equal(entry.request.url, actual.url)
  assert.equal(entry.request.body, actual.options.body)
  for (const key of ['X-OC-SIGN', 'X-OC-NONCE', 'X-OC-TIMESTAMP']) assert.equal(entry.request.headers[key], actual.options.headers[key])
  assert.equal(entry.response.text, '{"code":40304,"msg":"Service not available due to compliance restriction"}')
  assert.equal(entry.response.credentialsRedacted, false)
  assert.deepEqual(entry.response.omittedHeaders, ['set-cookie'])
  assert.ok(!JSON.stringify(entry).includes(base.apiKey))
  assert.ok(!JSON.stringify(entry).includes(base.secretKey))
  for (const result of results) {
    assert.equal(result.status, 'rejected')
    assert.deepEqual(binanceFailure(result.reason), { reason: 'provider_error', httpStatus: 200, providerCode: 40304 })
  }
})
test('response credential echoes are redacted and declared; other tokens never capture', async () => {
  const { logs } = setup(JSON.stringify({ code: 40304, msg: base.apiKey + ' ' + base.secretKey + ' ' + encodeURIComponent(base.secretKey) }))
  const credentials = { ...base, supportCaptureUntil: new Date(Date.now() + 601_000).toISOString() }
  await assert.rejects(signedBinanceRequest('GET', '/api/v1/dex/market/candles', {}, credentials))
  await assert.rejects(signedBinanceRequest('POST', path, {}, credentials, '[]'))
  assert.equal(logs.length, 0)
  await assert.rejects(call(credentials))
  assert.equal(logs.length, 1)
  assert.equal(logs[0].response.credentialsRedacted, true)
  assert.ok(!JSON.stringify(logs).includes(base.apiKey))
  assert.ok(!JSON.stringify(logs).includes(encodeURIComponent(base.secretKey)))
})
test('capture logger failures preserve the Binance business error', async () => {
  setup()
  console.log = () => { throw new Error(base.secretKey) }
  await assert.rejects(call({ ...base, supportCaptureUntil: new Date(Date.now() + 602_000).toISOString() }), error => {
    assert.deepEqual(binanceFailure(error), { reason: 'provider_error', httpStatus: 200, providerCode: 40304 })
    return true
  })
})
