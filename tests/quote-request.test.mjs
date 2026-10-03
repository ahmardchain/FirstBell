import assert from 'node:assert/strict'
import { test, afterEach } from 'node:test'
import { getTradingRoute } from '../src/market-api.ts'

const fetchOriginal = globalThis.fetch, timeoutOriginal = AbortSignal.timeout
afterEach(() => { globalThis.fetch = fetchOriginal; AbortSignal.timeout = timeoutOriginal })
const wallet = '0x1111111111111111111111111111111111111111'
const call = signal => getTradingRoute('NVDAon', 'buy', '5', wallet, 'fixture-access', '', signal)

test('quote timeout stops the request with a specific error instead of endless loading', async () => {
  const deadline = new AbortController()
  AbortSignal.timeout = milliseconds => { assert.equal(milliseconds, 20_000); return deadline.signal }
  globalThis.fetch = async (_url, init) => {
    deadline.abort(new DOMException('Expired', 'TimeoutError'))
    throw init.signal.reason
  }
  await assert.rejects(() => call(new AbortController().signal), /quote_timeout/)
})

test('changing an amount cancels an obsolete quote without labeling it a provider timeout', async () => {
  const change = new AbortController()
  globalThis.fetch = async (_url, init) => { change.abort(); throw init.signal.reason }
  await assert.rejects(() => call(change.signal), error => error.name === 'AbortError')
})

test('a verified server quote still provides its receive value when the optional identity token is absent', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/trade/route'); assert.equal(init.method, 'POST')
    assert.equal(init.headers.Authorization, 'Bearer fixture-access')
    const { walletAddress } = JSON.parse(init.body); assert.equal(walletAddress, wallet)
    return Response.json({ route: { source: 'binance-web3', chainId: 56, symbol: 'NVDAon', side: 'buy', walletAddress: wallet,
      inputAmount: '5', inputSymbol: 'USDT', outputAmount: '0.025', outputSymbol: 'NVDAon', executionMode: 'RFQ',
      executable: false, vendor: 'FixtureVendor', refreshAt: new Date(Date.now() + 30_000).toISOString() } })
  }
  assert.equal((await call(new AbortController().signal)).outputAmount, '0.025')
})
