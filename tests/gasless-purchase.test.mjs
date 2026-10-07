import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { privateKeyToAccount } from 'viem/accounts'
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionData, encodeFunctionResult, erc20Abi, keccak256, multicall3Abi, parseTransaction, toHex } from 'viem'
import { COW_ORDER_FIELDS, COW_RELAYER, COW_SETTLEMENT, validateAgentTradePlan } from '../lib/agent-trading.ts'
import { BSC_USDT } from '../lib/funding.ts'
import { tokenAddresses } from '../lib/asset-catalog.ts'
import { executeReviewedTrade } from '../lib/trade-execution.ts'
import { prepareAgentTrade, prepareTokenApproval, submitAgentTrade, checkAgentOrder, sealTradeTicket } from '../worker/agent-trading.ts'
import { clearTradingMetadataCache, tradingClient } from '../worker/binance-trading.ts'
import { cowOrderUid } from '../worker/cow-trading.ts'
import { relaySponsoredApproval, validateSignedApproval } from '../worker/megafuel.ts'
import { readWalletBalances } from '../src/wallet-balances.ts'
import { handleApiRequest } from '../worker/router.ts'
import { exportSPKI, generateKeyPair, SignJWT } from 'jose'
import { handleAccountRequest } from '../worker/account-store.ts'

// Unfunded PUBLIC fixture signer. All chain, quote, solver and MegaFuel calls
// in this file are mocked. These tests are not evidence of a mainnet purchase.
const signer = privateKeyToAccount(`0x${'11'.repeat(32)}`), owner = signer.address
const credentials = { apiKey: 'fixture-binance-key', secretKey: 'fixture-binance-secret' }
const env = { MEGAFUEL_API_KEY: 'fixture-megafuel-key', MEGAFUEL_POLICY_UUID: '11111111-1111-1111-1111-111111111111' }
const rawAmount = 5n * 10n ** 18n, output = 25n * 10n ** 15n
const stock = tokenAddresses.NVDAon, settlementHash = `0x${'cd'.repeat(32)}`
const request = { symbol: 'NVDAon', side: 'buy', amount: '5', walletAddress: owner, paymentToken: 'USDT' }
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
beforeEach(() => clearTradingMetadataCache())
const envelope = data => ({ code: 0, success: true, timestamp: Date.now(), data })
const token = address => ({ tokenContractAddress: address, decimal: '18' })
function fixture() {
  const s = { bnb: 0n, usdt: rawAmount, stock: 0n, allowance: 0n, nonce: 0, sponsorable: true, simulation: true,
    mined: true, approvalStatus: '0x1', settlementStatus: 'FILLED', lostAck: false, invalidFill: false, calls: [], transactions: new Map(), submitted: new Map() }
  const typed = () => ({ domain: { name: 'Gnosis Protocol', version: 'v2', chainId: 56, verifyingContract: COW_SETTLEMENT }, types: { Order: COW_ORDER_FIELDS.map(field => ({ ...field })) }, primaryType: 'Order', message: {
    sellToken: BSC_USDT.address, buyToken: stock, receiver: owner, sellAmount: rawAmount.toString(), buyAmount: output.toString(), validTo: Math.floor(Date.now() / 1000) + 600,
    appData: `0x${'00'.repeat(32)}`, feeAmount: '0', kind: 'sell', partiallyFillable: false, sellTokenBalance: 'erc20', buyTokenBalance: 'erc20' } })
  const route = () => ({ quoteId: 'fixture-route', vendorName: 'CowSwap', binanceChainId: '56', executionMode: 'RFQ', approveTarget: COW_RELAYER,
    fromTokenAmount: rawAmount.toString(), toTokenAmount: output.toString(), fromToken: token(BSC_USDT.address), toToken: token(stock) })
  const transfer = (address, from, to, value, index) => ({ address, data: encodeAbiParameters([{ type: 'uint256' }], [value]), topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from, to } }),
    blockHash: `0x${'bc'.repeat(32)}`, blockNumber: '0x64', transactionHash: settlementHash, transactionIndex: '0x0', logIndex: `0x${index}`, removed: false })
  const receipt = (hash, to, status, logs = []) => ({ transactionHash: hash, transactionIndex: '0x0', blockHash: `0x${'bc'.repeat(32)}`, blockNumber: '0x64', from: owner, to,
    cumulativeGasUsed: '0x186a0', gasUsed: '0x186a0', effectiveGasPrice: '0x0', contractAddress: null, logsBloom: `0x${'00'.repeat(256)}`, status, type: '0x0', logs })
  const balanceOf = address => address.toLowerCase() === BSC_USDT.address.toLowerCase() ? s.usdt : address.toLowerCase() === stock.toLowerCase() ? s.stock : 0n
  const contractResult = (address, data) => {
    const call = decodeFunctionData({ abi: erc20Abi, data })
    const result = call.functionName === 'balanceOf' ? balanceOf(address) : call.functionName === 'allowance' ? s.allowance : call.functionName === 'approve' ? s.simulation : 18
    return encodeFunctionResult({ abi: erc20Abi, functionName: call.functionName, result })
  }
  globalThis.fetch = async (url, init) => {
    const u = new URL(url), body = init.body ? JSON.parse(init.body) : null
    if (u.hostname === 'open-platform-ap.nodereal.io') {
      assert.equal(u.pathname, `/${env.MEGAFUEL_API_KEY}/megafuel/56`)
      assert.equal(init.headers['X-MegaFuel-Policy-Uuid'], env.MEGAFUEL_POLICY_UUID)
      assert.equal(init.headers['User-Agent'], 'FirstBell/0.1.0')
      s.calls.push({ provider: 'megafuel', method: body.method, params: body.params })
      let result
      if (body.method === 'pm_isSponsorable') result = { sponsorable: s.sponsorable }
      else if (body.method === 'eth_getTransactionCount') { assert.equal(body.params[1], 'pending'); result = `0x${s.nonce.toString(16)}` }
      else if (body.method === 'eth_sendRawTransaction') {
        const raw = body.params[0], tx = parseTransaction(raw), hash = keccak256(raw)
        assert.equal(tx.gasPrice ?? 0n, 0n); assert.equal(tx.type, 'legacy'); assert.equal(tx.chainId, 56)
        s.transactions.set(hash, tx)
        result = hash
        if (s.lostAck) throw new Error('fixture: connection lost after acceptance')
      } else throw new Error(`unexpected MegaFuel method ${body.method}`)
      return Response.json({ jsonrpc: '2.0', id: body.id, result })
    }
    if (u.hostname === 'bsc-dataseed.bnbchain.org') {
      const rpc = call => {
        s.calls.push({ provider: 'bsc', method: call.method, params: call.params })
        let result
        if (call.method === 'eth_chainId') result = '0x38'
        else if (call.method === 'eth_getBalance') result = `0x${s.bnb.toString(16)}`
        else if (call.method === 'eth_blockNumber') result = '0x65'
        else if (call.method === 'eth_estimateGas') { assert.equal(call.params[0].gasPrice, '0x0'); result = '0x186a0' }
        else if (call.method === 'eth_getTransactionReceipt') {
          const hash = call.params[0], tx = s.transactions.get(hash)
          if (tx && s.mined) {
            if (s.approvalStatus === '0x1') { s.allowance = decodeFunctionData({ abi: erc20Abi, data: tx.data }).args[1]; s.nonce = tx.nonce + 1 }
            result = receipt(hash, tx.to, s.approvalStatus)
          } else if (hash === settlementHash) {
            result = receipt(hash, COW_SETTLEMENT, '0x1', [transfer(BSC_USDT.address, owner, COW_RELAYER, rawAmount, 0), transfer(stock, COW_SETTLEMENT, owner, s.invalidFill ? 1n : output, 1)])
          } else result = null
        } else if (call.method === 'eth_call') {
          const tx = call.params[0]
          try {
            const multi = decodeFunctionData({ abi: multicall3Abi, data: tx.data })
            result = encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result: multi.args[0].map(c => ({ success: true, returnData: contractResult(c.target, c.callData) })) })
          } catch {
            const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data })
            if (decoded.functionName === 'approve') assert.equal(tx.gasPrice, '0x0')
            result = contractResult(tx.to, tx.data)
          }
        } else throw new Error(`unexpected chain method ${call.method}`)
        return { jsonrpc: '2.0', id: call.id, result }
      }
      return Response.json(Array.isArray(body) ? body.map(rpc) : rpc(body))
    }
    assert.equal(u.hostname, 'web3.binance.com')
    s.calls.push({ provider: 'binance', method: u.pathname, body })
    if (u.pathname.endsWith('/supported/chain')) return Response.json(envelope([{ binanceChainId: '56' }]))
    if (u.pathname.endsWith('/quote')) { assert.equal(u.searchParams.get('fromTokenAddress').toLowerCase(), BSC_USDT.address.toLowerCase()); return Response.json(envelope([route()])) }
    if (u.pathname.endsWith('/swap')) return Response.json(envelope({ executionMode: 'RFQ', routerResult: route(), rfq: { vendor: 'CowSwap', orderId: 'fixture-rfq-order', signingScheme: 'EIP712', typedDataToSign: typed() } }))
    if (u.pathname.endsWith('/order/submit')) {
      if (!s.submitted.has(body.requestId)) { assert.ok(s.allowance >= rawAmount); s.submitted.set(body.requestId, body.userSignature) }
      else assert.equal(s.submitted.get(body.requestId), body.userSignature)
      return Response.json(envelope({ orderId: 'fixture-submitted-order', status: 'PENDING_VENDOR' }))
    }
    if (u.pathname.endsWith('/order/fixture-submitted-order')) {
      if (s.settlementStatus === 'FILLED') { s.usdt = 0n; s.stock = output; s.allowance = 0n }
      return Response.json(envelope({ orderId: 'fixture-submitted-order', status: s.settlementStatus, txHash: s.settlementStatus === 'FILLED' ? settlementHash : null }))
    }
    throw new Error(`unexpected provider path ${u.pathname}`)
  }
  s.prepare = async () => {
    const plan = await prepareAgentTrade('NVDAon', 'buy', '5', owner, credentials, undefined, { paymentToken: 'USDT', env })
    return { ...plan, planToken: await sealTradeTicket({ plan }, 'did:privy:fixture', credentials.secretKey, 'plan') }
  }
  return s
}
const signedApproval = (plan, changes = {}, account = signer) => account.signTransaction({ type: 'legacy', chainId: 56, nonce: plan.approval.sponsorship.nonce, to: plan.approval.to,
  data: plan.approval.data, gas: BigInt(plan.approval.sponsorship.gas), gasPrice: 0n, value: 0n, ...changes })
const execution = (s, overrides = {}) => ({
  assertWallet: wallet => assert.equal(wallet.toLowerCase(), owner.toLowerCase()), switchChain: async () => {}, continueAfterApproval: true,
  approve: async (_, plan) => (await relaySponsoredApproval(plan, await signedApproval(plan), env)).hash,
  waitApproval: hash => tradingClient.getTransactionReceipt({ hash }),
  signing: data => signer.signTypedData(data), onApproval: () => {}, onSigned: () => {}, submit: attempt => submitAgentTrade(attempt.plan, attempt.signature, credentials), ...overrides,
})

test('fixture: first USDT purchase with exactly 0 BNB approves, fills and appears in the portfolio', async () => {
  const s = fixture(), plan = await s.prepare()
  assert.equal(s.bnb, 0n)
  assert.equal(plan.approval.gasFeeBnb, '0')
  assert.equal(plan.approval.sponsorship.provider, 'megafuel')
  assert.equal(JSON.stringify(plan).includes(env.MEGAFUEL_API_KEY), false)
  assert.equal(JSON.stringify(plan).includes(env.MEGAFUEL_POLICY_UUID), false)
  validateAgentTradePlan(plan, request)
  const result = await executeReviewedTrade(plan, request, execution(s))
  assert.equal(result.kind, 'order')
  const filled = await checkAgentOrder(result.order.orderId, plan, credentials)
  assert.equal(filled.status, 'FILLED'); assert.equal(filled.txHash, settlementHash)
  const balances = await readWalletBalances(owner, [{ symbol: 'NVDAon', address: stock }])
  assert.equal(balances.bnb, '0'); assert.equal(balances.usdt, '0'); assert.equal(balances.tokens[0].quantity, '0.025')
  assert.equal(s.calls.filter(c => c.method === 'eth_sendRawTransaction').length, 1)
  assert.equal(s.calls.filter(c => c.method.endsWith('/quote')).length, 1)
  assert.equal(s.calls.some(c => c.method === 'eth_gasPrice'), false)
})

test('fixture: a direct CoW fallback retains the sponsored 0 BNB purchase and verified portfolio flow', async () => {
  const s = fixture(), original = globalThis.fetch
  let plan, submissions = 0
  const feeEstimate = 15n * 10n ** 15n
  globalThis.fetch = async (url, init) => {
    const u = new URL(url)
    if (u.hostname === 'web3.binance.com' && u.pathname.endsWith('/quote')) return Response.json(envelope([]))
    if (u.hostname !== 'api.cow.fi') return original(url, init)
    if (u.pathname.endsWith('/quote')) return Response.json({ id: 123, from: owner, expiration: new Date(Date.now() + 120_000).toISOString(), quote: {
      sellToken: BSC_USDT.address, buyToken: stock, receiver: owner, sellAmount: (rawAmount - feeEstimate).toString(), buyAmount: output.toString(),
      validTo: Math.floor(Date.now() / 1000) + 120, appData: keccak256(toHex('{}')), feeAmount: feeEstimate.toString(), kind: 'sell', partiallyFillable: false,
      sellTokenBalance: 'erc20', buyTokenBalance: 'erc20', signingScheme: 'eip712' } })
    if (u.pathname.endsWith('/orders')) {
      const body = JSON.parse(init.body)
      if (body.feeAmount !== '0') return Response.json({ errorType: 'NonZeroFee', description: 'Fee must be zero' }, { status: 400 })
      assert.equal(body.sellAmount, rawAmount.toString()); assert.equal(body.buyAmount, plan.minimumReceive)
      submissions++; assert.ok(s.allowance >= rawAmount); return Response.json(cowOrderUid(plan))
    }
    if (u.pathname.includes('/orders/')) {
      s.usdt = 0n; s.stock = output; s.allowance = 0n
      return Response.json({ ...plan.typedData.message, uid: cowOrderUid(plan), owner, status: 'fulfilled' })
    }
    assert.equal(u.pathname, '/bnb/api/v2/trades')
    return Response.json([{ orderUid: cowOrderUid(plan), owner, sellToken: BSC_USDT.address, buyToken: stock, txHash: settlementHash }])
  }
  plan = await s.prepare()
  assert.equal(plan.route.source, 'cow-protocol'); assert.equal(plan.approval.sponsorship.provider, 'megafuel')
  const result = await executeReviewedTrade(plan, request, execution(s))
  const filled = await checkAgentOrder(result.order.orderId, plan, credentials)
  assert.equal(filled.status, 'FILLED'); assert.equal(filled.txHash, settlementHash); assert.equal(submissions, 1)
  const balances = await readWalletBalances(owner, [{ symbol: 'NVDAon', address: stock }])
  assert.equal(balances.bnb, '0'); assert.equal(balances.usdt, '0'); assert.equal(balances.tokens[0].quantity, '0.025')
  assert.equal(s.calls.filter(c => c.method === 'eth_sendRawTransaction').length, 1)
})

test('fixture: repeat purchase with allowance makes no approval or sponsor calls', async () => {
  const s = fixture(); s.allowance = rawAmount
  const plan = await s.prepare(); assert.equal(plan.approval, null)
  const result = await executeReviewedTrade(plan, request, execution(s))
  assert.equal(result.kind, 'order'); assert.equal(s.calls.some(c => c.provider === 'megafuel'), false)
})

test('fixture: insufficient USDT and rejected sponsorship cannot send a transaction', async () => {
  const s = fixture(); s.usdt = 1n
  await assert.rejects(s.prepare, /insufficient_balance/)
  s.usdt = rawAmount; s.sponsorable = false
  await assert.rejects(s.prepare, /sponsorship_rejected/)
  assert.equal(s.calls.some(c => c.method === 'eth_sendRawTransaction'), false)
})

test('fixture: missing sponsor configuration stops a 0 BNB approval before simulation/signing', async () => {
  const s = fixture()
  await assert.rejects(() => prepareAgentTrade('NVDAon', 'buy', '5', owner, credentials, undefined, { paymentToken: 'USDT', env: {} }), /sponsorship_not_configured/)
  assert.equal(s.calls.some(c => c.provider === 'megafuel' || c.method === 'eth_estimateGas'), false)
})

test('fixture: failed approve simulation and expired quote stop signing or broadcasting', async () => {
  const s = fixture(); s.simulation = false
  await assert.rejects(s.prepare, /simulation_failed/)
  s.simulation = true; const plan = await s.prepare(), raw = await signedApproval(plan)
  plan.expiresAt = new Date(Date.now() - 1_000).toISOString()
  await assert.rejects(() => relaySponsoredApproval(plan, raw, env), /stale_quote/)
  await assert.rejects(() => submitAgentTrade(plan, '0x', credentials), /stale_quote/)
  assert.equal(s.calls.some(c => c.method === 'eth_sendRawTransaction'), false)
})

test('fixture: failed approval and approval timeout never sign the purchase order', async () => {
  const s = fixture(), plan = await s.prepare(); let signatures = 0
  s.approvalStatus = '0x0'
  await assert.rejects(() => executeReviewedTrade(plan, request, execution(s, { signing: () => { signatures++; throw new Error('must not sign') } })), /approval_failed/)
  await assert.rejects(() => executeReviewedTrade(plan, request, execution(s, { waitApproval: () => { throw new Error('approval_timeout') }, signing: () => { signatures++; throw new Error('must not sign') } })), /approval_timeout/)
  assert.equal(signatures, 0)
  assert.equal(s.calls.some(c => c.method.endsWith('/order/submit')), false)
})

test('fixture: failed purchase and incorrect settlement transfers cannot become Purchased', async () => {
  const s = fixture(); s.allowance = rawAmount; const plan = await s.prepare()
  const order = await submitAgentTrade(plan, await signer.signTypedData(plan.typedData), credentials)
  s.settlementStatus = 'FAILED'
  assert.equal((await checkAgentOrder(order.orderId, plan, credentials)).status, 'FAILED')
  s.settlementStatus = 'FILLED'; s.invalidFill = true
  await assert.rejects(() => checkAgentOrder(order.orderId, plan, credentials), /settlement_not_verified/)
})

test('fixture: lost acknowledgement keeps the hash and exact bytes; recovery does not pay twice', async () => {
  const s = fixture(), plan = await s.prepare(), raw = await signedApproval(plan)
  s.lostAck = true
  const unknown = await relaySponsoredApproval(plan, raw, env)
  assert.equal(unknown.status, 'unknown'); assert.equal(unknown.hash, keccak256(raw))
  s.sponsorable = false; plan.expiresAt = new Date(Date.now() - 1_000).toISOString()
  const recovered = await relaySponsoredApproval(plan, raw, env, true)
  assert.equal(recovered.hash, unknown.hash)
  assert.equal(s.calls.filter(c => c.method === 'eth_sendRawTransaction').length, 1)
})

test('fixture: nonzero insufficient permission uses sponsored reset then exact approval with the same order', async () => {
  const s = fixture(); s.allowance = 1n; const plan = await s.prepare()
  assert.equal(plan.approval.reset, true)
  const result = await executeReviewedTrade(plan, request, execution(s, {
    nextApproval: async previous => ({ ...previous, approval: await prepareTokenApproval(BSC_USDT.address, owner, rawAmount.toString(), s.allowance, credentials, undefined, env) }),
    submit: attempt => { assert.equal(attempt.plan.typedDataHash, plan.typedDataHash); assert.equal(attempt.plan.requestId, plan.requestId); return submitAgentTrade(attempt.plan, attempt.signature, credentials) },
  }))
  assert.equal(result.kind, 'order'); assert.equal(s.bnb, 0n)
  assert.deepEqual(s.calls.filter(c => c.method === 'eth_sendRawTransaction').map(c => decodeFunctionData({ abi: erc20Abi, data: parseTransaction(c.params[0]).data }).args[1]), [0n, rawAmount])
  assert.equal(s.calls.filter(c => c.method.endsWith('/quote')).length, 1)
})

test('signed approvals reject another signer, chain, spender, amount, value, gas, nonce and transaction type', async () => {
  const s = fixture(), plan = await s.prepare()
  for (const changes of [{ chainId: 1 }, { to: stock }, { value: 1n }, { gasPrice: 1n }, { gas: 200_001n }, { nonce: 99 },
    { data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [owner, rawAmount] }) },
    { data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [COW_RELAYER, rawAmount + 1n] }) }]) {
    await assert.rejects(async () => validateSignedApproval(plan, await signedApproval(plan, changes)), /invalid_sponsored_transaction/)
  }
  const other = privateKeyToAccount(`0x${'22'.repeat(32)}`)
  await assert.rejects(async () => validateSignedApproval(plan, await signedApproval(plan, {}, other)), /invalid_sponsored_transaction/)
  const raw = await signer.signTransaction({ type: 'eip1559', chainId: 56, nonce: 0, to: plan.approval.to, data: plan.approval.data, gas: 120_000n, maxFeePerGas: 0n, maxPriorityFeePerGas: 0n, value: 0n })
  await assert.rejects(() => validateSignedApproval(plan, raw), /invalid_sponsored_transaction/)
  await assert.rejects(() => validateSignedApproval(plan, `0x${'aa'.repeat(65)}`), /invalid_sponsored_transaction/)
  assert.equal(s.calls.some(c => c.method === 'eth_sendRawTransaction'), false)
})

test('fixture: nonce or sponsor changes between review and Confirm never silently charge BNB', async () => {
  const s = fixture(), plan = await s.prepare(), raw = await signedApproval(plan)
  s.nonce = 1
  await assert.rejects(() => relaySponsoredApproval(plan, raw, env), /approval_nonce_changed/)
  s.nonce = 0; s.sponsorable = false
  await assert.rejects(() => relaySponsoredApproval(plan, raw, env), /sponsorship_rejected/)
  assert.equal(s.calls.some(c => c.method === 'eth_sendRawTransaction'), false)
  assert.equal(s.bnb, 0n)
})

test('capabilities exposes configuration presence without secrets or spending-provider calls', async () => {
  const s = fixture()
  const read = await handleApiRequest(new Request('https://firstbell.test/api/trade/capabilities'), { ...env, PRIVY_APP_ID: 'fixture-app' })
  assert.deepEqual(await read.json(), { chainId: 56, paymentTokens: ['USDT'], executionMode: 'COW_RFQ', sponsorshipConfigured: true })
  assert.equal(s.calls.length, 0)
  const absent = await handleApiRequest(new Request('https://firstbell.test/api/trade/capabilities'), { PRIVY_APP_ID: 'fixture-app' })
  assert.equal((await absent.json()).sponsorshipConfigured, false)
})

test('sponsored relay requires authenticated owned wallet, sealed plan, same origin and rate budget', async () => {
  const s = fixture(), plan = await s.prepare(), raw = await signedApproval(plan)
  const pair = await generateKeyPair('ES256'), app = 'fixture-paymaster-app', user = 'did:privy:fixture'
  const jwt = accounts => new SignJWT(accounts ? { linked_accounts: JSON.stringify(accounts) } : {}).setProtectedHeader({ alg: 'ES256' })
    .setSubject(user).setIssuer('privy.io').setAudience(app).setExpirationTime('1h').sign(pair.privateKey)
  const access = await jwt(), identity = await jwt([{ type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: owner }])
  let rateAllowed = true, lastRatePath
  const apiEnv = { ...env, PRIVY_APP_ID: app, PRIVY_VERIFICATION_KEY: await exportSPKI(pair.publicKey), BINANCE_WEB3_API_KEY: credentials.apiKey, BINANCE_WEB3_SECRET_KEY: credentials.secretKey,
    ACCOUNTS: { idFromName: id => id, get: () => ({ fetch: async req => { lastRatePath = new URL(req.url).pathname; return Response.json({ allowed: rateAllowed }, { status: rateAllowed ? 200 : 429 }) } }) } }
  const call = (body = {}, headers = {}) => handleApiRequest(new Request('https://firstbell.test/api/trade/approval/submit', { method: 'POST',
    headers: { Origin: 'https://firstbell.test', 'Content-Type': 'application/json', Authorization: `Bearer ${access}`, 'privy-id-token': identity, ...headers },
    body: JSON.stringify({ walletAddress: owner, planToken: plan.planToken, rawTransaction: raw, ...body }) }), apiEnv)
  assert.equal((await call({}, { Origin: 'https://attacker.test' })).status, 403)
  assert.equal((await call({ walletAddress: `0x${'22'.repeat(20)}` })).status, 403)
  assert.equal((await call({ planToken: `${plan.planToken.slice(0, -5)}aaaaa` })).status, 403)
  rateAllowed = false; assert.equal((await call()).status, 429)
  assert.equal(s.calls.some(c => c.method === 'eth_sendRawTransaction'), false)
  rateAllowed = true
  const response = await call(); assert.equal(response.status, 200)
  assert.equal(lastRatePath, '/trade-write-rate')
  assert.equal((await response.json()).approval.hash, keccak256(raw))
  assert.equal(s.calls.filter(c => c.method === 'eth_sendRawTransaction').length, 1)
})

test('fixture: a lost order acknowledgement can recover the same dispatch after fill and expiry', async t => {
  const s = fixture(); s.allowance = rawAmount; const plan = await s.prepare(), signature = await signer.signTypedData(plan.typedData)
  let clock = Date.now(); t.mock.method(Date, 'now', () => clock)
  const pair = await generateKeyPair('ES256'), app = 'fixture-recovery-app', user = 'did:privy:fixture'
  const token = await new SignJWT({ linked_accounts: JSON.stringify([{ type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: owner }]) })
    .setProtectedHeader({ alg: 'ES256' }).setSubject(user).setIssuer('privy.io').setAudience(app).setExpirationTime('1h').sign(pair.privateKey)
  const values = new Map(), storage = { get: async key => structuredClone(values.get(key)), put: async (key, value) => { values.set(key, structuredClone(value)) } }
  const apiEnv = { ...env, PRIVY_APP_ID: app, PRIVY_VERIFICATION_KEY: await exportSPKI(pair.publicKey), BINANCE_WEB3_API_KEY: credentials.apiKey, BINANCE_WEB3_SECRET_KEY: credentials.secretKey,
    ACCOUNTS: { idFromName: id => id, get: () => ({ fetch: req => handleAccountRequest(req, {}, storage) }) } }
  const call = () => handleApiRequest(new Request('https://firstbell.test/api/trade/submit', { method: 'POST',
    headers: { Origin: 'https://firstbell.test', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'privy-id-token': token },
    body: JSON.stringify({ walletAddress: owner, planToken: plan.planToken, signature }) }), apiEnv)
  const provider = globalThis.fetch; let drop = true
  globalThis.fetch = async (url, init) => {
    const response = await provider(url, init)
    if (new URL(url).pathname.endsWith('/order/submit') && drop) {
      drop = false; s.usdt = 0n; s.allowance = 0n; s.stock = output
      throw new Error('fixture: lost response after order dispatch')
    }
    return response
  }
  assert.equal((await call()).status, 503)
  clock += 700_000
  const recovered = await call(); assert.equal(recovered.status, 200)
  assert.equal((await recovered.json()).order.orderId, 'fixture-submitted-order')
  assert.equal(s.submitted.size, 1)
  assert.equal(s.calls.filter(c => c.method.endsWith('/quote')).length, 1)
  assert.deepEqual(s.calls.filter(c => c.method.endsWith('/order/submit')).map(c => c.body.requestId), [plan.requestId, plan.requestId])
  const again = await call(); assert.equal(again.status, 200)
  assert.equal(s.calls.filter(c => c.method.endsWith('/order/submit')).length, 2)
})

test('authenticated recovery and historical status reconcile existing orders without any dispatch', async () => {
  const s = fixture(); s.allowance = rawAmount
  const plan = await s.prepare(), signature = await signer.signTypedData(plan.typedData)
  const pair = await generateKeyPair('ES256'), app = 'fixture-read-recovery-app', user = 'did:privy:fixture'
  const identity = await new SignJWT({ linked_accounts: JSON.stringify([{ type: 'wallet', chain_type: 'ethereum', wallet_client_type: 'privy', address: owner }]) })
    .setProtectedHeader({ alg: 'ES256' }).setSubject(user).setIssuer('privy.io').setAudience(app).setExpirationTime('1h').sign(pair.privateKey)
  const paths = [], values = new Map()
  const storage = { get: async key => structuredClone(values.get(key)), put: async (key, value) => { values.set(key, structuredClone(value)) } }
  const apiEnv = { ...env, PRIVY_APP_ID: app, PRIVY_VERIFICATION_KEY: await exportSPKI(pair.publicKey), BINANCE_WEB3_API_KEY: credentials.apiKey, BINANCE_WEB3_SECRET_KEY: credentials.secretKey,
    ACCOUNTS: { idFromName: id => id, get: () => ({ fetch: req => { paths.push(new URL(req.url).pathname); return handleAccountRequest(req, {}, storage) } }) } }
  const headers = { Origin: 'https://firstbell.test', 'Content-Type': 'application/json', Authorization: `Bearer ${identity}`, 'privy-id-token': identity }
  const call = (path, body) => handleApiRequest(new Request(`https://firstbell.test/api/trade/${path}`, { method: 'POST', headers, body: JSON.stringify({ walletAddress: owner, ...body }) }), apiEnv)
  const initial = await call('recover', { planToken: plan.planToken, signature })
  assert.equal(initial.status, 200); assert.equal((await initial.json()).order, null)
  assert.equal(s.calls.some(c => c.method.endsWith('/order/submit')), false)
  const submitted = await call('submit', { planToken: plan.planToken, signature })
  assert.equal(submitted.status, 200)
  const dispatchCount = s.calls.filter(c => c.method.endsWith('/order/submit')).length
  const beforeRecovery = structuredClone(values.get('tradeAttempts'))
  const key = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`firstbell-agent-orders-v1:${credentials.secretKey}`)))
  const historical = (kind, value) => new SignJWT({ ...value, kind }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer('firstbell-agent').setAudience(`firstbell-${kind}`).setSubject(user)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 172_800).setExpirationTime(Math.floor(Date.now() / 1000) - 86_400).sign(key)
  const planToken = await historical('plan', { plan })
  const recovered = await call('recover', { planToken, signature })
  assert.equal(recovered.status, 200)
  assert.equal((await recovered.json()).order.status, 'FILLED')
  assert.deepEqual(values.get('tradeAttempts'), beforeRecovery, 'recovery does not start or complete a durable dispatch')
  const receiptToken = await historical('receipt', { plan, orderId: 'fixture-submitted-order' })
  const checked = await call('status', { receiptToken })
  assert.equal(checked.status, 200); assert.equal((await checked.json()).order.status, 'FILLED')
  assert.equal((await call('submit', { planToken, signature })).status, 403, 'historical tickets never authorize dispatch')
  assert.equal(s.calls.filter(c => c.method.endsWith('/order/submit')).length, dispatchCount)
  assert.ok(paths.includes('/trade-status-rate'))
})
