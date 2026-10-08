import assert from 'node:assert/strict'
import { createHash, createHmac, generateKeyPairSync, verify } from 'node:crypto'
import { after, test } from 'node:test'
import { exportSPKI, generateKeyPair, SignJWT } from 'jose'
import { encodeEventTopics, erc20Abi, pad, toHex } from 'viem'
import { BSC_USDT, isCheckoutUrl } from '../lib/funding.ts'
import { handleStoredDeposits } from '../worker/deposits.ts'
import { handleApiRequest } from '../worker/router.ts'
import { applyOnramperEvent, checkOnramperDeposit, createOnramperCheckoutUrl, createPartnerContext, getOnramperCredentials, handleOnramperWebhook, readPartnerContext } from '../worker/onramper.ts'

const originalFetch = globalThis.fetch
after(() => { globalThis.fetch = originalFetch })
const pair = generateKeyPairSync('ed25519')
const privatePem = pair.privateKey.export({ type: 'pkcs8', format: 'pem' })
const env = { PRIVY_APP_ID: 'onramper-fixture', ONRAMPER_ENVIRONMENT: 'live', ONRAMPER_API_KEY: 'pk_prod_fixture',
  ONRAMPER_SIGNING_PRIVATE_KEY: privatePem, ONRAMPER_WEBHOOK_SECRET: 'fixture-webhook-secret-32-characters',
  ONRAMPER_BSC_USDT_ID: 'fixture-usdt-bsc' }
const user = 'did:privy:onramperfixture', wallet = '0x1111111111111111111111111111111111111111'
const otherWallet = '0x2222222222222222222222222222222222222222', hash = `0x${'ab'.repeat(32)}`
const id = 'd228e63d-627e-4e3c-8dfb-b916a8950ff0'
const context = await createPartnerContext(user, id, env.ONRAMPER_WEBHOOK_SECRET)
const session = { id, provider: 'onramper', providerCryptoId: env.ONRAMPER_BSC_USDT_ID, partnerContext: context,
  customerId: 'pseudonymous-user', walletAddress: wallet, amount: '', fiatCurrency: '', amountSelection: 'onramper',
  mode: 'live', currencyCode: 'usdt_bsc', status: 'awaiting_payment', createdAt: new Date().toISOString(),
  checkedAt: null, transactionId: null, transactionHash: null, receivedAmount: null }
const event = overrides => ({ apiKey: env.ONRAMPER_API_KEY, inAmount: 50, outAmount: 47, sourceCurrency: 'usd',
  targetCurrency: env.ONRAMPER_BSC_USDT_ID, transactionType: 'buy', transactionId: '01-onramper-fixture',
  partnerContext: context, walletAddress: wallet, status: 'pending', statusDate: new Date().toISOString(), ...overrides })
const credentials = await getOnramperCredentials(env)
const storage = initial => {
  const values = new Map(Object.entries(initial ?? {}))
  return { get: async key => structuredClone(values.get(key)), put: async (key, value) => { values.set(key, structuredClone(value)) }, values }
}
const webhook = (value, overrides = {}) => {
  const body = typeof value === 'string' ? value : JSON.stringify(value)
  return new Request('https://firstbell.example/api/onramper/webhook', { method: 'POST', body,
    headers: { 'Content-Type': 'application/json', 'X-Onramper-Webhook-Signature': createHmac('sha256', env.ONRAMPER_WEBHOOK_SECRET).update(body).digest('hex'), ...overrides } })
}

test('V2 signature independently verifies and binds wallet, asset, context, card default and redirect', async () => {
  const url = new URL(await createOnramperCheckoutUrl(credentials, session, 'https://firstbell.example', 'dark'))
  assert.equal(url.origin, 'https://buy.onramper.com')
  assert.equal(url.searchParams.get('wallets'), `${env.ONRAMPER_BSC_USDT_ID}:${wallet}`)
  assert.equal(url.searchParams.get('onlyCryptos'), env.ONRAMPER_BSC_USDT_ID)
  assert.equal(url.searchParams.get('isAddressEditable'), 'false')
  assert.equal(url.searchParams.get('defaultPaymentMethod'), 'creditcard')
  for (const key of ['defaultAmount', 'defaultFiat', 'onlyOnramps', 'country', 'endUserIpHash']) assert.equal(url.searchParams.has(key), false)
  const names = url.searchParams.get('sigV2Fields').split(',')
  for (const name of ['apiKey', 'wallets', 'onlyCryptos', 'isAddressEditable', 'partnerContext', 'successRedirectUrl', 'failureRedirectUrl', 'redirectAtCheckout']) assert.ok(names.includes(name))
  const signed = new URLSearchParams(names.map(name => [name, url.searchParams.get(name)])); signed.sort()
  const canonical = ['ONRAMPER-SIG-V2', url.searchParams.get('sigV2Timestamp'), url.searchParams.get('sigV2Nonce'), 'GET', '/', signed.toString(), '',
    createHash('sha256').update('').digest('hex')]
  const signature = Buffer.from(url.searchParams.get('sigV2').slice(3), 'base64')
  assert.equal(verify(null, Buffer.from(canonical.join('\n')), pair.publicKey, signature), true)
  signed.set('wallets', `${env.ONRAMPER_BSC_USDT_ID}:${otherWallet}`)
  const altered = [...canonical]; altered[5] = signed.toString()
  assert.equal(verify(null, Buffer.from(altered.join('\n')), pair.publicKey, signature), false)
  assert.equal(Date.parse(url.searchParams.get('sigV2Expiry')) - Date.parse(url.searchParams.get('sigV2Timestamp')), 900_000)
  assert.equal(url.toString().includes(env.ONRAMPER_WEBHOOK_SECRET), false)
  assert.equal(url.toString().includes(user), false)
  assert.ok(isCheckoutUrl(url.toString(), session))
  const resumed = new URL(await createOnramperCheckoutUrl(credentials, session, 'https://firstbell.example', 'light'))
  assert.notEqual(resumed.searchParams.get('sigV2Nonce'), url.searchParams.get('sigV2Nonce'))
  assert.equal(resumed.searchParams.get('partnerContext'), context)
})

test('sandbox uses its own key and host, simulated Banxa, and never falls back to another network', async () => {
  const sandboxEnv = { ...env, ONRAMPER_ENVIRONMENT: 'sandbox', ONRAMPER_API_KEY: 'pk_test_fixture' }
  const sandbox = { ...session, mode: 'sandbox' }
  const url = new URL(await createOnramperCheckoutUrl(await getOnramperCredentials(sandboxEnv), sandbox, 'https://firstbell.example', 'light'))
  assert.equal(url.origin, 'https://buy.onramper.dev')
  assert.equal(url.searchParams.get('onlyOnramps'), 'banxa')
  assert.equal(url.searchParams.get('onlyCryptos'), env.ONRAMPER_BSC_USDT_ID)
  for (const fields of [{ ONRAMPER_ENVIRONMENT: 'sandbox' }, { ONRAMPER_SIGNING_PRIVATE_KEY: 'bad-key' }, { ONRAMPER_BSC_USDT_ID: 'btc,eth' }])
    await assert.rejects(() => getOnramperCredentials({ ...env, ...fields }), /invalid_configuration/)
  await assert.rejects(() => getOnramperCredentials({ ...env, ONRAMPER_WEBHOOK_SECRET: '' }), /not_configured/)
  await assert.rejects(() => createOnramperCheckoutUrl(credentials, sandbox, 'https://firstbell.example', 'light'), /invalid_session/)
  await assert.rejects(() => createOnramperCheckoutUrl(credentials, session, 'http://firstbell.example', 'light'), /https_required/)
  for (const value of ['https://buy.onramper.dev/', 'https://buy.onramper.com.evil.example/', 'https://buy.onramper.com:444/', 'https://attacker@buy.onramper.com/', 'https://buy.moonpay.com/'])
    assert.equal(isCheckoutUrl(value, session), false)
})

test('partner context hides the user and detects tampering or a different secret', async () => {
  assert.deepEqual(await readPartnerContext(context, env.ONRAMPER_WEBHOOK_SECRET), { userId: user, sessionId: id })
  const parts = context.split('.'); parts[2] = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1)
  await assert.rejects(() => readPartnerContext(parts.join('.'), env.ONRAMPER_WEBHOOK_SECRET), /invalid_webhook/)
  await assert.rejects(() => readPartnerContext(context, 'another-secret'), /invalid_webhook/)
})

test('test-key environment inference stays sandbox-only and rejects explicit live mismatches', async () => {
  const inferred = { ...env, ONRAMPER_API_KEY: 'pk_test_fixture', ONRAMPER_ENVIRONMENT: undefined }
  const credentials = await getOnramperCredentials(inferred)
  assert.equal(credentials.mode, 'sandbox')
  const url = new URL(await createOnramperCheckoutUrl(credentials, { ...session, mode: 'sandbox' }, 'https://firstbell.example', 'light'))
  assert.equal(url.origin, 'https://buy.onramper.dev')
  assert.equal(url.searchParams.get('onlyOnramps'), 'banxa')
  await assert.rejects(() => getOnramperCredentials({ ...inferred, ONRAMPER_ENVIRONMENT: 'live' }), /invalid_configuration/)
  await assert.rejects(() => getOnramperCredentials({ ...inferred, ONRAMPER_ENVIRONMENT: 'unknown' }), /invalid_configuration/)
  await assert.rejects(() => getOnramperCredentials({ ...env, ONRAMPER_ENVIRONMENT: undefined }), /not_configured/)
})

test('setup diagnostics distinguish missing and invalid configuration without exposing credentials', async () => {
  const request = () => new Request('https://firstbell.example/api/health')
  const partial = { PRIVY_APP_ID: env.PRIVY_APP_ID, ONRAMPER_API_KEY: 'pk_test_sensitive_fixture', ONRAMPER_SIGNING_PRIVATE_KEY: privatePem }
  const response = await handleApiRequest(request(), partial)
  assert.equal(response.status, 200)
  const text = await response.text(), result = JSON.parse(text)
  assert.deepEqual(result.cardFunding, { provider: 'onramper', mode: 'sandbox', configured: false,
    missing: ['ONRAMPER_WEBHOOK_SECRET', 'ONRAMPER_BSC_USDT_ID'], reason: 'not_configured' })
  assert.equal(text.includes(partial.ONRAMPER_API_KEY), false)
  assert.equal(text.includes('BEGIN PRIVATE KEY'), false)
  const invalid = await (await handleApiRequest(request(), { ...env, ONRAMPER_SIGNING_PRIVATE_KEY: 'invalid-pem' })).json()
  assert.equal(invalid.cardFunding.configured, false)
  assert.deepEqual(invalid.cardFunding.missing, [])
  assert.equal(invalid.cardFunding.reason, 'invalid_configuration')
  assert.deepEqual(invalid.cardFunding.invalid, ['ONRAMPER_SIGNING_PRIVATE_KEY'])
  const readyResponse = await handleApiRequest(request(), env), readyText = await readyResponse.text()
  assert.equal(JSON.parse(readyText).cardFunding.configured, true)
  for (const value of [env.ONRAMPER_API_KEY, env.ONRAMPER_WEBHOOK_SECRET, env.ONRAMPER_BSC_USDT_ID, privatePem])
    assert.equal(readyText.includes(value), false)
})

test('setup names every invalid setting without revealing its value or parser errors', async () => {
  const fields = { ...env, ONRAMPER_API_KEY: 'pk_test_wrong_environment', ONRAMPER_WEBHOOK_SECRET: 'too-short',
    ONRAMPER_BSC_USDT_ID: 'invalid asset', ONRAMPER_SIGNING_PRIVATE_KEY: 'not a PEM' }
  const response = await handleApiRequest(new Request('https://firstbell.example/api/health'), fields)
  const body = await response.text(), result = JSON.parse(body)
  assert.deepEqual(result.cardFunding.invalid,
    ['ONRAMPER_API_KEY', 'ONRAMPER_BSC_USDT_ID', 'ONRAMPER_WEBHOOK_SECRET', 'ONRAMPER_SIGNING_PRIVATE_KEY'])
  for (const name of ['ONRAMPER_API_KEY', 'ONRAMPER_WEBHOOK_SECRET', 'ONRAMPER_BSC_USDT_ID', 'ONRAMPER_SIGNING_PRIVATE_KEY'])
    assert.equal(body.includes(fields[name]), false)
  await assert.rejects(getOnramperCredentials(fields), { reason: 'invalid_configuration', status: 503 })
  const unknownMode = await (await handleApiRequest(new Request('https://firstbell.example/api/health'), { ...env, ONRAMPER_ENVIRONMENT: 'wrong-mode' })).json()
  assert.deepEqual(unknownMode.cardFunding.invalid, ['ONRAMPER_ENVIRONMENT'])
})

test('verified provider updates pin order and fiat while rejecting wrong assets, recipients and contexts', () => {
  const first = applyOnramperEvent(session, event(), env.ONRAMPER_API_KEY)
  assert.equal(first.status, 'processing'); assert.equal(first.amount, '50'); assert.equal(first.fiatCurrency, 'usd')
  for (const fields of [{ walletAddress: otherWallet }, { targetCurrency: 'usdt_ethereum' }, { apiKey: 'pk_prod_other' },
    { partnerContext: 'other' }, { transactionType: 'sell' }, { alternateRouteData: {} }, { inAmount: Infinity },
    { transactionId: 'other-order' }, { inAmount: 51 }, { sourceCurrency: 'eur' }, { status: 'made-up' }])
    assert.throws(() => applyOnramperEvent(first, event(fields), env.ONRAMPER_API_KEY), /transaction_mismatch/)
  assert.equal(applyOnramperEvent(first, event({ status: 'new' }), env.ONRAMPER_API_KEY).status, 'processing')
})

test('live provider completion only begins chain confirmation; old or repeated events cannot erase it', () => {
  const done = event({ status: 'completed', transactionHash: hash })
  const result = applyOnramperEvent(session, done, env.ONRAMPER_API_KEY)
  assert.equal(result.status, 'confirming'); assert.equal(result.receivedAmount, null); assert.equal(result.expectedAmount, '47')
  assert.deepEqual(applyOnramperEvent(result, event({ status: 'pending' }), env.ONRAMPER_API_KEY), result)
  for (const fields of [{ walletAddress: otherWallet }, { transactionHash: 'bad-hash' }, { outAmount: 0 }, { outAmount: NaN }])
    assert.throws(() => applyOnramperEvent(session, { ...done, ...fields }, env.ONRAMPER_API_KEY), /transaction_mismatch/)
  const missingOptional = applyOnramperEvent(session, { ...done, walletAddress: undefined, transactionHash: '' }, env.ONRAMPER_API_KEY)
  assert.equal(missingOptional.status, 'confirming'); assert.equal(missingOptional.transactionHash, null); assert.equal(missingOptional.receivedAmount, null)
  const final = { ...result, status: 'completed', receivedAmount: '47' }
  assert.deepEqual(applyOnramperEvent(final, event({ status: 'failed' }), env.ONRAMPER_API_KEY), final)
  const expired = { ...session, status: 'expired' }
  assert.equal(applyOnramperEvent(expired, done, env.ONRAMPER_API_KEY).status, 'confirming')
})

test('sandbox completion never records a mainnet receipt or received balance', () => {
  const result = applyOnramperEvent({ ...session, mode: 'sandbox' }, event({ status: 'completed', transactionHash: hash }), env.ONRAMPER_API_KEY)
  assert.equal(result.status, 'test_completed'); assert.equal(result.receivedAmount, null); assert.equal(result.transactionHash, null)
})

test('webhook verifies exact raw bytes before account routing and bounds malformed payloads', async () => {
  const routed = []
  const hookEnv = { ...env, ACCOUNTS: { idFromName: value => { routed.push(value); return value }, get: () => ({ fetch: async () => Response.json({ received: true }) }) } }
  assert.equal((await handleOnramperWebhook(webhook(event()), hookEnv)).status, 200)
  assert.deepEqual(routed, [user])
  assert.equal((await handleOnramperWebhook(webhook(event(), { 'X-Onramper-Webhook-Signature': '0'.repeat(64) }), hookEnv)).status, 401)
  const altered = webhook(event()); const text = await altered.text()
  assert.equal((await handleOnramperWebhook(new Request(altered.url, { method: 'POST', headers: altered.headers, body: text + ' ' }), hookEnv)).status, 401)
  assert.equal((await handleOnramperWebhook(webhook('not-json'), hookEnv)).status, 400)
  assert.equal((await handleOnramperWebhook(webhook(' '.repeat(17_000)), hookEnv)).status, 413)
  assert.equal((await handleOnramperWebhook(webhook(event({ apiKey: 'pk_prod_other' })), hookEnv)).status, 400)
  assert.equal(routed.length, 1)
})

test('authenticated checkout persists, resumes with a fresh nonce, and accepts only its correlated signed webhook', async () => {
  const privy = await generateKeyPair('ES256'), store = storage(), accounts = []
  const routeEnv = { ...env, PRIVY_VERIFICATION_KEY: await exportSPKI(privy.publicKey), ACCOUNTS: {
    idFromName: value => { accounts.push(value); return value },
    get: () => ({ fetch: request => handleStoredDeposits(request, routeEnv, store) }),
  } }
  const token = await new SignJWT({ linked_accounts: JSON.stringify([{ type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: wallet }]) })
    .setProtectedHeader({ alg: 'ES256' }).setIssuer('privy.io').setAudience(env.PRIVY_APP_ID).setSubject(user).setIssuedAt().setExpirationTime('1h').sign(privy.privateKey)
  const checkout = (data, jwt = token) => new Request('https://firstbell.example/api/deposits/checkout', { method: 'POST',
    headers: { Origin: 'https://firstbell.example', Authorization: `Bearer ${jwt}`, 'privy-id-token': token, 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  assert.equal((await handleApiRequest(checkout({ walletAddress: wallet }, 'invalid'), routeEnv)).status, 401)
  assert.equal((await handleApiRequest(checkout({ walletAddress: otherWallet }), routeEnv)).status, 403)
  const response = await handleApiRequest(checkout({ walletAddress: wallet, theme: 'dark' }), routeEnv)
  assert.equal(response.status, 200)
  const created = await response.json(); assert.equal(created.session.provider, 'onramper'); assert.equal(created.session.amount, '')
  const url = new URL(created.checkoutUrl); assert.ok(isCheckoutUrl(url.toString(), created.session))
  const resumed = await (await handleApiRequest(checkout({ walletAddress: wallet, sessionId: created.session.id }), routeEnv)).json()
  assert.equal(resumed.session.id, created.session.id)
  assert.notEqual(new URL(resumed.checkoutUrl).searchParams.get('sigV2Nonce'), url.searchParams.get('sigV2Nonce'))
  const callback = event({ partnerContext: created.session.partnerContext })
  assert.equal((await handleApiRequest(webhook(callback), routeEnv)).status, 200)
  const recorded = store.values.get('deposits')[0]
  assert.equal(recorded.status, 'processing'); assert.equal(recorded.amount, '50')
  assert.equal((await handleApiRequest(webhook({ ...callback, walletAddress: otherWallet }), routeEnv)).status, 409)
  assert.deepEqual(store.values.get('deposits')[0], recorded)
  assert.equal(accounts.every(account => account === user), true)
  assert.equal(JSON.stringify(recorded).includes(env.ONRAMPER_WEBHOOK_SECRET), false)
  assert.equal(JSON.stringify(recorded).includes('PRIVATE KEY'), false)
})

test('signed provider completion becomes confirmed only with a real BSC USDT receipt', async () => {
  const confirming = applyOnramperEvent(session, event({ status: 'completed', transactionHash: hash }), env.ONRAMPER_API_KEY)
  globalThis.fetch = async (_url, init) => {
    const rpc = JSON.parse(init.body)
    const log = { address: BSC_USDT.address, topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: otherWallet, to: wallet } }),
      data: pad(toHex(47n * 10n ** 18n), { size: 32 }), blockHash: hash, blockNumber: '0x64', transactionHash: hash, transactionIndex: '0x0', logIndex: '0x0', removed: false }
    const receipt = { blockHash: hash, blockNumber: '0x64', contractAddress: null, cumulativeGasUsed: '0x5208', effectiveGasPrice: '0x1', from: otherWallet,
      gasUsed: '0x5208', logs: [log], logsBloom: `0x${'00'.repeat(256)}`, status: '0x1', to: BSC_USDT.address, transactionHash: hash, transactionIndex: '0x0', type: '0x0' }
    return Response.json({ jsonrpc: '2.0', id: rpc.id, result: { eth_chainId: '0x38', eth_blockNumber: '0x66', eth_getTransactionReceipt: receipt }[rpc.method] })
  }
  const result = await checkOnramperDeposit(confirming)
  assert.equal(result.status, 'completed'); assert.equal(result.receivedAmount, '47')
  globalThis.fetch = async () => { throw new Error('rpc unavailable') }
  const unavailable = await checkOnramperDeposit(confirming)
  assert.equal(unavailable.status, 'confirming'); assert.equal(unavailable.receivedAmount, null)
})

test('default checkout never silently falls back to existing MoonPay credentials', async () => {
  const legacyEnv = { PRIVY_APP_ID: env.PRIVY_APP_ID, MOONPAY_PUBLISHABLE_KEY: 'pk_live_old', MOONPAY_SECRET_KEY: 'sk_live_old', MOONPAY_ENVIRONMENT: 'live',
    ACCOUNTS: { idFromName: value => value, get: () => ({ fetch: async () => { throw new Error('must not create an order') } }) } }
  const { handleDepositRequest } = await import('../worker/deposits.ts')
  const response = await handleDepositRequest(new Request('https://firstbell.example/api/deposits/config'), legacyEnv, user)
  assert.deepEqual(await response.json(), { provider: 'onramper', ready: false, mode: null, reason: 'not_configured', fiatCurrencies: [] })
})
