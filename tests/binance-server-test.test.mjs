import test from 'node:test'
import assert from 'node:assert/strict'
import { createProbe } from '../server-test/lib/probe.mjs'
import { signPath } from '../worker/binance-api.ts'

const token = 'fixture-test-access-token-'.padEnd(64, 'a')
const env = { BINANCE_TEST_TOKEN: token, BINANCE_WEB3_API_KEY: 'fixture-api-key-long',
  BINANCE_WEB3_SECRET_KEY: 'fixture-secret-key-long', VERCEL: '1', VERCEL_REGION: 'fra1' }
const request = (authorization = `Bearer ${token}`, method = 'POST', query = '') =>
  new Request(`https://fixture.invalid/api/check${query}`, { method, headers: { Authorization: authorization } })

test('server test fails closed before making upstream calls', async () => {
  let calls = 0
  const fetcher = async () => { calls++; throw new Error('must not fetch') }
  for (const missing of ['BINANCE_TEST_TOKEN', 'BINANCE_WEB3_API_KEY', 'BINANCE_WEB3_SECRET_KEY']) {
    const probe = createProbe({ env: { ...env, [missing]: '' }, fetcher })
    assert.equal((await probe(request())).status, 503)
  }
  const weakToken = createProbe({ env: { ...env, BINANCE_TEST_TOKEN: 'short' }, fetcher })
  assert.equal((await weakToken(request())).status, 503)
  const probe = createProbe({ env, fetcher })
  for (const authorization of ['', 'Bearer wrong', `Bearer ${'b'.repeat(64)}`]) {
    const response = await probe(request(authorization))
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }
  assert.equal(calls, 0)
})

test('server test accepts only POST and no custom target query', async () => {
  let calls = 0
  const probe = createProbe({ env, fetcher: async () => { calls++ } })
  const response = await probe(request(`Bearer ${token}`, 'GET'))
  assert.equal(response.status, 405)
  assert.equal(response.headers.get('allow'), 'POST')
  assert.equal((await probe(request(`Bearer ${token}`, 'POST', '?target=https://fixture.invalid'))).status, 400)
  assert.equal(calls, 0)
})

test('authenticated hosted comparison uses Worker signatures and both fixed endpoints', async () => {
  const calls = []
  const probe = createProbe({ env, fetcher: async (url, options) => {
    calls.push({ url, options })
    const path = new URL(url).pathname + new URL(url).search
    assert.equal(options.headers['X-OC-SIGN'], await signPath(options.headers['X-OC-TIMESTAMP'],
      options.method, path, options.body || '', env.BINANCE_WEB3_SECRET_KEY))
    return Response.json({ code: 0, success: true, data: options.method === 'GET' ? Array(100).fill([]) : [{}] })
  } })
  const response = await probe(request())
  assert.equal(response.status, 200)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'https://web3.binance.com/build/api/v1/dex/market/candles?binanceChainId=56&tokenContractAddress=0xA9eE28C80f960B889dFbd1902055218cBa016F75&bar=15m&limit=100')
  assert.equal(calls[1].url, 'https://web3.binance.com/build/api/v1/dex/market/price-info')
  const data = await response.json()
  assert.equal(data.result, 'both_accepted')
  assert.equal(data.hosting.configuredRegion, 'fra1')
  assert.equal(data.hosting.reportedRuntimeRegion, 'fra1')
  assert.deepEqual(data.requests.map(r => r.itemCount), [100, 1])
  const serialized = JSON.stringify(data)
  for (const value of [token, env.BINANCE_WEB3_API_KEY, env.BINANCE_WEB3_SECRET_KEY,
    ...calls.flatMap(c => [c.options.headers['X-OC-SIGN'], c.options.headers['X-OC-NONCE']])]) {
    assert.ok(!serialized.includes(value))
  }
})

test('hosted HTTP 200 compliance error remains a rejected provider result', async () => {
  const probe = createProbe({ env, fetcher: async (_url, options) => Response.json(options.method === 'GET'
    ? { code: 40304, success: false, msg: 'Service not available due to compliance restriction' }
    : { code: 0, success: true, data: [] }) })
  const data = await (await probe(request())).json()
  assert.equal(data.result, 'not_both_accepted')
  assert.deepEqual(data.requests.map(r => [r.httpStatus, r.providerCode, r.result]), [[200, 40304, 'rejected'], [200, 0, 'accepted']])
  assert.equal(data.requests[0].itemCount, null)
})

test('concurrent and immediate repeated runs wait without additional provider calls', async () => {
  let now = 1_800_000_000_000
  let calls = 0
  let release
  const wait = new Promise(resolve => { release = resolve })
  const probe = createProbe({ env, clock: () => now, fetcher: async () => {
    calls++
    await wait
    return Response.json({ code: 0, data: [] })
  } })
  const first = probe(request())
  assert.equal((await probe(request())).status, 429)
  release()
  assert.equal((await first).status, 200)
  assert.equal(calls, 2)
  const repeat = await probe(request())
  assert.equal(repeat.status, 429)
  assert.equal(repeat.headers.get('retry-after'), '20')
  assert.equal(calls, 2)
  now += 20_000
  assert.equal((await probe(request())).status, 200)
  assert.equal(calls, 4)
})
