import assert from 'node:assert/strict'
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
  const handler = createVercelHandler({ PRIVY_APP_ID: appId, MOONPAY_ENVIRONMENT: 'sandbox',
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
