import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { TradeRequestError } from '../lib/trade-error.ts'
import { RouteError, tradingRequest } from '../worker/binance-trading.ts'
import { getTradingRoute } from '../src/market-api.ts'
import { prepareTrade } from '../src/agent-api.ts'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const wallet = '0x1111111111111111111111111111111111111111'
const credentials = { apiKey: 'fixture-key', secretKey: 'fixture-secret' }
const session = { accessToken: 'fixture-access', identityToken: 'fixture-identity' }

test('a below-minimum provider response returns only its bounded numeric USD threshold', async () => {
  for (const [msg, minimum] of [
    ['Minimum order amount is 20 USD. private fixture detail', '20'],
    ['Minimum order amount is 25.50 USD.', '25.50'],
    ['ONDO_FROM_USD_AMOUNT_TOO_SMALL', null],
    ['Minimum order amount is 0 USD.', null],
    ['Minimum order amount is 1e3 USD.', null],
    ['Minimum order amount is -20 USD.', null],
    ['Minimum order amount is 20.005 USD.', null],
    ['x'.repeat(513) + 'Minimum order amount is 20 USD.', null],
  ]) {
    globalThis.fetch = async () => Response.json({ code: 40375, success: false, msg, data: null })
    await assert.rejects(() => tradingRequest('GET', '/api/v1/dex/aggregator/quote', {}, credentials), error => {
      assert.ok(error instanceof RouteError)
      assert.equal(error.reason, 'minimum_order_not_met'); assert.equal(error.status, 400)
      assert.equal(error.minimumUsd, minimum)
      assert.equal(JSON.stringify(error).includes('private fixture detail'), false)
      return true
    })
  }
})

test('both quote clients carry the provider minimum without increasing the requested spend', async () => {
  for (const path of ['route', 'prepare']) {
    for (const [minimumUsd, expected] of [['20', '20'], ['20.50', '20.50'], ['20 USD private fixture', null], ['0', null], [20, null]]) {
      let requests = 0
      globalThis.fetch = async (url, init) => {
        requests++
        assert.equal(url, `/api/trade/${path}`)
        assert.equal(JSON.parse(init.body).amount, '5', 'the user chooses whether to increase spend')
        return Response.json({ error: 'minimum_order_not_met', minimumUsd }, { status: 400 })
      }
      const request = path === 'route'
        ? () => getTradingRoute('NVDAon', 'buy', '5', wallet, session.accessToken, session.identityToken, new AbortController().signal)
        : () => prepareTrade({ symbol: 'NVDAon', side: 'buy', amount: '5', walletAddress: wallet }, session)
      await assert.rejects(request, error => error instanceof TradeRequestError && error.message === 'minimum_order_not_met' && error.minimumUsd === expected)
      assert.equal(requests, 1, 'no automatic resize, re-quote or submission')
    }
  }
})
