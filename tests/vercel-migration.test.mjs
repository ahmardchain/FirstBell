import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { exportSPKI, generateKeyPair, SignJWT } from 'jose'
import { createAccountNamespace } from '../server/account-storage.ts'
import { createVercelHandler, normalizeVercelRequest } from '../server/vercel.ts'
import { customerIp } from '../worker/moonpay.ts'
import { assets } from '../worker/market.ts'
import { readFile } from 'node:fs/promises'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const user = 'did:privy:fixture123'
const otherUser = 'did:privy:other456'
const env = { PRIVY_APP_ID: 'fixture-app', UPSTASH_REDIS_REST_URL: 'https://fixture-db.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'fixture-redis-secret' }
const internal = (id = user, method = 'GET', body, path = '/') => new Request(`https://account.internal${path}`, {
  method, headers: { 'X-Privy-DID': id }, ...(body ? { body: JSON.stringify(body) } : {}),
})

function redisFixture(initial = {}) {
  const records = new Map(Object.entries(initial)), commands = []
  const fetcher = async (url, init) => {
    assert.equal(url, env.UPSTASH_REDIS_REST_URL)
    assert.equal(init.headers.Authorization, `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`)
    assert.equal(init.redirect, 'error')
    const command = JSON.parse(init.body); commands.push(command)
    assert.equal(command[0], 'EVAL')
    assert.equal(command[2], 1)
    const key = command[3]
    if (command.length === 4) return Response.json({ result: records.get(key) ?? null })
    assert.match(command[1], /redis.call\('GET'/)
    assert.match(command[1], /redis.call\('SET'/)
    const same = (records.get(key) ?? '') === command[4]
    if (same) records.set(key, command[5])
    return Response.json({ result: same ? 1 : 0 })
  }
  return { records, commands, fetcher }
}
const namespace = (database, fields = env, extra = {}) => createAccountNamespace(fields, { fetcher: database.fetcher, ...extra })
const stub = (store, id = user) => store.get(store.idFromName(id))

test('accounts persist across independent instances and concurrent bookmarks preserve both writes', async () => {
  const db = redisFixture(), first = namespace(db), second = namespace(db)
  const [one, two] = await Promise.all([
    stub(first).fetch(internal(user, 'PUT', { symbol: 'AAPLon', saved: true })),
    stub(second).fetch(internal(user, 'PUT', { symbol: 'NVDAon', saved: true })),
  ])
  assert.equal(one.status, 200); assert.equal(two.status, 200)
  const account = (await (await stub(namespace(db)).fetch(internal())).json()).account
  assert.deepEqual(account.saved.sort(), ['AAPLon', 'NVDAon'])
  const distinct = (await (await stub(namespace(db), otherUser).fetch(internal(otherUser))).json()).account
  assert.equal(distinct.id, otherUser); assert.deepEqual(distinct.saved, [])
  assert.equal((await stub(first).fetch(internal(otherUser))).status, 400)
  assert.equal((await stub(first).fetch(internal(user, 'PUT', { symbol: 'GOOG', saved: true }))).status, 400)
  assert.equal(db.records.size, 2)
})

test('quote limit survives new server instances and concurrent calls cannot exceed six', async () => {
  const db = redisFixture()
  for (let i = 0; i < 5; i++) assert.equal((await stub(namespace(db)).fetch(internal(user, 'POST', undefined, '/quote-rate'))).status, 200)
  const results = await Promise.all(Array.from({ length: 5 }, () => stub(namespace(db)).fetch(internal(user, 'POST', undefined, '/quote-rate'))))
  assert.equal(results.filter(r => r.status === 200).length, 1)
  assert.ok(results.filter(r => r.status !== 200).every(r => r.status === 429))
  assert.equal((await stub(namespace(db)).fetch(internal(user, 'POST', undefined, '/quote-rate'))).status, 429)
})

test('storage errors fail closed, do not leak provider credentials, and do not retry ambiguous writes', async () => {
  let calls = 0
  const fetcher = async () => { calls++; return Response.json({ error: env.UPSTASH_REDIS_REST_TOKEN }) }
  for (const config of [{ PRIVY_APP_ID: env.PRIVY_APP_ID }, { ...env, UPSTASH_REDIS_REST_URL: 'http://fixture-db.upstash.io' },
    { ...env, UPSTASH_REDIS_REST_URL: 'https://untrusted.example' }]) {
    const response = await stub(createAccountNamespace(config, { fetcher })).fetch(internal())
    assert.equal(response.status, 503)
  }
  assert.equal(calls, 0)
  const response = await stub(createAccountNamespace(env, { fetcher })).fetch(internal())
  assert.equal(response.status, 503); assert.ok(!(await response.text()).includes(env.UPSTASH_REDIS_REST_TOKEN))
  const db = redisFixture()
  const ambiguous = async (url, init) => {
    const result = await db.fetcher(url, init)
    if (JSON.parse(init.body).length > 4) throw new Error('network lost after committing')
    return result
  }
  assert.equal((await stub(createAccountNamespace(env, { fetcher: ambiguous })).fetch(internal())).status, 503)
  assert.equal(db.commands.length, 2, 'one read and one write; no unknown-result retry')
  assert.equal(db.records.size, 1)
})

test('authenticated legacy import preserves saved stocks and complete deposit records without reimporting', async () => {
  const db = redisFixture(), authorization = 'Bearer fixture-legacy-token', legacyCalls = []
  const deposit = { id: 'd228e63d-627e-4e3c-8dfb-b916a8950ff0', customerId: 'fixture-customer',
    walletAddress: '0x1111111111111111111111111111111111111111', amount: '50', fiatCurrency: 'usd', mode: 'live',
    currencyCode: 'usdt_bsc', status: 'completed', createdAt: new Date().toISOString(), checkedAt: null,
    transactionId: 'fixture-provider-id', transactionHash: `0x${'ab'.repeat(32)}`, receivedAmount: '47' }
  const fetcher = async (url, init) => {
    if (url === env.UPSTASH_REDIS_REST_URL) return db.fetcher(url, init)
    assert.equal(new URL(url).origin, 'https://firstbell.ahmardchain.workers.dev')
    assert.equal(init.headers.Authorization, authorization); assert.equal(init.redirect, 'error')
    legacyCalls.push(url)
    return Response.json(url.endsWith('/api/me') ? { account: { id: user, createdAt: '2026-09-30T12:00:00.000Z',
      lastSeenAt: '2026-10-02T19:00:00.000Z', saved: ['MSFTon'] } } : { sessions: [deposit] })
  }
  const fields = { ...env, LEGACY_ACCOUNTS_ORIGIN: 'https://firstbell.ahmardchain.workers.dev' }
  const first = createAccountNamespace(fields, { fetcher, legacyAuthorization: authorization })
  assert.equal((await stub(first).fetch(internal(user, 'PUT', { symbol: 'AAPLon', saved: true }))).status, 200)
  const second = createAccountNamespace(fields, { fetcher, legacyAuthorization: authorization })
  const response = await stub(second).fetch(internal(user, 'GET', undefined, '/deposits'))
  assert.deepEqual((await response.json()).sessions, [deposit])
  const account = (await (await stub(second).fetch(internal())).json()).account
  assert.deepEqual(account.saved, ['MSFTon', 'AAPLon'])
  assert.equal(account.createdAt, '2026-09-30T12:00:00.000Z')
  assert.equal(legacyCalls.length, 2)
  const invalid = createAccountNamespace({ ...fields, LEGACY_ACCOUNTS_ORIGIN: 'https://untrusted.example' }, { fetcher, legacyAuthorization: authorization })
  assert.equal((await stub(invalid, otherUser).fetch(internal(otherUser))).status, 503)
  assert.equal(db.records.size, 1, 'failed import cannot initialize an empty replacement')
})

test('Vercel adapter preserves the body and origin while accepting only its platform IP header', async () => {
  const make = () => new Request('https://firstbell.example/api/index?__fb_path=me/saved&frame=15m', {
    method: 'PUT', body: '{"symbol":"AAPLon","saved":true}', headers: { Origin: 'https://firstbell.example',
      'CF-Connecting-IP': '198.51.100.2', 'True-Client-IP': '198.51.100.2', 'x-vercel-forwarded-for': '203.0.113.42' },
  })
  const request = normalizeVercelRequest(make(), true)
  assert.equal(request.url, 'https://firstbell.example/api/me/saved?frame=15m')
  assert.equal(request.headers.get('Origin'), 'https://firstbell.example')
  assert.equal(await request.text(), '{"symbol":"AAPLon","saved":true}')
  assert.equal(customerIp(request), '203.0.113.42')
  assert.equal(customerIp(normalizeVercelRequest(make(), false)), null)
  assert.throws(() => normalizeVercelRequest(new Request('https://firstbell.example/api/index?__fb_path=https://attacker.example'), true))
})

test('full Vercel API validates Privy identity, body limits and same-origin writes before account storage', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256')
  const verification = await exportSPKI(publicKey), db = redisFixture()
  globalThis.fetch = db.fetcher
  const handler = createVercelHandler({ ...env, PRIVY_VERIFICATION_KEY: verification })
  const jwt = (subject = user, audience = env.PRIVY_APP_ID, expires = '1h') => new SignJWT({}).setProtectedHeader({ alg: 'ES256' })
    .setIssuer('privy.io').setAudience(audience).setSubject(subject).setExpirationTime(expires).sign(privateKey)
  const call = (token, method = 'GET', body, origin = 'https://firstbell.example') => handler(new Request(
    `https://firstbell.example/api/index?__fb_path=${method === 'PUT' ? 'me/saved' : 'me'}`, {
      method, headers: { Authorization: `Bearer ${token}`, Origin: origin }, ...(body ? { body: JSON.stringify(body) } : {}),
    }))
  assert.equal((await call('invalid')).status, 401)
  assert.equal((await call(await jwt(user, 'wrong-app'))).status, 401)
  assert.equal((await call(await jwt(user, env.PRIVY_APP_ID, -1))).status, 401)
  assert.equal((await call(await jwt('other-id'))).status, 401)
  const token = await jwt()
  assert.equal((await call(token, 'PUT', { symbol: 'AAPLon', saved: true }, 'https://attacker.example')).status, 403)
  assert.equal((await call(token, 'PUT', { padding: 'a'.repeat(600) })).status, 413)
  assert.equal(db.commands.length, 0)
  assert.equal((await call(token, 'PUT', { symbol: 'AAPLon', saved: true })).status, 200)
  assert.deepEqual((await (await call(token)).json()).account.saved, ['AAPLon'])
  assert.equal((await createVercelHandler({})(new Request('https://firstbell.example/api/health'))).status, 200)
})

test('Vercel market API returns validated prices and candles directly from Binance without account storage', async () => {
  const at = Date.now() - 60_000, calls = []
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).origin, 'https://web3.binance.com'); calls.push(url)
    assert.equal(options.headers['X-OC-APIKEY'], 'fixture-binance-key')
    return Response.json({ code: 0, success: true, data: String(url).includes('/candles?') ? [[121, 124, 120, 123, 20, at, 3]]
      : [{ binanceChainId: '56', tokenContractAddress: assets.NVDAon, price: '123.5', time: at, priceChange24H: '-0.85' }] })
  }
  const handler = createVercelHandler({ BINANCE_WEB3_API_KEY: 'fixture-binance-key', BINANCE_WEB3_SECRET_KEY: 'fixture-binance-secret' })
  const response = await handler(new Request('https://firstbell.example/api/index?__fb_path=market/NVDAon&frame=15m'))
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const data = await response.json()
  assert.equal(data.status, 'ready'); assert.equal(data.source, 'binance-web3'); assert.equal(data.priceUsd, 123.5)
  assert.equal(data.candles.length, 1); assert.equal(data.candles[0].t, at); assert.equal(calls.length, 2)
  assert.equal((await handler(new Request('https://firstbell.example/api/market/GOOG'))).status, 400)
})

test('deployment routes separate API and app pages; Vercel entry loads without the Cloudflare runtime', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url)))
  assert.deepEqual(config.regions, ['fra1'])
  assert.equal(config.rewrites[0].source, '/api/:path*')
  assert.equal(config.rewrites[0].destination, '/api/index?__fb_path=:path*')
  assert.ok(config.rewrites.some(route => route.source === '/app' && route.destination === '/app/index.html'))
  const entry = (await import('../api/index.ts')).default
  assert.equal((await entry.fetch(new Request('https://firstbell.example/api/health'))).status, 200)
  assert.equal((await entry.fetch(new Request('https://firstbell.example/api/not-found'))).status, 404)
})
