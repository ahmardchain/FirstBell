import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { after, test } from 'node:test'
import { assets, marketSnapshot } from '../worker/market.ts'
import { BinanceApiError, binanceFailure, signedBinanceRequest } from '../worker/binance-api.ts'
import { getMarket, getRwa, MarketRequestError } from '../src/market-api.ts'

const originalFetch = globalThis.fetch
after(() => { globalThis.fetch = originalFetch })
const credentials = { apiKey: 'test-public-id', secretKey: 'test-secret-value' }
const respond = data => new Response(JSON.stringify({ code: 0, success: true, data }), { headers: { 'Content-Type': 'application/json' } })
const at = Date.now() - 60_000
const bar = (time = at) => [121, 124, 120, 123, 20, time, 3]
const info = (symbol, fields = {}) => ({ binanceChainId: '56', tokenContractAddress: assets[symbol].toLowerCase(),
  price: '123.50', time: at, priceChange24H: '-0.85', ...fields })

test('Binance keys alone supply exact-token BSC candles and price; POST signature includes the raw body', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    calls.push(parsed.pathname)
    const expected = createHmac('sha256', credentials.secretKey)
      .update(`${options.headers['X-OC-TIMESTAMP']}${options.method}${parsed.pathname}${parsed.search}${options.body ?? ''}`).digest('base64')
    assert.equal(options.headers['X-OC-SIGN'], expected)
    assert.equal(options.headers['X-OC-APIKEY'], credentials.apiKey)
    if (parsed.pathname.endsWith('/candles')) {
      assert.equal(options.method, 'GET')
      assert.equal(parsed.searchParams.get('binanceChainId'), '56')
      assert.equal(parsed.searchParams.get('tokenContractAddress'), assets.NVDAon)
      assert.equal(parsed.searchParams.get('bar'), '1d')
      assert.equal(parsed.searchParams.get('limit'), '100')
      return respond([bar(at), bar(at - 86_400_000), bar(at), [121, 119, 120, 123, 20, at - 120_000, 1],
        [1, 2, 1, 1, 1, at + 86_400_000, 1], [1, 2, 1, 1, 'bad-volume', at, 1]])
    }
    assert.equal(parsed.pathname, '/build/api/v1/dex/market/price-info')
    assert.equal(parsed.search, '')
    assert.equal(options.method, 'POST')
    assert.deepEqual(JSON.parse(options.body), [{ binanceChainId: '56', tokenContractAddress: assets.NVDAon }])
    return respond([info('NVDAon', { binanceChainId: '1', price: '999' }), info('NVDAon')])
  }
  const result = await marketSnapshot('NVDAon', '1D', undefined, credentials)
  assert.equal(result?.source, 'binance-web3')
  assert.equal(result?.priceUsd, 123.5)
  assert.equal(result?.change24hPct, -0.85)
  assert.deepEqual(result?.candles.map(item => item.t), [at - 86_400_000, at])
  assert.deepEqual(result?.candles[1], { t: at, open: 121, high: 124, low: 120, close: 123, volume: 20 })
  await marketSnapshot('NVDAon', '1D', undefined, credentials)
  assert.equal(calls.length, 2, 'valid feed is cached for thirty seconds')
})

test('valid history survives a rejected price call without inventing a current price or change', async () => {
  globalThis.fetch = async url => String(url).includes('/candles?') ? respond([bar()]) : new Response('unavailable', { status: 503 })
  const result = await marketSnapshot('AMZNon', '4h', undefined, credentials)
  assert.equal(result?.candles.length, 1)
  assert.equal(result?.priceUsd, null)
  assert.equal(result?.change24hPct, null)
  assert.equal(result?.asOf, new Date(at).toISOString())
})

test('valid token price survives a failed history call, with an actionable error and no synthetic candles', async () => {
  globalThis.fetch = async url => String(url).includes('/candles?') ? new Response('busy', { status: 429 }) : respond([info('AAPLon')])
  const result = await marketSnapshot('AAPLon', '4h', undefined, credentials)
  assert.equal(result?.priceUsd, 123.5)
  assert.deepEqual(result?.candles, [])
  assert.equal(result?.historyError.reason, 'rate_limited')
  assert.equal(result?.historyError.httpStatus, 429)
})

test('wrong-token or wrong-chain prices and timestamp-first candle tuples are rejected', async () => {
  globalThis.fetch = async url => {
    if (String(url).includes('/candles?')) return respond([])
    if (String(url).endsWith('/price-info')) return respond([
      info('TSLAon', { binanceChainId: '1' }), info('TSLAon', { tokenContractAddress: assets.NVDAon }),
    ])
    return new Response(JSON.stringify({ data: [] }))
  }
  assert.equal(await marketSnapshot('TSLAon', '1h', undefined, credentials), null)
  globalThis.fetch = async url => {
    if (String(url).includes('/candles?')) return respond([[at, 121, 124, 120, 123, 20, 3]])
    if (String(url).endsWith('/price-info')) return respond([info('TSLAon')])
    throw new Error('unexpected fallback')
  }
  const result = await marketSnapshot('TSLAon', '1h', undefined, credentials)
  assert.deepEqual(result?.candles, [])
  assert.equal(result?.historyError.reason, 'provider_error')
})

test('access rejection returns only safe codes and does not leak provider text, credentials, or HTML', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 40102, success: false,
    msg: `private diagnostic ${credentials.secretKey} ${credentials.apiKey}` }), { status: 401 })
  await assert.rejects(() => signedBinanceRequest('GET', '/api/v1/dex/market/candles', {}, credentials), error => {
    assert.ok(error instanceof BinanceApiError)
    assert.deepEqual(binanceFailure(error), { reason: 'provider_auth_error', httpStatus: 401, providerCode: 40102 })
    assert.ok(!error.message.includes(credentials.secretKey))
    assert.ok(!error.message.includes(credentials.apiKey))
    assert.ok(!JSON.stringify(binanceFailure(error)).includes('private diagnostic'))
    return true
  })
  globalThis.fetch = async url => String(url).includes('web3.binance.com')
    ? new Response('<html>access rejected</html>', { status: 403 })
    : new Response(JSON.stringify({ data: [] }))
  await assert.rejects(() => marketSnapshot('MSFTon', '4h', undefined, credentials), error => error.reason === 'provider_auth_error' && error.httpStatus === 403)
})

test('the documented code-only envelope is accepted; HTTP-200 permission and rate errors are surfaced', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 0, data: [] }))
  assert.deepEqual(await signedBinanceRequest('GET', '/api/v1/dex/market/candles', {}, credentials), { code: 0, data: [] })
  for (const [code, reason] of [[40104, 'provider_auth_error'], [42900, 'rate_limited'], [50001, 'provider_error']]) {
    globalThis.fetch = async () => new Response(JSON.stringify({ code, msg: 'do not forward this text' }))
    await assert.rejects(() => signedBinanceRequest('GET', '/api/v1/dex/market/candles', {}, credentials), error =>
      error.httpStatus === 200 && error.providerCode === code && error.reason === reason)
  }
})

test('the browser API distinguishes an access error from an empty market and preserves a partial price response', async () => {
  const signal = new AbortController().signal
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 'unavailable', reason: 'provider_auth_error', providerCode: 40102 }), { status: 503 })
  await assert.rejects(() => getMarket('NVDAon', '15m', signal), error => error instanceof MarketRequestError && error.reason === 'provider_auth_error')
  assert.equal((await getRwa('NVDAon', signal)).providerCode, 40102)
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 'unavailable', candles: [] }), { status: 503 })
  assert.equal(await getMarket('NVDAon', '15m', signal), null)
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 'ready', symbol: 'NVDAon', source: 'binance-web3',
    priceUsd: 123.5, change24hPct: null, asOf: new Date(at).toISOString(), candles: [], historyError: { reason: 'rate_limited' } }))
  const result = await getMarket('NVDAon', '15m', signal)
  assert.equal(result?.priceUsd, 123.5)
  assert.equal(result?.historyError.reason, 'rate_limited')
})
