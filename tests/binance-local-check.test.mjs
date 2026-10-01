import test from 'node:test'
import assert from 'node:assert/strict'
import { checkBinanceMarket } from '../scripts/check-binance-market.mjs'
import { signPath } from '../worker/binance-api.ts'

const credentials = { apiKey: 'fixture-api-key-long', secretKey: 'fixture-secret/key+long' }

test('local requests match Worker signing, BSC NVDAon paths and raw POST body', async () => {
  const calls = []
  const reports = await checkBinanceMarket(credentials, async (url, options) => {
    const path = new URL(url).pathname + new URL(url).search
    assert.equal(options.headers['X-OC-SIGN'], await signPath(options.headers['X-OC-TIMESTAMP'], options.method, path, options.body || '', credentials.secretKey))
    assert.equal(options.headers['X-OC-APIKEY'], credentials.apiKey)
    assert.equal(options.redirect, 'error')
    calls.push({ url, options })
    return Response.json({ code: 0, data: [] })
  })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].options.method, 'GET')
  assert.equal(calls[0].url, 'https://web3.binance.com/build/api/v1/dex/market/candles?binanceChainId=56&tokenContractAddress=0xA9eE28C80f960B889dFbd1902055218cBa016F75&bar=15m&limit=100')
  assert.equal(calls[1].options.method, 'POST')
  assert.equal(calls[1].url, 'https://web3.binance.com/build/api/v1/dex/market/price-info')
  assert.deepEqual(JSON.parse(calls[1].options.body), [{ binanceChainId: '56', tokenContractAddress: '0xA9eE28C80f960B889dFbd1902055218cBa016F75' }])
  assert.equal(calls[1].options.headers['Content-Type'], 'application/json')
  assert.deepEqual(reports.map(report => [report.result, report.providerCode, report.itemCount]), [['accepted', 0, 0], ['accepted', 0, 0]])
})

test('HTTP 200 compliance failure is reported per endpoint and credentials are redacted', async () => {
  const reports = await checkBinanceMarket(credentials, async (_url, options) => Response.json({
    code: 40304,
    msg: `Denied ${credentials.apiKey} ${credentials.secretKey} ${encodeURIComponent(credentials.secretKey)} ${options.headers['X-OC-SIGN']} ${options.headers['X-OC-NONCE']}\u0007`,
    data: { leakedValue: credentials.secretKey },
  }))
  assert.deepEqual(reports.map(report => [report.httpStatus, report.providerCode, report.result]), [[200, 40304, 'rejected'], [200, 40304, 'rejected']])
  const output = JSON.stringify(reports)
  assert.ok(!output.includes(credentials.apiKey))
  assert.ok(!output.includes(credentials.secretKey))
  assert.ok(!output.includes(encodeURIComponent(credentials.secretKey)))
  assert.ok(!output.includes('leakedValue'))
  for (const report of reports) assert.equal(report.message, 'Denied [redacted] [redacted] [redacted] [redacted] [redacted] ')
})

test('one rejected endpoint does not hide an accepted response from the other', async () => {
  const reports = await checkBinanceMarket(credentials, async (_url, options) => Response.json(options.method === 'GET'
    ? { code: 40304, msg: 'restricted' }
    : { code: 0, data: [{ price: '123' }] }))
  assert.equal(reports[0].result, 'rejected')
  assert.equal(reports[1].result, 'accepted')
  assert.equal(reports[1].itemCount, 1)
  assert.ok(!JSON.stringify(reports).includes('123'))
})

test('HTML, oversized responses and network errors cannot print raw bodies or exceptions', async () => {
  for (const fetcher of [
    async () => new Response(`<html>${credentials.secretKey}</html>`, { status: 403 }),
    async () => new Response(JSON.stringify({ code: 0, data: credentials.secretKey.repeat(20_000) })),
    async () => { throw new Error(credentials.secretKey) },
  ]) {
    const reports = await checkBinanceMarket(credentials, fetcher)
    assert.ok(reports.every(report => report.result !== 'accepted'))
    assert.ok(!JSON.stringify(reports).includes(credentials.secretKey))
  }
})
