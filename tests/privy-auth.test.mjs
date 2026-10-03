import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { afterEach, test } from 'node:test'
import { exportJWK, exportSPKI, generateKeyPair, SignJWT } from 'jose'
import { verifyPrivyToken } from '../worker/privy-auth.ts'
import { verifyWalletIdentity } from '../worker/deposits.ts'
import { createVercelHandler } from '../server/vercel.ts'

const originalFetch = globalThis.fetch, originalWarn = console.warn
afterEach(() => { globalThis.fetch = originalFetch; console.warn = originalWarn })
const user = 'did:privy:fixture123'
const wallet = '0x1111111111111111111111111111111111111111'
const keys = async (kid = 'active') => {
  const pair = await generateKeyPair('ES256')
  return { ...pair, jwk: { ...await exportJWK(pair.publicKey), kid, alg: 'ES256', use: 'sig' } }
}
function sign(pair, appId, claims = {}, header = {}) {
  return new SignJWT({ iss: 'privy.io', aud: appId, sub: user, exp: Math.floor(Date.now() / 1000) + 3600, ...claims })
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: pair.jwk.kid, ...header }).sign(pair.privateKey)
}
function published(appId, jwks) {
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push(url)
    assert.equal(String(url), `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`)
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual')
    assert.ok(init.signal); assert.equal(new Headers(init.headers).has('Authorization'), false)
    return Response.json({ keys: jwks })
  }
  return calls
}

test('configured PEM accepts a valid token without network access, including escaped newlines', async () => {
  const pair = await keys(), appId = 'pem-fixture'
  globalThis.fetch = async () => { throw new Error('verification must stay local') }
  const payload = await verifyPrivyToken(await sign(pair, appId), {
    PRIVY_APP_ID: appId, PRIVY_VERIFICATION_KEY: (await exportSPKI(pair.publicKey)).replace(/\n/g, '\\n'),
  })
  assert.equal(payload.sub, user)
})

test('stale or malformed PEM falls back to app-pinned published keys, shared by access and wallet identity', async () => {
  const access = await keys('access'), identity = await keys('identity'), stale = await keys('stale')
  const appId = 'fallback-fixture', calls = published(appId, [access.jwk, identity.jwk])
  const env = { PRIVY_APP_ID: appId, PRIVY_VERIFICATION_KEY: await exportSPKI(stale.publicKey) }
  assert.equal((await verifyPrivyToken(await sign(access, appId), env)).sub, user)
  assert.equal((await verifyPrivyToken(await sign(access, appId, {}, { kid: undefined }), env)).sub, user,
    'older tokens without a key ID must still verify against the published keys')
  const rejected = []
  console.warn = (...entry) => rejected.push(entry)
  assert.equal(await verifyPrivyToken(await sign(identity, appId, { aud: 'wrong-app' }, { kid: undefined }), env), null)
  assert.equal(await verifyPrivyToken(await sign(stale, appId, {}, { kid: undefined }), { PRIVY_APP_ID: appId }), null)
  const proof = await sign(identity, appId, { linked_accounts: JSON.stringify([
    { type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy_v2', address: wallet },
  ]) })
  assert.equal(await verifyWalletIdentity(proof, env, user, wallet), true)
  assert.equal(await verifyWalletIdentity(proof, env, 'did:privy:another123', wallet), false)
  assert.equal(await verifyWalletIdentity(proof, env, user, '0x2222222222222222222222222222222222222222'), false)
  assert.equal((await verifyPrivyToken(await sign(access, appId), { ...env, PRIVY_VERIFICATION_KEY: 'wrong pasted value' })).sub, user)
  assert.equal(calls.length, 1, 'both token types share the cached app key set')
})

test('published-key verification rejects forged signatures and bad claims without trusting token key URLs', async () => {
  const pair = await keys(), attacker = await keys(), appId = 'claims-fixture'
  const calls = published(appId, [pair.jwk]), env = { PRIVY_APP_ID: appId }, logs = []
  console.warn = (...entry) => logs.push(entry)
  assert.equal((await verifyPrivyToken(await sign(pair, appId, {}, { jku: 'https://attacker.example/keys', x5u: 'https://attacker.example/cert' }), env)).sub, user)
  for (const claims of [{ iss: 'attacker' }, { aud: 'wrong-app' }, { exp: 1 }, { exp: undefined },
    { sub: 'not-a-privy-user' }, { nbf: Math.floor(Date.now() / 1000) + 1000 }]) {
    assert.equal(await verifyPrivyToken(await sign(pair, appId, claims), env), null)
  }
  const forged = await sign(attacker, appId)
  assert.equal(await verifyPrivyToken(forged, env), null)
  assert.equal(await verifyPrivyToken('eyJhbGciOiJub25lIn0.e30.', env), null)
  assert.equal(await verifyPrivyToken('not-a-token', env), null)
  assert.equal(await verifyPrivyToken('x'.repeat(64 * 1024 + 1), env), null)
  assert.equal(calls.length, 1)
  const logged = JSON.stringify(logs)
  assert.ok(!logged.includes(forged)); assert.ok(!logged.includes(user)); assert.ok(!logged.includes(wallet))
})

test('valid signed-in config request reaches MoonPay with no manually pasted verification key', async () => {
  const pair = await keys(), appId = 'checkout-fixture', calls = []
  globalThis.fetch = async (url, init) => {
    calls.push(String(url))
    if (String(url) === `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`) return Response.json({ keys: [pair.jwk] })
    assert.equal(new URL(url).origin, 'https://api.moonpay.com')
    assert.equal(new URL(url).pathname, '/v3/currencies')
    assert.equal(new URL(url).searchParams.get('apiKey'), 'pk_test_auth_fixture')
    assert.ok(init.signal)
    return Response.json([
      { type: 'crypto', code: 'eth', isSuspended: false, supportsTestMode: true,
        metadata: { chainId: '1', networkCode: 'ethereum', contractAddress: '0x0000000000000000000000000000000000000000' } },
      { type: 'fiat', code: 'usd', name: 'US Dollar', minBuyAmount: 20, maxBuyAmount: 500 },
    ])
  }
  const handler = createVercelHandler({ PRIVY_APP_ID: appId, CARD_FUNDING_PROVIDER: 'moonpay', MOONPAY_ENVIRONMENT: 'sandbox',
    MOONPAY_PUBLISHABLE_KEY: 'pk_test_auth_fixture', MOONPAY_SECRET_KEY: 'sk_test_auth_fixture' })
  const request = token => new Request('https://firstbell.example/api/index?__fb_path=deposits/config', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  assert.equal((await handler(request())).status, 401)
  assert.equal(calls.length, 0, 'unauthenticated visitors cannot call the provider')
  const response = await handler(request(await sign(pair, appId)))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ready: true, mode: 'sandbox', reason: null,
    fiatCurrencies: [{ code: 'usd', name: 'US Dollar', min: 20, max: 500 }] })
  assert.equal(calls.length, 2)
})

test('sandbox checkout verifies access plus server wallet lookup or identity, persists and resumes only for its owner', async () => {
  const access = await keys('checkout-access'), identity = await keys('checkout-identity'), stale = await keys('old-key')
  const appId = 'full-checkout-fixture', origin = 'https://firstbell.example', ip = '203.0.113.42'
  const env = { VERCEL: '1', PRIVY_APP_ID: appId, PRIVY_APP_SECRET: 'fixture-app-secret', PRIVY_VERIFICATION_KEY: await exportSPKI(stale.publicKey),
    CARD_FUNDING_PROVIDER: 'moonpay', MOONPAY_ENVIRONMENT: 'sandbox', MOONPAY_PUBLISHABLE_KEY: 'pk_test_full_checkout_fixture',
    MOONPAY_SECRET_KEY: 'sk_test_full_checkout_fixture',
    UPSTASH_REDIS_REST_URL: 'https://checkout-fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'fixture-redis-token' }
  const records = new Map(), commands = [], upstream = []
  globalThis.fetch = async (url, init) => {
    if (String(url) === env.UPSTASH_REDIS_REST_URL) {
      assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error'); assert.ok(init.signal)
      assert.equal(new Headers(init.headers).get('Authorization'), `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`)
      const args = JSON.parse(init.body); commands.push(args)
      assert.equal(args[0], 'EVAL'); assert.equal(args[2], 1)
      const key = args[3]
      if (args.length === 4) return Response.json({ result: records.get(key) ?? null })
      assert.equal(args.length, 6)
      assert.match(args[1], /redis.call\('GET'/); assert.match(args[1], /redis.call\('SET'/)
      const same = (records.get(key) ?? '') === args[4]
      if (same) records.set(key, args[5])
      return Response.json({ result: same ? 1 : 0 })
    }
    upstream.push(String(url))
    if (String(url) === `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`) {
      assert.equal(init.redirect, 'manual')
      return Response.json({ keys: [access.jwk, identity.jwk] })
    }
    const endpoint = new URL(url)
    if (endpoint.origin === 'https://api.privy.io') {
      assert.equal(endpoint.pathname, `/v1/users/${encodeURIComponent(user)}`)
      assert.equal(init.headers['privy-app-id'], appId)
      assert.equal(init.headers.Authorization, `Basic ${Buffer.from(appId + ':' + env.PRIVY_APP_SECRET).toString('base64')}`)
      return Response.json({ id: user, linked_accounts: [
        { type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: wallet },
      ] })
    }
    assert.equal(endpoint.origin, 'https://api.moonpay.com'); assert.equal(endpoint.pathname, '/v3/currencies')
    assert.equal(endpoint.searchParams.get('show'), 'enabled')
    assert.equal(endpoint.searchParams.get('apiKey'), env.MOONPAY_PUBLISHABLE_KEY)
    return Response.json([
      { type: 'crypto', code: 'eth', isSuspended: false, supportsTestMode: true,
        metadata: { chainId: '1', networkCode: 'ethereum', contractAddress: '0x0000000000000000000000000000000000000000' } },
      { type: 'fiat', code: 'usd', name: 'US Dollar', minBuyAmount: 20, maxBuyAmount: 500 },
    ])
  }
  const accessToken = await sign(access, appId)
  const identityToken = await sign(identity, appId, { linked_accounts: JSON.stringify([
    { type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: wallet },
  ]) })
  const otherUser = 'did:privy:other456', otherAccess = await sign(access, appId, { sub: otherUser })
  const otherIdentity = await sign(identity, appId, { sub: otherUser, linked_accounts: JSON.stringify([
    { type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: wallet },
  ]) })
  const call = (path, input, changes = {}) => {
    const headers = new Headers({ Authorization: `Bearer ${accessToken}`, 'privy-id-token': identityToken,
      Origin: origin, 'Content-Type': 'application/json', 'x-vercel-forwarded-for': ip,
      'CF-Connecting-IP': '198.51.100.5', 'True-Client-IP': '198.51.100.5' })
    for (const [key, value] of Object.entries(changes)) value === null ? headers.delete(key) : headers.set(key, value)
    // Each call creates a fresh server adapter; persistence must come from Redis.
    return createVercelHandler(env)(new Request(`${origin}/api/index?__fb_path=${path}`, {
      method: input ? 'POST' : 'GET', headers, ...(input ? { body: JSON.stringify(input) } : {}),
    }))
  }
  assert.equal((await (await call('deposits/config')).json()).ready, true)
  assert.equal(commands.length, 0, 'config does not initialize an account or a checkout')
  const input = { walletAddress: wallet, theme: 'dark' }
  for (const [changes, body, status, reason] of [
    [{ 'privy-id-token': 'invalid-jwt' }, input, 403, 'wallet_not_verified'],
    [{}, { ...input, walletAddress: '0x2222222222222222222222222222222222222222' }, 403, 'wallet_not_verified'],
    [{ 'privy-id-token': otherIdentity }, input, 403, 'wallet_not_verified'],
    [{ Origin: 'https://attacker.example' }, input, 403, 'invalid_origin'],
    [{ 'x-vercel-forwarded-for': null }, input, 400, 'connection_unverified'],
  ]) {
    const rejected = await call('deposits/checkout', body, changes)
    assert.equal(rejected.status, status); assert.deepEqual(await rejected.json(), { error: reason })
  }
  assert.equal(records.size, 0); assert.equal(commands.length, 0)
  const response = await call('deposits/checkout', input, { 'privy-id-token': null })
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const checkout = await response.json(), session = checkout.session, url = new URL(checkout.checkoutUrl)
  assert.equal(session.status, 'awaiting_payment'); assert.equal(session.mode, 'sandbox')
  assert.equal(session.currencyCode, 'eth'); assert.equal(session.walletAddress, wallet)
  assert.equal(session.amount, ''); assert.equal(session.fiatCurrency, '')
  assert.equal(session.amountSelection, 'moonpay')
  assert.equal(session.transactionHash, null); assert.equal(session.receivedAmount, null)
  assert.equal(url.origin, 'https://buy-sandbox.moonpay.com')
  const expected = { apiKey: env.MOONPAY_PUBLISHABLE_KEY, currencyCode: 'eth', walletAddress: wallet,
    externalTransactionId: session.id, externalCustomerId: session.customerId, theme: 'dark',
    redirectURL: `${origin}/app/?tab=portfolio&deposit=${session.id}` }
  for (const [key, value] of Object.entries(expected)) assert.equal(url.searchParams.get(key), value)
  for (const key of ['baseCurrencyCode', 'baseCurrencyAmount', 'lockAmount', 'paymentMethod']) {
    assert.equal(url.searchParams.has(key), false, 'MoonPay collects amount, fiat and payment method in its own UI')
  }
  assert.notEqual(session.customerId, user)
  const mac = value => createHmac('sha256', env.MOONPAY_SECRET_KEY).update(value).digest('base64')
  assert.equal(url.searchParams.get('allowedIpAddress'), mac(ip), 'use the trusted Vercel IP, not supplied Cloudflare headers')
  const signature = url.searchParams.get('signature'); url.searchParams.delete('signature')
  assert.equal(signature, mac(url.search), 'sign the exact final query')
  assert.equal(records.size, 1)
  assert.deepEqual((await (await call('deposits')).json()).sessions, [session])
  assert.deepEqual((await (await call('deposits', undefined, { Authorization: `Bearer ${otherAccess}` })).json()).sessions, [])
  const stolen = await call('deposits/checkout', { ...input, sessionId: session.id }, {
    Authorization: `Bearer ${otherAccess}`, 'privy-id-token': otherIdentity,
  })
  assert.equal(stolen.status, 409); assert.deepEqual(await stolen.json(), { error: 'invalid_session' })
  const resumed = await call('deposits/checkout', { ...input, sessionId: session.id, amount: '99' })
  assert.equal(resumed.status, 200)
  const reopened = await resumed.json()
  assert.deepEqual(reopened.session, session); assert.equal(reopened.checkoutUrl, checkout.checkoutUrl)
  assert.deepEqual((await (await call('deposits')).json()).sessions, [session], 'resume does not duplicate the persisted session')
  assert.equal(commands.filter(args => args.length === 6).length, 2, 'only create and owner resume write storage')
  assert.equal(upstream.length, 3, 'one app JWKS fetch, one server wallet lookup and one currency fetch; no payment or order')
  const captured = JSON.stringify([checkout, reopened, ...records.values()])
  for (const secret of [accessToken, identityToken, otherAccess, otherIdentity, env.PRIVY_APP_SECRET, env.MOONPAY_SECRET_KEY, env.UPSTASH_REDIS_REST_TOKEN]) {
    assert.equal(captured.includes(secret), false)
  }
})

test('redirected, malformed, oversized and unavailable key responses fail closed', async () => {
  const pair = await keys(), logs = []
  console.warn = (...entry) => logs.push(entry)
  const responses = [() => new Response(null, { status: 302, headers: { Location: 'https://attacker.example/keys' } }),
    () => new Response('not-json'), () => Response.json({ keys: [] }),
    () => new Response('x'.repeat(65 * 1024)), () => { throw new Error('provider unavailable') }]
  for (const [index, response] of responses.entries()) {
    const appId = `unavailable-fixture-${index}`
    globalThis.fetch = async (url, init) => {
      assert.equal(String(url), `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`)
      assert.equal(init.redirect, 'manual')
      return response()
    }
    assert.equal(await verifyPrivyToken(await sign(pair, appId), { PRIVY_APP_ID: appId }), null)
  }
  globalThis.fetch = async () => { throw new Error('invalid app must not fetch') }
  assert.equal(await verifyPrivyToken(await sign(pair, 'claims-fixture'), { PRIVY_APP_ID: '../attacker' }), null)
})
