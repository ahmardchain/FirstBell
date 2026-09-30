import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { after, test } from 'node:test'
import { assets } from '../worker/market.ts'
import { getRwaContext, signPath } from '../worker/binance-rwa.ts'

const originalFetch = globalThis.fetch
after(() => { globalThis.fetch = originalFetch })
const respond = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
const credentials = { apiKey: 'public-id', secretKey: 'server-only-key' }

test('HMAC signs the exact /build path, query bytes and ISO timestamp', async () => {
  const at = '2026-09-30T15:12:00.123Z'
  const path = '/build/api/v1/dex/market/rwa/price?binanceChainId=56&tokenContractAddresses=0xABC'
  const expected = createHmac('sha256', credentials.secretKey).update(`${at}GET${path}`).digest('base64')
  assert.equal(await signPath(at, 'GET', path, '', credentials.secretKey), expected)
})

test('signed RWA calls normalize only the exact BSC Ondo contract', async () => {
  let requests = 0
  globalThis.fetch = async (url, options) => {
    requests += 1
    const path = new URL(url).pathname + new URL(url).search
    const signature = createHmac('sha256', credentials.secretKey)
      .update(`${options.headers['X-OC-TIMESTAMP']}GET${path}`).digest('base64')
    assert.equal(options.headers['X-OC-SIGN'], signature)
    assert.equal(options.headers['X-OC-APIKEY'], credentials.apiKey)
    assert.match(options.headers['X-OC-NONCE'], /^[0-9a-f-]{36}$/)
    assert.ok(path.startsWith('/build/api/v1/dex/market/rwa/'))
    if (path.includes('/price?')) return respond({ code: 0, success: true, timestamp: Date.now(), data: [
      { binanceChainId: '56', platformId: 'bstock', tokenContractAddress: assets.MSFTon, tokenPrice: '99999', tokenPriceUpdatedAt: Date.now() },
      { binanceChainId: '56', platformId: 'ondo', tokenContractAddress: assets.MSFTon.toLowerCase(), tokenPrice: '423.75', referencePrice: '422.91', tokenPriceUpdatedAt: Date.now() - 10_000 },
    ] })
    return respond({ code: 0, success: true, data: { binanceChainId: '56', platformId: 'ondo', tokenContractAddress: assets.MSFTon,
      statusInfo: { openState: false, marketStatus: 'closed', nextOpenTime: Date.now() + 3_600_000 } } })
  }
  const result = await getRwaContext('MSFTon', credentials)
  assert.equal(requests, 2)
  assert.equal(result?.tokenPriceUsd, 423.75)
  assert.equal(result?.referencePerShareUsd, 422.91)
  assert.equal(result?.underlyingMarket?.session, 'closed')
  assert.equal(result?.underlyingMarket?.open, false)
  assert.ok(result?.underlyingMarket?.nextOpenAt, 'a scheduled opening hours away is preserved')
  await getRwaContext('MSFTon', credentials)
  assert.equal(requests, 2, '30-second cache avoids repeated signed requests')
})

test('wrong network or issuer is rejected, and no market value is invented', async () => {
  globalThis.fetch = async () => respond({ code: 0, success: true, data: [
    { binanceChainId: '1', platformId: 'ondo', tokenContractAddress: assets.AMZNon, tokenPrice: '230', tokenPriceUpdatedAt: Date.now() },
  ] })
  assert.equal(await getRwaContext('AMZNon', credentials), null)
})

test('valid price remains available when the market-status call fails', async () => {
  globalThis.fetch = async url => String(url).includes('/price?')
    ? respond({ code: 0, success: true, data: [{ binanceChainId: '56', platformId: 'ondo', tokenContractAddress: assets.TSLAon,
      tokenPrice: '310.50', referencePrice: '309.75', tokenPriceUpdatedAt: Date.now() }] })
    : new Response('upstream error', { status: 503 })
  const result = await getRwaContext('TSLAon', credentials)
  assert.equal(result?.tokenPriceUsd, 310.5)
  assert.equal(result?.underlyingMarket, null)
})
