import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { privateKeyToAccount } from 'viem/accounts'
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionData, encodeFunctionResult, erc20Abi, keccak256, parseTransaction, parseUnits } from 'viem'
import { exportSPKI, generateKeyPair, SignJWT } from 'jose'
import { BSC_USDT } from '../lib/funding.ts'
import { validateWithdrawalPlan, validateWithdrawalResult, withdrawalInput } from '../lib/withdrawal.ts'
import { prepareWithdrawal, sealWithdrawal, validateSignedWithdrawal, submitWithdrawal, checkWithdrawal, handleWithdrawalRequest } from '../worker/withdrawals.ts'
import { handleApiRequest } from '../worker/router.ts'
import { handleAccountRequest } from '../worker/account-store.ts'

// PUBLIC, unfunded fixture key; every network response below is mocked.
// Passing these tests is not evidence of a funded mainnet withdrawal.
const signer = privateKeyToAccount(`0x${'11'.repeat(32)}`), owner = signer.address
const recipient = '0x2222222222222222222222222222222222222222', userId = 'did:privy:fixture-withdrawal'
const other = privateKeyToAccount(`0x${'22'.repeat(32)}`)
const input = { walletAddress: owner, recipient, amount: '5' }
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

function fixture() {
  const storage = new Map(), records = { async get(key) { return structuredClone(storage.get(key)) }, async put(key, value) { storage.set(key, structuredClone(value)) } }
  const s = { bnb: 0n, balance: parseUnits('10', 18), nonce: 0, chain: 56, sponsorable: true, unavailable: false, lostAck: false, failEstimate: false,
    mined: true, revert: false, invalidTransfer: false, wrongReceipt: false, head: 101n, receiptsUnavailable: false, calls: [], sends: [], transactions: new Map(), storageFailure: false }
  s.env = { PRIVY_APP_ID: 'fixture-withdrawal-app', PRIVY_APP_SECRET: 'fixture-server-secret', MEGAFUEL_API_KEY: 'fixture-megafuel-key', MEGAFUEL_POLICY_UUID: '11111111-1111-1111-1111-111111111111',
    ACCOUNTS: { idFromName: name => name, get: () => ({ fetch: request => {
      if (s.storageFailure && new URL(request.url).pathname === '/withdrawal-attempt') return Response.json({ error: 'account_storage_unavailable' }, { status: 503 })
      return handleAccountRequest(request, s.env, records)
    } }) } }
  const receipt = hash => {
    const tx = s.transactions.get(hash)
    if (!tx || !s.mined) return null
    const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data })
    const logs = s.revert ? [] : [{ address: BSC_USDT.address,
      data: encodeAbiParameters([{ type: 'uint256' }], [s.invalidTransfer ? 1n : decoded.args[1]]),
      topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from: owner, to: decoded.args[0] } }),
      blockHash: `0x${'bc'.repeat(32)}`, blockNumber: '0x64', transactionHash: hash, transactionIndex: '0x0', logIndex: '0x0', removed: false }]
    return { transactionHash: hash, transactionIndex: '0x0', blockHash: `0x${'bc'.repeat(32)}`, blockNumber: '0x64', from: s.wrongReceipt ? other.address : owner,
      to: BSC_USDT.address, cumulativeGasUsed: '0xc350', gasUsed: '0xc350', effectiveGasPrice: tx.gasPrice ? `0x${tx.gasPrice.toString(16)}` : '0x0', contractAddress: null,
      logsBloom: `0x${'00'.repeat(256)}`, status: s.revert ? '0x0' : '0x1', type: '0x0', logs }
  }
  globalThis.fetch = async (url, init) => {
    const u = new URL(url)
    if (u.hostname === 'api.privy.io') return Response.json({ id: userId, linked_accounts: [{ type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: owner }] })
    const body = JSON.parse(init.body); assert.equal(Array.isArray(body), false)
    const { method, params } = body; s.calls.push({ provider: u.hostname, method, params })
    let result
    if (u.hostname === 'open-platform-ap.nodereal.io') {
      assert.equal(u.pathname, `/${s.env.MEGAFUEL_API_KEY}/megafuel/56`)
      assert.equal(init.headers['X-MegaFuel-Policy-Uuid'], s.env.MEGAFUEL_POLICY_UUID)
      if (s.unavailable) throw new Error('upstream secret text must not escape')
      if (method === 'pm_isSponsorable') {
        assert.equal(params[0].to.toLowerCase(), BSC_USDT.address.toLowerCase()); assert.equal(params[0].value, '0x0')
        const action = decodeFunctionData({ abi: erc20Abi, data: params[0].data })
        assert.equal(action.functionName, 'transfer'); assert.equal(action.args[0].toLowerCase(), recipient.toLowerCase()); assert.equal(action.args[1], parseUnits('5', 18))
        result = { Sponsorable: s.sponsorable }
      } else if (method === 'eth_getTransactionCount') result = `0x${s.nonce.toString(16)}`
      else if (method === 'eth_sendRawTransaction') { const raw = params[0], hash = keccak256(raw); s.sends.push(raw); s.transactions.set(hash, parseTransaction(raw)); result = hash; if (s.lostAck) throw new Error('fixture lost acknowledgement') }
      else throw new Error(`unexpected sponsor method ${method}`)
    } else {
      assert.equal(u.hostname, 'bsc-dataseed.bnbchain.org')
      if (method === 'eth_chainId') result = `0x${s.chain.toString(16)}`
      else if (method === 'eth_getBalance') result = `0x${s.bnb.toString(16)}`
      else if (method === 'eth_getTransactionCount') result = `0x${s.nonce.toString(16)}`
      else if (method === 'eth_gasPrice') result = '0x5f5e100'
      else if (method === 'eth_estimateGas') { assert.equal(params[0].gasPrice, '0x0'); if (s.failEstimate) return Response.json({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: 'transfer failed' } }); result = '0xc350' }
      else if (method === 'eth_call') { const decoded = decodeFunctionData({ abi: erc20Abi, data: params[0].data }); assert.equal(decoded.functionName, 'balanceOf'); result = encodeFunctionResult({ abi: erc20Abi, functionName: 'balanceOf', result: s.balance }) }
      else if (method === 'eth_getTransactionReceipt') { if (s.receiptsUnavailable) throw new Error('fixture RPC timeout'); result = receipt(params[0]) }
      else if (method === 'eth_blockNumber') result = `0x${s.head.toString(16)}`
      else if (method === 'eth_sendRawTransaction') { const raw = params[0], hash = keccak256(raw); s.sends.push(raw); s.transactions.set(hash, parseTransaction(raw)); result = hash }
      else throw new Error(`unexpected BSC method ${method}`)
    }
    return Response.json({ jsonrpc: '2.0', id: body.id, result })
  }
  s.prepare = async (fields = s.env) => {
    const draft = await prepareWithdrawal(input, fields)
    return { ...draft, planToken: await sealWithdrawal(draft, userId, fields.PRIVY_APP_SECRET) }
  }
  s.sign = async (plan, overrides = {}, account = signer) => account.signTransaction({ type: 'legacy', chainId: 56, to: plan.tokenAddress, data: plan.data, value: 0n, nonce: plan.nonce, gas: BigInt(plan.gas), gasPrice: BigInt(plan.gasPrice), ...overrides })
  s.request = (path, body, headers = {}) => new Request(`https://firstbell.test/api/withdrawals/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://firstbell.test', ...headers }, body: JSON.stringify(body) })
  return s
}

test('fixture: zero BNB USDT withdrawal sponsors only the reviewed transfer and verifies its receipt', async () => {
  const s = fixture(), plan = await s.prepare()
  validateWithdrawalPlan(plan, input)
  assert.equal(plan.sponsored, true); assert.equal(plan.networkFeeBnb, '0'); assert.equal(s.sends.length, 0)
  const raw = await s.sign(plan), signed = await validateSignedWithdrawal(plan, raw)
  const result = await submitWithdrawal(plan, raw, s.env, userId)
  assert.equal(result.status, 'pending'); assert.equal(result.hash, signed.hash)
  assert.equal((await checkWithdrawal(plan, result.hash)).status, 'completed')
  assert.equal(s.bnb, 0n); assert.equal(s.sends.length, 1)
  assert.ok(s.calls.every(call => !['eth_sendTransaction', 'wallet_sendCalls'].includes(call.method)))
  assert.equal(parseTransaction(raw).gasPrice ?? 0n, 0n)
})

test('review never signs or broadcasts, and unsupported currency/address/precision cannot prepare', async () => {
  const s = fixture()
  await s.prepare(); assert.equal(s.sends.length, 0)
  for (const recipient of ['bad', owner, BSC_USDT.address, `0x${'00'.repeat(20)}`]) assert.throws(() => withdrawalInput({ ...input, recipient }), /invalid_recipient/)
  for (const amount of ['0', '-1', '1e3', '1.0000000000000000001', '01', '']) assert.throws(() => withdrawalInput({ ...input, amount }), /invalid_amount/)
  const response = await handleWithdrawalRequest(s.request('prepare', { ...input, currency: 'USDC' }), s.env, userId)
  assert.equal(response.status, 400); assert.equal((await response.json()).error, 'invalid_withdrawal_request')
})

test('insufficient USDT wins over an estimate revert and cannot send', async () => {
  const s = fixture(); s.balance = 1n; s.failEstimate = true
  await assert.rejects(() => s.prepare(), /insufficient_balance/); assert.equal(s.sends.length, 0)
})

test('failed simulation, rejected sponsorship and provider errors never fake a sponsored review', async () => {
  const s = fixture(); s.failEstimate = true
  await assert.rejects(() => s.prepare(), /withdrawal_simulation_failed/)
  s.failEstimate = false; s.sponsorable = false
  await assert.rejects(() => s.prepare(), /sponsorship_rejected/)
  s.sponsorable = true; s.unavailable = true
  await assert.rejects(() => s.prepare(), /sponsorship_unavailable/)
  assert.equal(s.sends.length, 0)
})

test('policy rejection or balance change after review stops dispatch without charging BNB', async () => {
  const s = fixture(), plan = await s.prepare(), raw = await s.sign(plan)
  s.sponsorable = false
  await assert.rejects(() => submitWithdrawal(plan, raw, s.env, userId), /sponsorship_rejected/)
  s.sponsorable = true; s.balance = 1n
  await assert.rejects(() => submitWithdrawal(plan, raw, s.env, userId), /insufficient_balance/)
  assert.equal(s.sends.length, 0)
})

test('expired review and changed nonce reject before broadcasting', async () => {
  const s = fixture(), original = await s.prepare()
  const { planToken: _token, ...draft } = original
  const past = { ...draft, expiresAt: new Date(Date.now() - 1_000).toISOString() }
  const expired = { ...past, planToken: await sealWithdrawal(past, userId, s.env.PRIVY_APP_SECRET) }
  const raw = await s.sign(expired)
  await assert.rejects(() => submitWithdrawal(expired, raw, s.env, userId), /withdrawal_expired/)
  s.nonce = 1
  await assert.rejects(async () => submitWithdrawal(original, await s.sign(original), s.env, userId), /withdrawal_nonce_changed/)
  assert.equal(s.sends.length, 0)
})

test('signed transaction validation rejects altered recipient, token, amount, spender, chain, nonce, gas, value, price and signer', async () => {
  const s = fixture(), plan = await s.prepare()
  const changed = [ { to: recipient }, { chainId: 1 }, { nonce: 1 }, { gas: 200_001n }, { value: 1n }, { gasPrice: 1n },
    { data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [other.address, BigInt(plan.rawAmount)] }) },
    { data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [recipient, 1n] }) },
    { data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [recipient, BigInt(plan.rawAmount)] }) } ]
  for (const fields of changed) await assert.rejects(async () => validateSignedWithdrawal(plan, await s.sign(plan, fields)), /invalid_withdrawal_signature/)
  await assert.rejects(async () => validateSignedWithdrawal(plan, await s.sign(plan, {}, other)), /invalid_withdrawal_signature/)
  assert.equal(s.sends.length, 0)
})

test('a lost dispatch acknowledgement retains the deterministic hash and recovers after expiry and balance spent', async () => {
  const s = fixture(), plan = await s.prepare(), raw = await s.sign(plan)
  s.lostAck = true
  const sent = await submitWithdrawal(plan, raw, s.env, userId)
  assert.equal(sent.status, 'unknown'); assert.equal(sent.hash, keccak256(raw))
  s.balance = 0n; s.sponsorable = false
  const realNow = Date.now; Date.now = () => realNow() + 600_000
  try { assert.equal((await submitWithdrawal(plan, raw, s.env, userId)).status, 'completed') }
  finally { Date.now = realNow }
  assert.equal(s.sends.length, 1)
})

test('pending recovery retries only identical signed bytes without selecting a new nonce', async () => {
  const s = fixture(), plan = await s.prepare(), raw = await s.sign(plan)
  s.mined = false; s.lostAck = true
  assert.equal((await submitWithdrawal(plan, raw, s.env, userId)).status, 'unknown')
  s.lostAck = false
  assert.equal((await submitWithdrawal(plan, raw, s.env, userId)).status, 'pending')
  assert.deepEqual(s.sends, [raw, raw]); assert.equal(s.transactions.size, 1)
  assert.equal((await checkWithdrawal(plan, keccak256(raw))).status, 'pending')
  s.mined = true
  assert.equal((await checkWithdrawal(plan, keccak256(raw))).status, 'completed')
})

test('a failed receipt and missing or wrong transfer stay failed or unknown, never success', async () => {
  const s = fixture(), plan = await s.prepare(), raw = await s.sign(plan)
  const { hash } = await submitWithdrawal(plan, raw, s.env, userId)
  s.head = 100n
  assert.equal((await checkWithdrawal(plan, hash)).status, 'confirming')
  s.head = 101n; s.revert = true
  assert.equal((await checkWithdrawal(plan, hash)).status, 'failed')
  s.revert = false; s.invalidTransfer = true
  assert.equal((await checkWithdrawal(plan, hash)).status, 'unknown')
  s.invalidTransfer = false; s.wrongReceipt = true
  assert.equal((await checkWithdrawal(plan, hash)).status, 'unknown')
  s.wrongReceipt = false; s.receiptsUnavailable = true
  assert.equal((await checkWithdrawal(plan, hash)).status, 'unknown')
})

test('unconfigured sponsorship with 0 BNB fails; a funded wallet reviews and signs an explicit native fee', async () => {
  const s = fixture(), env = { ...s.env, MEGAFUEL_API_KEY: undefined, MEGAFUEL_POLICY_UUID: undefined }
  await assert.rejects(() => s.prepare(env), /sponsorship_not_configured/)
  s.bnb = parseUnits('0.001', 18)
  const plan = await s.prepare(env)
  assert.equal(plan.sponsored, false); assert.ok(BigInt(plan.gasPrice) > 0n); assert.equal(plan.networkFeeBnb, '0.000006')
  const raw = await s.sign(plan), sent = await submitWithdrawal(plan, raw, env, userId)
  assert.equal(sent.status, 'pending'); assert.equal((await checkWithdrawal(plan, sent.hash)).status, 'completed')
  assert.equal(s.calls.some(call => call.provider === 'open-platform-ap.nodereal.io'), false)
})

test('durable storage failure prevents dispatch; a request ID or nonce cannot be rebound', async () => {
  const s = fixture(), plan = await s.prepare(), raw = await s.sign(plan)
  s.storageFailure = true
  await assert.rejects(() => submitWithdrawal(plan, raw, s.env, userId), /withdrawal_storage_unavailable/)
  assert.equal(s.sends.length, 0)
  s.storageFailure = false; await submitWithdrawal(plan, raw, s.env, userId)
  const { planToken: _token, ...draft } = plan
  const otherPlan = { ...draft, id: crypto.randomUUID() }, otherSealed = { ...otherPlan, planToken: await sealWithdrawal(otherPlan, userId, s.env.PRIVY_APP_SECRET) }
  await assert.rejects(() => submitWithdrawal(otherSealed, raw, s.env, userId), /withdrawal_attempt_mismatch/)
  const altered = { ...draft, gas: String(BigInt(draft.gas) + 1n) }, alteredPlan = { ...altered, planToken: await sealWithdrawal(altered, userId, s.env.PRIVY_APP_SECRET) }
  await assert.rejects(async () => submitWithdrawal(alteredPlan, await s.sign(alteredPlan), s.env, userId), /withdrawal_attempt_mismatch/)
  assert.equal(s.sends.length, 1)
})

test('authenticated API rejects another wallet, cross-site requests, modified ticket and another account', async () => {
  const s = fixture(), { privateKey, publicKey } = await generateKeyPair('ES256')
  s.env.PRIVY_VERIFICATION_KEY = await exportSPKI(publicKey)
  const auth = async id => new SignJWT().setProtectedHeader({ alg: 'ES256' }).setIssuer('privy.io').setAudience(s.env.PRIVY_APP_ID).setSubject(id).setIssuedAt().setExpirationTime('5m').sign(privateKey)
  const identity = async (id, wallet = owner) => new SignJWT({ linked_accounts: JSON.stringify([{ type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: wallet }]) }).setProtectedHeader({ alg: 'ES256' }).setIssuer('privy.io').setAudience(s.env.PRIVY_APP_ID).setSubject(id).setIssuedAt().setExpirationTime('5m').sign(privateKey)
  const headers = { Authorization: `Bearer ${await auth(userId)}`, 'privy-id-token': await identity(userId) }
  assert.equal((await handleApiRequest(s.request('prepare', input), s.env)).status, 401)
  const wrong = await handleApiRequest(s.request('prepare', { ...input, walletAddress: other.address }, headers), s.env)
  assert.equal(wrong.status, 403); assert.equal((await wrong.json()).error, 'wallet_not_verified')
  assert.equal((await handleApiRequest(s.request('prepare', input, { ...headers, Origin: 'https://evil.test' }), s.env)).status, 403)
  const prepared = await handleApiRequest(s.request('prepare', input, headers), s.env)
  assert.equal(prepared.status, 200)
  const { plan } = await prepared.json(), rawTransaction = await s.sign(plan)
  const body = { walletAddress: owner, planToken: plan.planToken, rawTransaction }
  assert.equal((await handleApiRequest(s.request('submit', { ...body, planToken: `${plan.planToken}x` }, headers), s.env)).status, 403)
  const otherId = 'did:privy:fixture-other-user', otherHeaders = { Authorization: `Bearer ${await auth(otherId)}`, 'privy-id-token': await identity(otherId) }
  assert.equal((await handleApiRequest(s.request('submit', body, otherHeaders), s.env)).status, 403)
  const before = await handleApiRequest(s.request('status', body, headers), s.env)
  assert.equal((await before.json()).withdrawal.status, 'not_submitted'); assert.equal(s.sends.length, 0)
  assert.equal((await handleApiRequest(s.request('submit', body, headers), s.env)).status, 200)
  const complete = await handleApiRequest(s.request('status', body, headers), s.env)
  assert.equal((await complete.json()).withdrawal.status, 'completed'); assert.equal(s.sends.length, 1)
})

test('client validation rejects false success hashes and altered network, amount, address, gas or fee', async () => {
  const s = fixture(), plan = await s.prepare(), hash = keccak256(await s.sign(plan))
  for (const fields of [{ chainId: 1 }, { tokenAddress: recipient }, { amount: '6' }, { recipient: other.address }, { sponsored: false }, { networkFeeBnb: '1' }, { gas: '999999' }]) assert.throws(() => validateWithdrawalPlan({ ...plan, ...fields }, input), /invalid_withdrawal_plan/)
  assert.throws(() => validateWithdrawalResult({ hash: `0x${'ab'.repeat(32)}`, status: 'completed' }, hash), /withdrawal_submission_unknown/)
  assert.throws(() => validateWithdrawalResult({ hash, status: 'success' }, hash), /withdrawal_submission_unknown/)
})
