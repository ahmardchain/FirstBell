import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { exportSPKI, generateKeyPair, SignJWT } from 'jose'
import { createAccountNamespace } from '../server/account-storage.ts'
import { createVercelHandler, normalizeVercelRequest } from '../server/vercel.ts'
import { customerIp } from '../worker/moonpay.ts'
import { assets } from '../worker/market.ts'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

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
    if (command[1].includes('ZREMRANGEBYSCORE')) {
      const timestamps = (records.get(key) ?? []).filter(value => value > command[4] - 60_000)
      const allowed = timestamps.length < (command[6] ?? 6)
      records.set(key, allowed ? [...timestamps, command[4]] : timestamps)
      return Response.json({ result: allowed ? 1 : 0 })
    }
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

test('quote limit uses one atomic call, survives new instances and never loads or migrates account records', async () => {
  const db = redisFixture()
  const fast = () => namespace(db, { ...env, LEGACY_ACCOUNTS_ORIGIN: 'https://firstbell.ahmardchain.workers.dev' })
  for (let i = 0; i < 5; i++) assert.equal((await stub(fast()).fetch(internal(user, 'POST', undefined, '/quote-rate'))).status, 200)
  const results = await Promise.all(Array.from({ length: 5 }, () => stub(namespace(db)).fetch(internal(user, 'POST', undefined, '/quote-rate'))))
  assert.equal(results.filter(r => r.status === 200).length, 1)
  assert.ok(results.filter(r => r.status !== 200).every(r => r.status === 429))
  assert.equal((await stub(namespace(db)).fetch(internal(user, 'POST', undefined, '/quote-rate'))).status, 429)
  assert.equal(db.commands.length, 11, 'one database request per check, including the denied ones')
  assert.ok(db.commands.every(command => command[3] === `firstbell:quote-rate:v1:${user}`))
  assert.equal(db.records.has(`firstbell:accounts:v1:${user}`), false)
  assert.equal((await stub(fast(), otherUser).fetch(internal(otherUser, 'POST', undefined, '/quote-rate'))).status, 200)
  db.records.set(`firstbell:quote-rate:v1:${user}`, Array(6).fill(Date.now() - 60_001))
  assert.equal((await stub(fast()).fetch(internal(user, 'POST', undefined, '/quote-rate'))).status, 200)
  const before = db.commands.length
  assert.equal((await stub(fast()).fetch(internal(user, 'GET', undefined, '/quote-rate'))).status, 405)
  assert.equal(db.commands.length, before)
})

test('trade writes and settlement polls have separate atomic limits from quotes', async () => {
  const db = redisFixture(), store = stub(namespace(db))
  for (let i = 0; i < 6; i++) assert.equal((await store.fetch(internal(user, 'POST', undefined, '/quote-rate'))).status, 200)
  for (let i = 0; i < 12; i++) assert.equal((await store.fetch(internal(user, 'POST', undefined, '/trade-write-rate'))).status, 200)
  assert.equal((await store.fetch(internal(user, 'POST', undefined, '/trade-write-rate'))).status, 429)
  for (let i = 0; i < 60; i++) assert.equal((await store.fetch(internal(user, 'POST', undefined, '/trade-status-rate'))).status, 200)
  assert.equal((await store.fetch(internal(user, 'POST', undefined, '/trade-status-rate'))).status, 429)
  assert.equal((await store.fetch(internal(user, 'POST', undefined, '/quote-rate'))).status, 429)
})

test('trade dispatch records survive instances, bind the exact signature/order and preserve account data', async () => {
  const db = redisFixture()
  const attempt = { requestId: '11111111-1111-1111-1111-111111111111', typedDataHash: `0x${'aa'.repeat(32)}`, signatureHash: `0x${'bb'.repeat(32)}` }
  const call = (action, extra = {}, id = user) => stub(namespace(db), id).fetch(internal(id, 'POST', { ...attempt, action, ...extra }, '/trade-attempt'))
  assert.deepEqual(await (await call('get')).json(), { started: false, orderId: null })
  assert.deepEqual(await (await call('start')).json(), { started: true, orderId: null })
  assert.equal((await call('start', { signatureHash: `0x${'cc'.repeat(32)}` })).status, 409)
  assert.deepEqual(await (await call('complete', { orderId: 'fixture-rfq-order' })).json(), { started: true, orderId: 'fixture-rfq-order' })
  assert.deepEqual(await (await call('get')).json(), { started: true, orderId: 'fixture-rfq-order' })
  assert.equal((await call('complete', { orderId: 'different-order' })).status, 409)
  assert.deepEqual(await (await call('get', {}, otherUser)).json(), { started: false, orderId: null })
  assert.equal((await stub(namespace(db)).fetch(internal(user, 'PUT', { symbol: 'NVDAon', saved: true }))).status, 200)
  assert.deepEqual((await (await stub(namespace(db)).fetch(internal())).json()).account.saved, ['NVDAon'])
  assert.equal((await call('get')).status, 200)
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
  assert.equal(config.rewrites[0].source, '/api/check')
  assert.equal(config.rewrites.find(route => route.source === '/api/:path*').destination, '/api/index?__fb_path=:path*')
  assert.ok(config.rewrites.some(route => route.source === '/app' && route.destination === '/app/index.html'))
  assert.equal(config.functions['api/index.mjs'].maxDuration, 60)
  const entry = (await import('../api/index.mjs')).default
  assert.equal((await entry.fetch(new Request('https://firstbell.example/api/health'))).status, 200)
  assert.equal((await entry.fetch(new Request('https://firstbell.example/api/not-found'))).status, 404)
  const diagnostic = (await import('../api/check.mjs')).default
  const diagnosticResponse = await diagnostic.fetch(new Request('https://firstbell.example/api/check'))
  assert.equal(diagnosticResponse.status, 405)
  assert.deepEqual(await diagnosticResponse.json(), { error: 'use_post' })
})

test('deployed API bundle starts with no source folders or node_modules beside it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'firstbell-api-'))
  try {
    const isolated = join(directory, 'index.mjs')
    await copyFile(new URL('../api/index.mjs', import.meta.url), isolated)
    const entry = (await import(pathToFileURL(isolated).href)).default
    const response = await entry.fetch(new Request('https://firstbell.example/api/index?__fb_path=health'))
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok', agentTrading: { configured: false, chainId: 56, executionVendor: 'CowSwap', quoteSources: ['binance-web3', 'cow-protocol'], confirmationRequired: true }, walletVerification: { serverLookupConfigured: false },
      cardFunding: { provider: 'onramper', mode: null, configured: false,
        missing: ['ONRAMPER_API_KEY', 'ONRAMPER_SIGNING_PRIVATE_KEY', 'ONRAMPER_WEBHOOK_SECRET', 'ONRAMPER_BSC_USDT_ID', 'ONRAMPER_ENVIRONMENT'],
        reason: 'not_configured' } })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('existing server-test project stages both app pages while retaining the diagnostic page', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'firstbell-stage-'))
  try {
    for (const path of ['scripts', 'dist/app', 'dist/assets', 'server-test/public']) await mkdir(join(directory, path), { recursive: true })
    await writeFile(join(directory, 'server-test/public/index.html'), 'diagnostic')
    await writeFile(join(directory, 'server-test/public/style.css'), 'diagnostic css')
    await writeFile(join(directory, 'server-test/public/test.js'), 'diagnostic js')
    await writeFile(join(directory, 'dist/index.html'), 'home')
    await writeFile(join(directory, 'dist/app/index.html'), 'app')
    await writeFile(join(directory, 'dist/assets/app.css'), 'body {}')
    await copyFile(new URL('../scripts/stage-vercel-app.mjs', import.meta.url), join(directory, 'scripts/stage-vercel-app.mjs'))
    await copyFile(new URL('../scripts/stage-vercel-diagnostic.mjs', import.meta.url), join(directory, 'scripts/stage-vercel-diagnostic.mjs'))
    await promisify(execFile)(process.execPath, [join(directory, 'scripts/stage-vercel-diagnostic.mjs')])
    for (const [path, content] of [['index.html', 'home'], ['app/index.html', 'app'], ['server-test.html', 'diagnostic'], ['style.css', 'diagnostic css'], ['test.js', 'diagnostic js']]) {
      assert.equal(await readFile(join(directory, 'dist', path), 'utf8'), content)
    }
    await promisify(execFile)(process.execPath, [join(directory, 'scripts/stage-vercel-app.mjs')])
    for (const [path, content] of [['index.html', 'home'], ['app/index.html', 'app'], ['assets/app.css', 'body {}'], ['server-test.html', 'diagnostic']]) {
      assert.equal(await readFile(join(directory, 'server-test/public', path), 'utf8'), content)
    }
    const config = JSON.parse(await readFile(new URL('../server-test/vercel.json', import.meta.url)))
    assert.equal(config.rewrites[0].source, '/api/check')
    assert.ok(config.rewrites.some(route => route.source === '/server-test' && route.destination === '/server-test.html'))
    assert.equal(config.installCommand, 'npm --prefix .. ci')
    assert.ok(config.buildCommand.includes('stage-vercel-app.mjs'))
    assert.equal(await readFile(new URL('../server-test/api/index.mjs', import.meta.url), 'utf8'), await readFile(new URL('../api/index.mjs', import.meta.url), 'utf8'))
  } finally { await rm(directory, { recursive: true, force: true }) }
})
