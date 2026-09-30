import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { after, test } from 'node:test'
import { exportSPKI, generateKeyPair, SignJWT } from 'jose'
import { BSC_USDT } from '../lib/funding.ts'
import { assets } from '../worker/market.ts'
import { getTradingRoute, normalizeRoutes } from '../worker/binance-trading.ts'
import { handleTradingRoute } from '../worker/trading.ts'

const originalFetch = globalThis.fetch
after(() => { globalThis.fetch = originalFetch })
const wallet = '0x1111111111111111111111111111111111111111'
const other = '0x2222222222222222222222222222222222222222'
const credentials = { apiKey: 'fixture-key', secretKey: 'fixture-secret' }
const token = (address, decimal = '18') => ({ tokenContractAddress: address, decimal })
const route = overrides => ({ quoteId: 'fixturequote123', vendorName: 'PcsXRfq', binanceChainId: '56', executionMode: 'RFQ',
  fromTokenAmount: '5000000000000000000', toTokenAmount: '25000000000000000',
  fromToken: token(BSC_USDT.address), toToken: token(assets.NVDAon), ...overrides })
const request = overrides => ({ symbol: 'NVDAon', side: 'buy', amount: '5', rawAmount: '5000000000000000000', walletAddress: wallet,
  tokenDecimals: 18, startedAt: Date.now(), ...overrides })
const result = data => ({ code: 0, success: true, timestamp: Date.now(), data })
const rpcResult = (input, decimals = 18, chain = 56) => ({ jsonrpc: '2.0', id: input.id,
  result: input.method === 'eth_chainId' ? `0x${chain.toString(16)}` : `0x${decimals.toString(16).padStart(64, '0')}` })

test('buy routes use exact 18-decimal BSC USDT, the owned wallet, and independently verified Binance HMAC headers', async () => {
  const calls = []
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    calls.push(parsed)
    if (parsed.hostname === 'bsc-dataseed.bnbchain.org') {
      const input = JSON.parse(options.body)
      return Response.json(Array.isArray(input) ? input.map(item => rpcResult(item)) : rpcResult(input))
    }
    assert.equal(parsed.hostname, 'web3.binance.com')
    assert.equal(options.method, 'GET', 'route checking never submits an order or transaction')
    const signed = options.headers['X-OC-TIMESTAMP'] + 'GET' + parsed.pathname + parsed.search
    assert.equal(options.headers['X-OC-SIGN'], createHmac('sha256', credentials.secretKey).update(signed).digest('base64'))
    assert.equal(options.headers['X-OC-APIKEY'], credentials.apiKey)
    assert.ok(!String(url).includes(credentials.secretKey))
    if (parsed.pathname.endsWith('/supported/chain')) return Response.json(result([{ binanceChainId: '56' }]))
    assert.equal(parsed.pathname, '/build/api/v1/dex/aggregator/quote')
    assert.equal(parsed.searchParams.get('amount'), '5000000000000000000')
    assert.equal(parsed.searchParams.get('fromTokenAddress'), BSC_USDT.address)
    assert.equal(parsed.searchParams.get('toTokenAddress'), assets.NVDAon)
    assert.equal(parsed.searchParams.get('userWalletAddress'), wallet)
    return Response.json(result([route()]))
  }
  const checked = await getTradingRoute('NVDAon', 'buy', '5', wallet, credentials)
  assert.equal(checked.outputAmount, '0.025')
  assert.equal(checked.outputSymbol, 'NVDAon')
  assert.equal(checked.inputSymbol, 'USDT')
  assert.equal(checked.executable, false)
  assert.equal(checked.executionMode, 'RFQ')
  assert.equal(calls.filter(url => url.hostname === 'web3.binance.com').length, 2)
  assert.ok(!Object.hasOwn(checked, 'quoteId') && !Object.hasOwn(checked, 'tx'), 'no executable provider payload leaks into this check')
})

test('sell routes use on-chain token decimals, reject excess precision, and return USDT units correctly', async () => {
  let quoted = 0
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    if (parsed.hostname === 'bsc-dataseed.bnbchain.org') {
      const input = JSON.parse(options.body)
      return Response.json(Array.isArray(input) ? input.map(item => rpcResult(item, 6)) : rpcResult(input, 6))
    }
    if (parsed.pathname.endsWith('/supported/chain')) return Response.json(result([{ binanceChainId: '56' }]))
    quoted += 1
    assert.equal(parsed.searchParams.get('amount'), '12500')
    assert.equal(parsed.searchParams.get('fromTokenAddress'), assets.NVDAon)
    assert.equal(parsed.searchParams.get('toTokenAddress'), BSC_USDT.address)
    return Response.json(result([route({ fromTokenAmount: '12500', toTokenAmount: '2500000000000000000',
      fromToken: token(assets.NVDAon, '6'), toToken: token(BSC_USDT.address) })]))
  }
  const checked = await getTradingRoute('NVDAon', 'sell', '0.0125', wallet, credentials)
  assert.equal(checked.outputAmount, '2.5')
  assert.equal(checked.outputSymbol, 'USDT')
  await assert.rejects(() => getTradingRoute('NVDAon', 'sell', '0.0000001', wallet, credentials), /invalid_amount/)
  assert.equal(quoted, 1, 'over-precision amounts never reach the quote provider')
})

test('normalization rejects wrong-chain, wrong-token, wrong-amount, wrong-decimal and non-RFQ responses', () => {
  for (const changes of [{ binanceChainId: '1' }, { fromTokenAmount: '5000000' }, { toToken: token(other) },
    { fromToken: token(BSC_USDT.address, '6') }, { executionMode: 'SWAP' }, { toTokenAmount: '1e6' }, { quoteId: '' }])
    assert.throws(() => normalizeRoutes(result([route(changes)]), request()), /no_verified_route/)
  assert.throws(() => normalizeRoutes(result([]), request()), /no_verified_route/)
  assert.throws(() => normalizeRoutes(result({}), request()), /invalid_provider_response/)
  assert.throws(() => normalizeRoutes({ ...result([route()]), timestamp: Date.now() - 60_000 }, request()), /stale_quote/)
  assert.throws(() => normalizeRoutes(result([route()]), request({ startedAt: Date.now() - 31_000 })), /stale_quote/)
})

test('the highest valid output is selected with integer precision, excluding larger unverified routes', () => {
  const checked = normalizeRoutes(result([
    route({ toTokenAmount: '25000000000000001', vendorName: 'InchFusion' }),
    route(), route({ binanceChainId: '1', toTokenAmount: '999999999999999999999' }),
  ]), request())
  assert.equal(checked.vendor, 'InchFusion')
  assert.equal(checked.outputAmount, '0.025000000000000001')
})

test('missing keys, unsupported BSC, and provider auth errors fail closed', async () => {
  await assert.rejects(() => getTradingRoute('NVDAon', 'buy', '5', wallet, { apiKey: '', secretKey: '' }), /not_configured/)
  globalThis.fetch = async (url, options) => {
    if (new URL(url).hostname === 'bsc-dataseed.bnbchain.org') {
      const input = JSON.parse(options.body)
      return Response.json(Array.isArray(input) ? input.map(item => rpcResult(item)) : rpcResult(input))
    }
    return Response.json(result([{ binanceChainId: '1' }]))
  }
  await assert.rejects(() => getTradingRoute('NVDAon', 'buy', '5', wallet, credentials), /chain_unavailable/)
  globalThis.fetch = async (url, options) => {
    if (new URL(url).hostname === 'bsc-dataseed.bnbchain.org') {
      const input = JSON.parse(options.body)
      return Response.json(Array.isArray(input) ? input.map(item => rpcResult(item)) : rpcResult(input))
    }
    return new Response('', { status: 403 })
  }
  await assert.rejects(() => getTradingRoute('NVDAon', 'buy', '5', wallet, credentials), /provider_auth_error/)
})

test('HTTP route checks require same origin, small valid input, ownership proof and the account rate limit', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256')
  const userId = 'did:privy:fixture123'
  let rateCalls = 0
  let limited = false
  const env = { PRIVY_APP_ID: 'test-app', PRIVY_VERIFICATION_KEY: await exportSPKI(publicKey),
    BINANCE_WEB3_API_KEY: credentials.apiKey, BINANCE_WEB3_SECRET_KEY: credentials.secretKey,
    ACCOUNTS: { idFromName: id => id, get: id => ({ fetch: async req => {
      assert.equal(id, userId); assert.equal(req.headers.get('X-Privy-DID'), userId); rateCalls += 1
      return Response.json({}, { status: limited ? 429 : 200 })
    } }) } }
  const identity = await new SignJWT({ linked_accounts: JSON.stringify([{ type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: wallet }]) })
    .setProtectedHeader({ alg: 'ES256' }).setIssuer('privy.io').setAudience(env.PRIVY_APP_ID).setSubject(userId).setExpirationTime('1h').sign(privateKey)
  const input = { symbol: 'NVDAon', side: 'buy', amount: '5', walletAddress: wallet }
  const check = (value = input, headers = {}) => handleTradingRoute(new Request('https://firstbell.example/api/trade/route', {
    method: 'POST', headers: { Origin: 'https://firstbell.example', 'Content-Type': 'application/json', 'privy-id-token': identity, ...headers },
    body: JSON.stringify(value),
  }), env, userId)
  assert.equal((await check(input, { Origin: 'https://attacker.example' })).status, 403)
  assert.equal((await check({ ...input, extra: 'x'.repeat(600) })).status, 413)
  assert.equal((await check({ ...input, amount: '1e3' })).status, 400)
  assert.equal((await check({ ...input, walletAddress: other })).status, 403)
  assert.equal((await check(input, { 'privy-id-token': '' })).status, 403)
  assert.equal(rateCalls, 0)
  limited = true
  const limitedResponse = await check()
  assert.equal(limitedResponse.status, 429)
  assert.equal((await limitedResponse.json()).error, 'rate_limited')
  assert.equal(rateCalls, 1)
  limited = false
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    if (parsed.hostname === 'bsc-dataseed.bnbchain.org') {
      const input = JSON.parse(options.body)
      return Response.json(Array.isArray(input) ? input.map(item => rpcResult(item)) : rpcResult(input))
    }
    return Response.json(result(parsed.pathname.endsWith('/supported/chain') ? [{ binanceChainId: '56' }] : [route()]))
  }
  const ready = await check()
  assert.equal(ready.status, 200)
  assert.equal(ready.headers.get('Cache-Control'), 'no-store')
  assert.equal((await ready.json()).route.executable, false)
  assert.equal(rateCalls, 2)
})
