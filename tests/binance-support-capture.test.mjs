import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { signedBinanceRequest } from '../worker/binance-api.ts'

const originalFetch = globalThis.fetch
const originalLog = console.log
const originalWarn = console.warn
after(() => { globalThis.fetch = originalFetch; console.log = originalLog; console.warn = originalWarn })
const base = { apiKey: 'fixture-public-id', secretKey: 'fixture-private-secret' }
const body = '[{"binanceChainId":"56","tokenContractAddress":"0xA9eE28C80f960B889dFbd1902055218cBa016F75"}]'

test('retired support flags cannot capture accepted requests, signatures or raw provider responses', async () => {
  const logs = []
  console.log = (...args) => logs.push(args)
  console.warn = (...args) => logs.push(args)
  globalThis.fetch = async () => Response.json({ code: 0, success: true, data: [] })
  for (const supportCaptureUntil of [undefined, 'invalid', new Date(Date.now() - 1000).toISOString(), new Date(Date.now() + 600_000).toISOString()]) {
    const response = await signedBinanceRequest('POST', '/api/v1/dex/market/price-info', {}, { ...base, supportCaptureUntil }, body)
    assert.equal(response.code, 0)
  }
  assert.deepEqual(logs, [])
})

test('provider rejection produces only the bounded diagnostic with credential echoes redacted', async () => {
  const logs = []
  let signature, nonce
  console.log = (...args) => logs.push(args)
  console.warn = (...args) => logs.push(args)
  globalThis.fetch = async (_url, options) => {
    signature = options.headers['X-OC-SIGN']
    nonce = options.headers['X-OC-NONCE']
    return Response.json({ code: 40304, success: false, msg: [base.apiKey, base.secretKey, signature, nonce].join(' '),
      data: { secretField: 'RAW-PROVIDER-DATA-MUST-NOT-LOG' } })
  }
  await assert.rejects(() => signedBinanceRequest('POST', '/api/v1/dex/market/price-info', {},
    { ...base, supportCaptureUntil: new Date(Date.now() + 600_000).toISOString() }, body),
    error => error.providerCode === 40304)
  assert.equal(logs.length, 1)
  assert.equal(logs[0][0], 'BINANCE_DIAG')
  const serialized = JSON.stringify(logs)
  for (const privateValue of [base.apiKey, base.secretKey, signature, nonce, body, 'RAW-PROVIDER-DATA-MUST-NOT-LOG']) {
    assert.equal(serialized.includes(privateValue), false)
  }
  assert.ok(logs[0][1].msg.length <= 200)
})
