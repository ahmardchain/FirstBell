import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { generateKeyPair, exportSPKI, SignJWT } from 'jose'
import { verifyWalletIdentity, WalletVerificationError } from '../worker/wallet-verification.ts'
import { createVercelHandler } from '../server/vercel.ts'

const originalFetch = globalThis.fetch
after(() => { globalThis.fetch = originalFetch })
const user = 'did:privy:lookupfixture123'
const wallet = '0x1111111111111111111111111111111111111111'
const linked = { type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: wallet }
const secret = 'fixture-app-secret'
const lookupEnv = { PRIVY_APP_ID: 'server-lookup-fixture', PRIVY_APP_SECRET: secret }

test('missing identity uses the official server lookup and caches only verified owned wallets', async () => {
  let calls = 0
  globalThis.fetch = async (url, init) => {
    calls++
    assert.equal(String(url), `https://api.privy.io/v1/users/${encodeURIComponent(user)}`)
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'error'); assert.ok(init.signal)
    assert.equal(init.headers.Authorization, `Basic ${Buffer.from(lookupEnv.PRIVY_APP_ID + ':' + secret).toString('base64')}`)
    assert.equal(init.headers['privy-app-id'], lookupEnv.PRIVY_APP_ID)
    return Response.json({ id: user, linked_accounts: [linked] })
  }
  assert.equal(await verifyWalletIdentity(null, lookupEnv, user, wallet), true)
  assert.equal(await verifyWalletIdentity('', lookupEnv, user, wallet.toUpperCase().replace('0X', '0x')), true)
  assert.equal(calls, 1)
  assert.equal(await verifyWalletIdentity(null, lookupEnv, 'not-a-did', wallet), false)
  assert.equal(calls, 1)
})

test('server lookup rejects another user, another wallet, external wallets and another chain', async () => {
  const cases = [
    { id: 'did:privy:another123', linked_accounts: [linked] },
    { id: user, linked_accounts: [{ ...linked, address: '0x2222222222222222222222222222222222222222' }] },
    { id: user, linked_accounts: [{ ...linked, wallet_client_type: 'metamask' }] },
    { id: user, linked_accounts: [{ ...linked, chain_type: 'solana' }] },
    { id: user, linked_accounts: [] },
  ]
  for (let i = 0; i < cases.length; i++) {
    globalThis.fetch = async () => Response.json(cases[i])
    assert.equal(await verifyWalletIdentity(null, { ...lookupEnv, PRIVY_APP_ID: `reject-lookup-${i}` }, user, wallet), false)
  }
})

test('a supplied invalid or mismatched identity is never repaired by a server lookup', async () => {
  const pair = await generateKeyPair('ES256')
  const env = { ...lookupEnv, PRIVY_VERIFICATION_KEY: await exportSPKI(pair.publicKey) }
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('unexpected lookup') }
  const identity = await new SignJWT({ linked_accounts: JSON.stringify([linked]) })
    .setProtectedHeader({ alg: 'ES256' }).setSubject('did:privy:otheruser123').setIssuer('privy.io')
    .setAudience(env.PRIVY_APP_ID).setExpirationTime('1h').sign(pair.privateKey)
  assert.equal(await verifyWalletIdentity(identity, env, user, wallet), false)
  assert.equal(await verifyWalletIdentity('invalid-jwt', env, user, wallet), false)
  assert.equal(calls, 0)
})

test('missing secret and upstream failures have fixed setup/error categories without private data', async () => {
  await assert.rejects(() => verifyWalletIdentity(null, { PRIVY_APP_ID: 'no-secret-fixture' }, user, wallet),
    error => error instanceof WalletVerificationError && error.message === 'wallet_verification_not_configured')
  for (const status of [401, 429, 500]) {
    globalThis.fetch = async () => new Response('private response must not be exposed', { status })
    await assert.rejects(() => verifyWalletIdentity(null, { ...lookupEnv, PRIVY_APP_ID: `failure-lookup-${status}` }, user, wallet),
      error => error.message === (status === 401 ? 'wallet_verification_not_configured' : 'wallet_verification_unavailable'))
  }
  globalThis.fetch = async () => new Response('x'.repeat(128 * 1024 + 1))
  await assert.rejects(() => verifyWalletIdentity(null, { ...lookupEnv, PRIVY_APP_ID: 'oversize-lookup' }, user, wallet), /wallet_verification_unavailable/)
})

test('Vercel receives only verified access identity before a no-identity checkout lookup', async () => {
  const pair = await generateKeyPair('ES256'), appId = 'adapter-lookup-fixture'
  const env = { VERCEL: '1', PRIVY_APP_ID: appId, PRIVY_VERIFICATION_KEY: await exportSPKI(pair.publicKey), PRIVY_APP_SECRET: secret,
    CARD_FUNDING_PROVIDER: 'moonpay', MOONPAY_ENVIRONMENT: 'sandbox', MOONPAY_PUBLISHABLE_KEY: 'pk_test_lookup_fixture', MOONPAY_SECRET_KEY: 'sk_test_lookup_fixture' }
  let calls = 0
  globalThis.fetch = async (url, init) => {
    calls++
    assert.equal(String(url), `https://api.privy.io/v1/users/${encodeURIComponent(user)}`)
    assert.equal(init.headers['privy-app-id'], appId)
    // Wrong wallet must be rejected before MoonPay or account storage is touched.
    return Response.json({ id: user, linked_accounts: [{ ...linked, address: '0x2222222222222222222222222222222222222222' }] })
  }
  const access = await new SignJWT({}).setProtectedHeader({ alg: 'ES256' }).setSubject(user).setIssuer('privy.io')
    .setAudience(appId).setExpirationTime('1h').sign(pair.privateKey)
  const make = authenticated => new Request('https://firstbell.example/api/index?__fb_path=deposits/checkout', {
    method: 'POST', headers: { Origin: 'https://firstbell.example', 'Content-Type': 'application/json',
      ...(authenticated ? { Authorization: `Bearer ${access}` } : {}) }, body: JSON.stringify({ walletAddress: wallet }),
  })
  const handler = createVercelHandler(env)
  assert.equal((await handler(make(false))).status, 401); assert.equal(calls, 0)
  const rejected = await handler(make(true))
  assert.equal(rejected.status, 403); assert.deepEqual(await rejected.json(), { error: 'wallet_not_verified' }); assert.equal(calls, 1)
})
