import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { after, test } from 'node:test'
import { isAddress } from 'viem'
import manifest from '../asset-sources.json' with { type: 'json' }
import { assetCatalog, assetLogo } from '../lib/asset-catalog.ts'
import { assets, isSymbol, tokenPrices } from '../worker/market.ts'
import { handleApiRequest } from '../worker/router.ts'
import { getTokenPrices } from '../src/market-api.ts'

const originalFetch = globalThis.fetch
after(() => { globalThis.fetch = originalFetch })
const respond = data => Response.json({ code: 0, success: true, data })
const credentials = id => ({ apiKey: `fixture-${id}`, secretKey: 'fixture-secret' })
const info = (symbol, overrides = {}) => ({ binanceChainId: '56', tokenContractAddress: assets[symbol],
  price: '123.45', priceChange24H: '-1.25', time: Date.now() - 60_000, ...overrides })

test('the complete pinned BSC catalog has unique, valid contracts and drives the API allowlist', () => {
  assert.equal(assetCatalog.length, 459)
  assert.match(manifest.sourceTokenList, new RegExp(`${manifest.sourceCommit}/tokenlist.json$`))
  assert.equal(new Set(assetCatalog.map(asset => asset.symbol)).size, assetCatalog.length)
  assert.equal(new Set(assetCatalog.map(asset => asset.address.toLowerCase())).size, assetCatalog.length)
  for (const asset of assetCatalog) {
    assert.equal(asset.chainId, 56)
    assert.equal(isAddress(asset.address), true, asset.symbol)
    assert.equal(assets[asset.symbol], asset.address)
    assert.equal(isSymbol(asset.symbol), true)
    assert.match(asset.source, /^https:\/\/cdn\.ondo\.finance\/tokens\/logos\//)
    assert.ok(assetLogo(asset))
  }
  assert.equal(isSymbol('toString'), false)
  assert.equal(isSymbol('FAKEon'), false)
  assert.equal(isSymbol('GOOGLon'), true)
  assert.equal(isSymbol('BRAINon'), true)
})

test('one signed price batch handles new symbols and rejects wrong-chain, wrong-contract and invalid prices', async () => {
  const auth = credentials('exact')
  let calls = 0
  globalThis.fetch = async (url, options) => {
    calls++
    const path = new URL(url).pathname
    assert.equal(path, '/build/api/v1/dex/market/price-info')
    assert.deepEqual(JSON.parse(options.body), ['GOOGLon', 'METAon', 'COINon', 'HOODon'].map(symbol =>
      ({ binanceChainId: '56', tokenContractAddress: assets[symbol] })))
    assert.equal(options.headers['X-OC-SIGN'], createHmac('sha256', auth.secretKey)
      .update(options.headers['X-OC-TIMESTAMP'] + 'POST' + path + options.body).digest('base64'))
    return respond([info('GOOGLon', { binanceChainId: '1', price: '99999' }), info('GOOGLon'),
      info('METAon', { tokenContractAddress: assets.NVDAon }),
      info('COINon', { time: Date.now() + 600_000 }), info('HOODon', { price: '-1' })])
  }
  const prices = await tokenPrices(['GOOGLon', 'METAon', 'COINon', 'HOODon'], auth)
  assert.equal(calls, 1)
  assert.equal(prices[0].priceUsd, 123.45)
  assert.equal(prices[0].change24hPct, -1.25)
  assert.deepEqual(prices.slice(1).map(row => [row.priceUsd, row.change24hPct, row.asOf]),
    [[null, null, null], [null, null, null], [null, null, null]])
})

test('simultaneous price batches coalesce and accepted results are cached', async () => {
  let calls = 0, release
  const gate = new Promise(resolve => { release = resolve })
  globalThis.fetch = async () => { calls++; await gate; return respond([info('NETon')]) }
  const auth = credentials('coalesce')
  const first = tokenPrices(['NETon'], auth)
  const second = tokenPrices(['NETon'], auth)
  release()
  assert.deepEqual(await first, await second)
  await tokenPrices(['NETon'], auth)
  assert.equal(calls, 1)
})

test('price route validates bounded catalog-only input and does not cache provider failures', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    return calls === 1 ? Response.json({ code: 40304, success: false, msg: 'fixture rejection' }) : respond([info('SBUXon')])
  }
  const auth = credentials('route')
  const env = { BINANCE_WEB3_API_KEY: auth.apiKey, BINANCE_WEB3_SECRET_KEY: auth.secretKey }
  const route = query => handleApiRequest(new Request(`https://firstbell.example/api/prices?symbols=${query}`), env)
  assert.equal((await route('FAKEon')).status, 400)
  assert.equal((await route(Array(101).fill('SBUXon').join(','))).status, 400)
  assert.equal(calls, 0)
  const failed = await route('SBUXon')
  assert.equal(failed.status, 503)
  assert.equal((await failed.json()).providerCode, 40304)
  const ready = await route('SBUXon')
  assert.equal(ready.status, 200)
  assert.equal((await ready.json()).prices[0].priceUsd, 123.45)
  assert.equal(calls, 2)
})

test('client price batches retain missing/invalid prices as unavailable', async () => {
  globalThis.fetch = async url => {
    assert.match(String(url), /symbols=GOOGLon%2CMETAon%2CCOINon/)
    return Response.json({ status: 'ready', prices: [
      { symbol: 'GOOGLon', priceUsd: 12.5, change24hPct: 1, asOf: new Date().toISOString() },
      { symbol: 'METAon', priceUsd: 500, change24hPct: 4, asOf: 'invalid' },
    ] })
  }
  const prices = await getTokenPrices(['GOOGLon', 'METAon', 'COINon'])
  assert.equal(prices[0].priceUsd, 12.5)
  assert.equal(prices[1].priceUsd, null)
  assert.equal(prices[2].priceUsd, null)
  await assert.rejects(() => getTokenPrices(Array(101).fill('GOOGLon')), /Too many/)
})
