import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { after, test } from 'node:test'
import { exportSPKI, generateKeyPair, SignJWT } from 'jose'
import { encodeEventTopics, erc20Abi, pad, toHex } from 'viem'
import { BSC_USDT } from '../lib/funding.ts'
import { canonicalIp, confirmedTransfer, createCheckoutUrl, getFiatOptions, getMoonPayCredentials, normalizeTransaction, signWidgetUrl, validateFiatAmount } from '../worker/moonpay.ts'
import { handleDepositRequest, handleStoredDeposits, verifyWalletIdentity } from '../worker/deposits.ts'

const originalFetch = globalThis.fetch
after(() => { globalThis.fetch = originalFetch })
const wallet = '0x1111111111111111111111111111111111111111'
const otherWallet = '0x2222222222222222222222222222222222222222'
const hash = `0x${'ab'.repeat(32)}`
const env = { PRIVY_APP_ID: 'app-test', MOONPAY_ENVIRONMENT: 'live', MOONPAY_PUBLISHABLE_KEY: 'pk_live_fixture', MOONPAY_SECRET_KEY: 'sk_live_fixture' }
const session = { id: 'd228e63d-627e-4e3c-8dfb-b916a8950ff0', customerId: 'pseudonymous-user', walletAddress: wallet,
  amount: '50', fiatCurrency: 'usd', mode: 'live', status: 'awaiting_payment', createdAt: new Date().toISOString(),
  checkedAt: null, transactionId: null, transactionHash: null, receivedAmount: null }
const usdt = { type: 'crypto', code: 'usdt_bsc', isSuspended: false, supportsLiveMode: true, supportsTestMode: false,
  metadata: { chainId: '56', contractAddress: BSC_USDT.address } }
const fiat = { type: 'fiat', code: 'usd', name: 'US Dollar', minBuyAmount: 20, maxBuyAmount: 30000 }
const transaction = overrides => ({ id: 'provider-transaction', externalTransactionId: session.id, externalCustomerId: session.customerId,
  walletAddress: wallet, currency: usdt, baseCurrency: fiat, baseCurrencyAmount: 50, quoteCurrencyAmount: 47,
  status: 'completed', cryptoTransactionId: hash, ...overrides })
const respond = value => Response.json(value)
const storage = initial => {
  const values = new Map(Object.entries(initial ?? {}))
  return { get: async key => structuredClone(values.get(key)), put: async (key, value) => { values.set(key, structuredClone(value)) }, values }
}

test('URL signing matches MoonPay’s independent published test vector', async () => {
  const unsigned = 'https://buy-sandbox.moonpay.com/?apiKey=pk_test_DocsVector00&currencyCode=eth&walletAddress=0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe'
  assert.equal(await signWidgetUrl(unsigned, 'sk_test_DocsVector00'), `${unsigned}&signature=oIJxSghyzll%2FBLhUFdQZhkxf7DAS8REFaWr%2FibO%2BK8Q%3D`)
})

test('checkout locks BSC USDT, wallet and amount; signs the IP hash and encoded redirect', async () => {
  const credentials = getMoonPayCredentials(env)
  const url = new URL(await createCheckoutUrl(credentials, session, 'https://firstbell.example', '203.0.113.42', 'dark'))
  assert.equal(url.origin, 'https://buy.moonpay.com')
  assert.equal(url.searchParams.get('currencyCode'), 'usdt_bsc')
  assert.equal(url.searchParams.get('walletAddress'), wallet)
  assert.equal(url.searchParams.get('lockAmount'), 'true')
  assert.equal(url.searchParams.get('baseCurrencyAmount'), '50')
  assert.equal(url.searchParams.get('paymentMethod'), 'credit_debit_card')
  assert.equal(url.searchParams.get('allowedIpAddress'), createHmac('sha256', env.MOONPAY_SECRET_KEY).update('203.0.113.42').digest('base64'))
  assert.match(url.searchParams.get('redirectURL'), /\/app\/\?tab=portfolio&deposit=/)
  const signature = url.searchParams.get('signature')
  url.searchParams.delete('signature')
  assert.equal(signature, createHmac('sha256', env.MOONPAY_SECRET_KEY).update(url.search).digest('base64'))
  assert.ok(!url.toString().includes(env.MOONPAY_SECRET_KEY))
  await assert.rejects(() => createCheckoutUrl(credentials, session, 'http://firstbell.example', '203.0.113.42', 'light'), /https_required/)
})

test('environment/key mismatch and missing credentials fail closed', () => {
  assert.throws(() => getMoonPayCredentials({ PRIVY_APP_ID: 'test' }), /not_configured/)
  assert.throws(() => getMoonPayCredentials({ ...env, MOONPAY_ENVIRONMENT: 'sandbox' }), /invalid_configuration/)
})

test('IP canonicalization covers IPv4, RFC 5952, mapped IPv6 and invalid addresses', () => {
  assert.equal(canonicalIp('203.0.113.042:443'), '203.0.113.42')
  assert.equal(canonicalIp('[2001:0DB8:0000:0000:0000:0000:0000:0001]:443'), '2001:db8::1')
  assert.equal(canonicalIp('::ffff:203.0.113.42'), '203.0.113.42')
  assert.equal(canonicalIp('999.0.0.1'), null)
  assert.equal(canonicalIp('spoofed,203.0.113.42'), null)
})

test('currency catalog checks partner enablement, exact BSC contract and live-only sandbox support', async () => {
  globalThis.fetch = async url => { assert.equal(new URL(url).searchParams.get('show'), 'enabled'); return respond([usdt, fiat]) }
  assert.deepEqual(await getFiatOptions(getMoonPayCredentials(env)), [{ code: 'usd', name: 'US Dollar', min: 20, max: 30000 }])
  const testEnv = { ...env, MOONPAY_ENVIRONMENT: 'sandbox', MOONPAY_PUBLISHABLE_KEY: 'pk_test_fixture', MOONPAY_SECRET_KEY: 'sk_test_fixture' }
  await assert.rejects(() => getFiatOptions(getMoonPayCredentials(testEnv)), /sandbox_asset_unavailable/)
  globalThis.fetch = async () => respond([{ ...usdt, metadata: { ...usdt.metadata, chainId: '1' } }, fiat])
  await assert.rejects(() => getFiatOptions(getMoonPayCredentials({ ...env, MOONPAY_PUBLISHABLE_KEY: 'pk_live_wrong_chain' })), /asset_unavailable/)
})

test('fiat limits are provider-derived and reject exponent, decimal, negative and out-of-range inputs', () => {
  const limits = [{ code: 'usd', name: 'US Dollar', min: 20, max: 30000 }]
  assert.deepEqual(validateFiatAmount('50', 'usd', limits), { amount: '50', fiatCurrency: 'usd' })
  for (const value of ['1e3', '-50', '19', '30001', '20.5', '050', 50]) assert.throws(() => validateFiatAmount(value, 'usd', limits), /invalid_amount/)
  assert.throws(() => validateFiatAmount('50', 'ngn', limits), /invalid_amount/)
})

test('wallet proof requires Privy signature, matching user/app, expiry and exact embedded wallet', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256')
  const verification = { ...env, PRIVY_VERIFICATION_KEY: await exportSPKI(publicKey) }
  const userId = 'did:privy:fixture123'
  const payload = { linked_accounts: JSON.stringify([{ type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: wallet }]) }
  const sign = async (data = payload, sub = userId, audience = env.PRIVY_APP_ID, expiry = '1h') => {
    let jwt = new SignJWT(data).setProtectedHeader({ alg: 'ES256' }).setIssuer('privy.io').setAudience(audience).setSubject(sub).setIssuedAt()
    if (expiry) jwt = jwt.setExpirationTime(expiry)
    return jwt.sign(privateKey)
  }
  assert.equal(await verifyWalletIdentity(await sign(), verification, userId, wallet), true)
  assert.equal(await verifyWalletIdentity(await sign(), verification, userId, otherWallet), false)
  assert.equal(await verifyWalletIdentity(await sign(payload, 'did:privy:another'), verification, userId, wallet), false)
  assert.equal(await verifyWalletIdentity(await sign(payload, userId, 'other-app'), verification, userId, wallet), false)
  assert.equal(await verifyWalletIdentity(await sign(payload, userId, env.PRIVY_APP_ID, -1), verification, userId, wallet), false)
  assert.equal(await verifyWalletIdentity(await sign(payload, userId, env.PRIVY_APP_ID, null), verification, userId, wallet), false)
  assert.equal(await verifyWalletIdentity(await sign({ linked_accounts: JSON.stringify([{ type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'metamask', address: wallet }]) }), verification, userId, wallet), false)
})

test('provider completion alone is confirming; mismatched recipient, network, token, customer or order is rejected', () => {
  assert.equal(normalizeTransaction([transaction()], session).status, 'confirming')
  assert.equal(normalizeTransaction(transaction({ status: 'waitingAuthorization' }), session).status, 'action_required')
  assert.equal(normalizeTransaction(transaction({ status: 'failed' }), session).status, 'failed')
  assert.equal(normalizeTransaction([], session).status, 'awaiting_payment')
  for (const overrides of [{ walletAddress: otherWallet }, { externalTransactionId: 'other-id' }, { externalCustomerId: 'other-user' },
    { currency: { ...usdt, code: 'usdt' } }, { currency: { ...usdt, metadata: { chainId: '1', contractAddress: BSC_USDT.address } } },
    { currency: { ...usdt, metadata: { chainId: '56', contractAddress: otherWallet } } }, { baseCurrencyAmount: 51 }]) {
    assert.throws(() => normalizeTransaction(transaction(overrides), session), /transaction_mismatch/)
  }
  assert.throws(() => normalizeTransaction([transaction(), transaction()], session), /ambiguous_transaction/)
  assert.equal(normalizeTransaction(transaction(), { ...session, mode: 'sandbox' }).status, 'test_completed')
})

const transferLog = (to = wallet, token = BSC_USDT.address, amount = 47n * 10n ** 18n) => ({ address: token,
  topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: otherWallet, to } }), data: pad(toHex(amount), { size: 32 }) })

test('completion needs a successful USDT transfer to this wallet, exact 18-decimal amount and three confirmations', () => {
  const receipt = { status: 'success', blockNumber: 100n, logs: [transferLog()] }
  assert.equal(confirmedTransfer(receipt, 102n, wallet, '47'), '47')
  assert.equal(confirmedTransfer(receipt, 101n, wallet, '47'), null)
  assert.equal(confirmedTransfer({ ...receipt, status: 'reverted' }, 102n, wallet, '47'), null)
  assert.equal(confirmedTransfer({ ...receipt, logs: [transferLog(otherWallet)] }, 102n, wallet, '47'), null)
  assert.equal(confirmedTransfer({ ...receipt, logs: [transferLog(wallet, otherWallet)] }, 102n, wallet, '47'), null)
  assert.equal(confirmedTransfer({ ...receipt, logs: [transferLog(wallet, BSC_USDT.address, 46n * 10n ** 18n)] }, 102n, wallet, '47'), null)
})

test('stored session survives checkout; resuming reuses its ID, and repeated creation is rate limited', async () => {
  const store = storage()
  const input = { walletAddress: wallet, amount: '50', fiatCurrency: 'usd', customerId: session.customerId, ip: '203.0.113.42', origin: 'https://firstbell.example', theme: 'light' }
  const create = data => handleStoredDeposits(new Request('https://account.internal/deposits/checkout', { method: 'POST', body: JSON.stringify(data) }), env, store)
  const created = await (await create(input)).json()
  assert.equal(store.values.get('deposits').length, 1)
  const resumed = await (await create({ ...input, sessionId: created.session.id })).json()
  assert.equal(resumed.session.id, created.session.id)
  assert.equal(store.values.get('deposits').length, 1)
  assert.equal((await create(input)).status, 200)
  assert.equal((await create(input)).status, 429)
  const history = await (await handleStoredDeposits(new Request('https://account.internal/deposits'), env, store)).json()
  assert.equal(history.sessions.length, 2)
  assert.ok(!JSON.stringify(history).includes('checkoutUrl'))
  assert.ok(!JSON.stringify(history).includes(env.MOONPAY_SECRET_KEY))
})

test('route rejects cross-origin checkout, unverified wallet and an oversized streaming body', async () => {
  const namespace = { idFromName: id => id, get: () => ({ fetch: () => { throw new Error('Must not reach account store') } }) }
  const routeEnv = { ...env, ACCOUNTS: namespace }
  const make = (input, origin = 'https://firstbell.example') => new Request('https://firstbell.example/api/deposits/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(input) })
  assert.equal((await handleDepositRequest(make({}, 'https://attacker.example'), routeEnv, 'did:privy:fixture123')).status, 403)
  assert.equal((await handleDepositRequest(make({ walletAddress: wallet }), routeEnv, 'did:privy:fixture123')).status, 403)
  assert.equal((await handleDepositRequest(make({ padding: 'x'.repeat(2000) }), routeEnv, 'did:privy:fixture123')).status, 413)
})

test('provider and RPC success confirm a persisted deposit; follow-up checks do not call upstream again', async () => {
  const store = storage({ deposits: [session] })
  let providerCalls = 0
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.moonpay.com')) { providerCalls++; return respond([transaction()]) }
    const rpc = JSON.parse(init.body)
    const log = { ...transferLog(), blockHash: hash, blockNumber: '0x64', transactionHash: hash, transactionIndex: '0x0', logIndex: '0x0', removed: false }
    const receipt = { blockHash: hash, blockNumber: '0x64', contractAddress: null, cumulativeGasUsed: '0x5208', effectiveGasPrice: '0x1',
      from: otherWallet, gasUsed: '0x5208', logs: [log], logsBloom: `0x${'00'.repeat(256)}`, status: '0x1', to: BSC_USDT.address,
      transactionHash: hash, transactionIndex: '0x0', type: '0x0' }
    const result = { eth_chainId: '0x38', eth_blockNumber: '0x66', eth_getTransactionReceipt: receipt }[rpc.method]
    assert.notEqual(result, undefined)
    return respond({ jsonrpc: '2.0', id: rpc.id, result })
  }
  const req = () => new Request(`https://account.internal/deposits/${session.id}`)
  const first = await (await handleStoredDeposits(req(), env, store)).json()
  assert.equal(first.session.status, 'completed')
  assert.equal(first.session.receivedAmount, '47')
  assert.equal(store.values.get('deposits')[0].status, 'completed')
  await handleStoredDeposits(req(), env, store)
  assert.equal(providerCalls, 1)
})

test('provider downtime preserves the original pending record without fabricating success', async () => {
  const store = storage({ deposits: [session] })
  globalThis.fetch = async () => new Response('unavailable', { status: 503 })
  const response = await handleStoredDeposits(new Request(`https://account.internal/deposits/${session.id}`), env, store)
  assert.equal(response.status, 503)
  assert.equal(store.values.get('deposits')[0].status, 'awaiting_payment')
})

test('a locally expired checkout still discovers a late provider payment', async () => {
  const expired = { ...session, status: 'expired', createdAt: new Date(Date.now() - 90_000_000).toISOString() }
  const store = storage({ deposits: [expired] })
  globalThis.fetch = async () => respond([transaction({ status: 'waitingPayment' })])
  const response = await handleStoredDeposits(new Request(`https://account.internal/deposits/${session.id}`), env, store)
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.session.status, 'processing')
  assert.equal(store.values.get('deposits')[0].status, 'processing')
  assert.equal(result.session.receivedAmount, null)
})
