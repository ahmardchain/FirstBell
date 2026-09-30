import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { assets, marketSnapshot, parseQuantity, softQuote } from '../worker/market.ts'

const originalFetch = globalThis.fetch
after(() => { globalThis.fetch = originalFetch })
const respond = (body) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })

test('Ondo primary market and OHLC values are normalized without an underlying stock price', async () => {
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers['x-api-key'], 'test-key')
    if (String(url).endsWith('/market')) return respond({ primaryMarket: { symbol: 'AAPLon', price: '213.41', priceChangePct24h: '-1.5' }, underlyingMarket: { ticker: 'AAPL', price: '999.99' }, timestamp: Date.now() })
    return respond({ primaryMarket: { symbol: 'AAPLon', data: [{ timestamp: Date.now() - 60_000, open: 210, high: 214, low: 209, close: 213 }] } })
  }
  const result = await marketSnapshot('AAPLon', '15m', 'test-key')
  assert.equal(result?.source, 'ondo')
  assert.equal(result?.priceUsd, 213.41)
  assert.equal(result?.change24hPct, -1.5)
  assert.equal(result?.candles.length, 1)
  assert.equal(result?.candles[0].volume, 0)
})

test('Gecko pool must match exact contract; selected OHLC uses USD token prices', async () => {
  const target = assets.NVDAon.toLowerCase()
  globalThis.fetch = async url => {
    if (String(url).endsWith('/pools?page=1')) return respond({ data: [
      { attributes: { address: '0x1111111111111111111111111111111111111111', reserve_in_usd: '999999', base_token_price_usd: '999' }, relationships: { base_token: { data: { id: 'bsc_wrong' } }, quote_token: { data: { id: 'bsc_other' } } } },
      { attributes: { address: '0x2222222222222222222222222222222222222222', reserve_in_usd: '34000', base_token_price_usd: '123.45', price_change_percentage: { h24: '2.4' } }, relationships: { base_token: { data: { id: `bsc_${target}` } }, quote_token: { data: { id: 'bsc_other' } } } },
    ] })
    assert.match(String(url), /0x2222.*currency=usd&token=0xa9ee28/i)
    return respond({ data: { attributes: { ohlcv_list: [[Math.floor(Date.now() / 1000) - 900, 122, 124, 121, 123, 2.5]] } } })
  }
  const result = await marketSnapshot('NVDAon', '15m')
  assert.equal(result?.source, 'geckoterminal')
  assert.equal(result?.priceUsd, 123.45)
  assert.equal(result?.candles[0].volume, 2.5)
})

test('soft quote validates exact token amount, address, side, and computes totals without floating point', async () => {
  assert.equal(parseQuantity('1e4'), null)
  assert.equal(parseQuantity('0.2'), '0.2')
  assert.equal(parseQuantity('1.2500'), '1.2500')
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body)
    assert.deepEqual(request, { chainId: 'bsc-56', symbol: 'TSLAon', side: 'buy', tokenAmount: '2.5', duration: 'short' })
    return respond({ symbol: 'TSLAon', chainId: '56', side: '0', assetAddress: assets.TSLAon,
      tokenAmount: '2500000000000000000', price: '201250000000000000000' })
  }
  const quote = await softQuote('TSLAon', 'buy', '2.5', 'test-key')
  assert.equal(quote?.priceUsd, '201.25')
  assert.equal(quote?.estimatedTotalUsd, '503.125')
  assert.equal(quote?.executable, false)
  globalThis.fetch = async () => respond({ symbol: 'TSLAon', chainId: '56', side: '0', assetAddress: assets.AAPLon,
    tokenAmount: '2500000000000000000', price: '201250000000000000000' })
  assert.equal(await softQuote('TSLAon', 'buy', '2.5', 'test-key'), null)
})
