import { SignJWT, jwtVerify } from 'jose'
import { decodeEventLog, erc20Abi, formatUnits, keccak256, parseTransaction, recoverTransactionAddress, stringToHex, type Address, type Hex, type TransactionSerializedLegacy } from 'viem'
import { BSC_USDT } from '../lib/funding.ts'
import { sameAddress, validateWithdrawalPlan, withdrawalInput, type WithdrawalInput, type WithdrawalPlan, type WithdrawalResult } from '../lib/withdrawal.ts'
import { RouteError, tradingClient } from './binance-trading.ts'
import { megaFuelConfigured, relayMegaFuelWithdrawal, sponsorWithdrawal } from './megafuel.ts'
import { verifyWalletIdentity, WalletVerificationError } from './wallet-verification.ts'
import type { ApiEnv } from './env.ts'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const inputErrors = new Set(['invalid_wallet', 'invalid_recipient', 'invalid_amount', 'invalid_withdrawal_plan'])
async function key(secret: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`firstbell-usdt-withdrawals-v1:${secret}`)))
}
export async function sealWithdrawal(plan: Omit<WithdrawalPlan, 'planToken'>, userId: string, secret: string) {
  // The review expires after three minutes. The sealed plan remains readable for
  // 24h so an already recorded dispatch can be recovered after review expiry.
  return new SignJWT({ plan }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer('firstbell-withdrawals')
    .setAudience('firstbell-usdt-transfer').setSubject(userId).setIssuedAt().setExpirationTime('24h').sign(await key(secret))
}
async function openWithdrawal(token: unknown, userId: string, secret: string): Promise<WithdrawalPlan> {
  if (typeof token !== 'string' || token.length > 8_000) throw new RouteError('invalid_withdrawal_ticket', 400)
  try {
    const { payload } = await jwtVerify(token, await key(secret), { algorithms: ['HS256'], issuer: 'firstbell-withdrawals', audience: 'firstbell-usdt-transfer' })
    if (payload.sub !== userId || !payload.plan || typeof payload.plan !== 'object') throw new Error('owner')
    const plan = { ...payload.plan, planToken: token } as WithdrawalPlan
    return validateWithdrawalPlan(plan, plan)
  } catch { throw new RouteError('invalid_withdrawal_ticket', 403) }
}

export async function prepareWithdrawal(input: WithdrawalInput, env: ApiEnv): Promise<Omit<WithdrawalPlan, 'planToken'>> {
  const expected = withdrawalInput(input), owner = expected.walletAddress as Address
  const sponsored = megaFuelConfigured(env)
  const [chain, balance, estimate] = await Promise.all([
    tradingClient.getChainId(),
    tradingClient.readContract({ address: BSC_USDT.address, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
    // Zero gas price lets a zero-BNB wallet simulate the exact transfer.
    tradingClient.estimateGas({ account: owner, to: BSC_USDT.address, data: expected.data, value: 0n, gasPrice: 0n }).then(value => ({ value }), () => ({ value: null })),
  ])
  if (chain !== 56) throw new RouteError('chain_unavailable')
  if (balance < BigInt(expected.rawAmount)) throw new RouteError('insufficient_balance', 409)
  if (estimate.value === null) throw new RouteError('withdrawal_simulation_failed', 409)
  const estimatedGas = estimate.value
  const gas = (estimatedGas * 12n + 9n) / 10n
  if (gas < 21_000n || gas > 200_000n) throw new RouteError('withdrawal_unavailable')
  const draft: WithdrawalPlan = { ...expected, id: crypto.randomUUID(), chainId: 56, tokenAddress: BSC_USDT.address,
    gas: gas.toString(), gasPrice: '0', nonce: 0, sponsored: true, networkFeeBnb: '0',
    expiresAt: new Date(Date.now() + 180_000).toISOString(), planToken: 'draft' }
  if (sponsored) draft.nonce = await sponsorWithdrawal(draft, env)
  else {
    const [gasPrice, native, nonce] = await Promise.all([tradingClient.getGasPrice(), tradingClient.getBalance({ address: owner }), tradingClient.getTransactionCount({ address: owner, blockTag: 'pending' })])
    if (gasPrice <= 0n || gasPrice > 20_000_000_000n) throw new RouteError('withdrawal_unavailable')
    if (native < gas * gasPrice) throw new RouteError('sponsorship_not_configured', 409)
    draft.gasPrice = gasPrice.toString(); draft.nonce = nonce; draft.sponsored = false; draft.networkFeeBnb = formatUnits(gas * gasPrice, 18)
  }
  validateWithdrawalPlan(draft, expected)
  const { planToken: _token, ...plan } = draft
  return plan
}

export async function validateSignedWithdrawal(plan: WithdrawalPlan, raw: unknown): Promise<{ raw: Hex; hash: Hex }> {
  validateWithdrawalPlan(plan, plan)
  if (typeof raw !== 'string' || raw.length > 1_024 || !/^0x(?:[0-9a-fA-F]{2})+$/.test(raw)) throw new RouteError('invalid_withdrawal_signature', 400)
  try {
    const tx = parseTransaction(raw as Hex)
    if (tx.type !== 'legacy' || tx.chainId !== 56 || tx.nonce !== plan.nonce || !sameAddress(tx.to, plan.tokenAddress)
      || tx.data?.toLowerCase() !== plan.data.toLowerCase() || (tx.value ?? 0n) !== 0n || tx.gas !== BigInt(plan.gas)
      || (tx.gasPrice ?? 0n) !== BigInt(plan.gasPrice)
      || !sameAddress(await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerializedLegacy }), plan.walletAddress)) throw new Error('transaction')
    return { raw: raw as Hex, hash: keccak256(raw as Hex) }
  } catch { throw new RouteError('invalid_withdrawal_signature', 400) }
}

export async function checkWithdrawal(plan: WithdrawalPlan, hash: Hex): Promise<WithdrawalResult> {
  try {
    const receipt = await tradingClient.getTransactionReceipt({ hash })
    if (!sameAddress(receipt.transactionHash, hash) || !sameAddress(receipt.from, plan.walletAddress) || !sameAddress(receipt.to, plan.tokenAddress)) return { hash, status: 'unknown' }
    const head = await tradingClient.getBlockNumber({ cacheTime: 0 })
    if (head < receipt.blockNumber + 1n) return { hash, status: 'confirming' }
    if (receipt.status === 'reverted') return { hash, status: 'failed' }
    if (receipt.status !== 'success') return { hash, status: 'unknown' }
    const transfer = receipt.logs.some(log => {
      if (!sameAddress(log.address, BSC_USDT.address) || log.removed) return false
      try {
        const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics })
        return event.eventName === 'Transfer' && sameAddress(event.args.from, plan.walletAddress)
          && sameAddress(event.args.to, plan.recipient) && event.args.value === BigInt(plan.rawAmount)
      } catch { return false }
    })
    return { hash, status: transfer ? 'completed' : 'unknown' }
  } catch (error) {
    const missing = error instanceof Error && (error.name === 'TransactionReceiptNotFoundError' || error.message.includes('could not be found'))
    return { hash, status: missing ? 'pending' : 'unknown' }
  }
}

async function account(env: ApiEnv, userId: string, path: string, body?: Record<string, unknown>) {
  const response = await env.ACCOUNTS.get(env.ACCOUNTS.idFromName(userId)).fetch(new Request(`https://account.internal/${path}`, {
    method: 'POST', headers: { 'X-Privy-DID': userId, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  }))
  if (!response.ok) throw new RouteError(response.status === 429 ? 'rate_limited' : response.status === 409 ? 'withdrawal_attempt_mismatch' : 'withdrawal_storage_unavailable', response.status)
  const value = await response.json() as { started?: boolean; allowed?: boolean }
  if (path === 'withdrawal-attempt' && typeof value.started !== 'boolean') throw new RouteError('withdrawal_storage_unavailable')
  return value
}

export async function submitWithdrawal(plan: WithdrawalPlan, raw: unknown, env: ApiEnv, userId: string): Promise<WithdrawalResult> {
  const signed = await validateSignedWithdrawal(plan, raw)
  const binding = { id: plan.id, walletAddress: plan.walletAddress.toLowerCase(), nonce: plan.nonce, hash: signed.hash,
    planHash: keccak256(stringToHex(plan.planToken)) }
  const previous = await account(env, userId, 'withdrawal-attempt', { ...binding, action: 'get' })
  if (previous.started) {
    const checked = await checkWithdrawal(plan, signed.hash)
    if (['completed', 'failed', 'confirming'].includes(checked.status)) return checked
  } else {
    if (Date.parse(plan.expiresAt) <= Date.now() + 5_000) throw new RouteError('withdrawal_expired', 409)
    const [balance, native] = await Promise.all([
      tradingClient.readContract({ address: BSC_USDT.address, abi: erc20Abi, functionName: 'balanceOf', args: [plan.walletAddress as Address] }),
      plan.sponsored ? Promise.resolve(0n) : tradingClient.getBalance({ address: plan.walletAddress as Address }),
    ])
    if (balance < BigInt(plan.rawAmount)) throw new RouteError('insufficient_balance', 409)
    if (!plan.sponsored && native < BigInt(plan.gas) * BigInt(plan.gasPrice)) throw new RouteError('insufficient_gas', 409)
  }
  const beforeDispatch = async () => {
    if (!previous.started && Date.parse(plan.expiresAt) <= Date.now() + 3_000) throw new RouteError('withdrawal_expired', 409)
    await account(env, userId, 'withdrawal-attempt', { ...binding, action: 'start' })
  }
  if (plan.sponsored) return { hash: signed.hash, status: await relayMegaFuelWithdrawal(plan, signed.raw, Boolean(previous.started), env, beforeDispatch) }
  if (!previous.started && await tradingClient.getTransactionCount({ address: plan.walletAddress as Address, blockTag: 'pending' }) !== plan.nonce) throw new RouteError('withdrawal_nonce_changed', 409)
  await beforeDispatch()
  try {
    const hash = await tradingClient.sendRawTransaction({ serializedTransaction: signed.raw })
    return { hash: signed.hash, status: sameAddress(hash, signed.hash) ? 'pending' : 'unknown' }
  } catch { return { hash: signed.hash, status: 'unknown' } }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body || Number(request.headers.get('Content-Length') ?? 0) > 12_000) throw new RouteError('invalid_withdrawal_request', 400)
  const reader = request.body.getReader(), decoder = new TextDecoder()
  let size = 0, text = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 12_000) { await reader.cancel(); throw new RouteError('request_too_large', 413) }
      text += decoder.decode(chunk.value, { stream: true })
    }
    const value: unknown = JSON.parse(text + decoder.decode())
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('body')
    return value as Record<string, unknown>
  } catch (error) { if (error instanceof RouteError) throw error; throw new RouteError('invalid_withdrawal_request', 400) }
  finally { reader.releaseLock() }
}

export async function handleWithdrawalRequest(request: Request, env: ApiEnv, userId: string): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const origin = request.headers.get('Origin')
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'invalid_origin' }, 403)
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'invalid_content_type' }, 400)
  if (!env.PRIVY_APP_SECRET?.trim()) return json({ error: 'withdrawal_not_configured' }, 503)
  try {
    const body = await readBody(request), path = new URL(request.url).pathname
    if (typeof body.walletAddress !== 'string') throw new RouteError('invalid_wallet', 400)
    if (!await verifyWalletIdentity(request.headers.get('privy-id-token'), env, userId, body.walletAddress)) throw new RouteError('wallet_not_verified', 403)
    await account(env, userId, path.endsWith('/status') ? 'trade-status-rate' : 'trade-write-rate')
    if (path === '/api/withdrawals/prepare') {
      if (Object.keys(body).some(name => !['walletAddress', 'recipient', 'amount'].includes(name))) throw new RouteError('invalid_withdrawal_request', 400)
      const prepared = await prepareWithdrawal(body as WithdrawalInput, env)
      return json({ plan: { ...prepared, planToken: await sealWithdrawal(prepared, userId, env.PRIVY_APP_SECRET) } })
    }
    if (Object.keys(body).some(name => !['walletAddress', 'planToken', 'rawTransaction'].includes(name))) throw new RouteError('invalid_withdrawal_request', 400)
    const plan = await openWithdrawal(body.planToken, userId, env.PRIVY_APP_SECRET)
    if (!sameAddress(body.walletAddress, plan.walletAddress)) throw new RouteError('invalid_withdrawal_ticket', 403)
    if (path === '/api/withdrawals/submit') return json({ withdrawal: await submitWithdrawal(plan, body.rawTransaction, env, userId) })
    if (path === '/api/withdrawals/status') {
      const signed = await validateSignedWithdrawal(plan, body.rawTransaction)
      const previous = await account(env, userId, 'withdrawal-attempt', { action: 'get', id: plan.id, walletAddress: plan.walletAddress.toLowerCase(), nonce: plan.nonce, hash: signed.hash, planHash: keccak256(stringToHex(plan.planToken)) })
      return json({ withdrawal: previous.started ? await checkWithdrawal(plan, signed.hash) : { hash: signed.hash, status: 'not_submitted' } })
    }
    return json({ error: 'not_found' }, 404)
  } catch (error) {
    const reason = error instanceof RouteError ? error.reason : error instanceof WalletVerificationError ? error.message : error instanceof Error && inputErrors.has(error.message) ? error.message : 'withdrawal_unavailable'
    return json({ error: reason }, error instanceof RouteError ? error.status : error instanceof WalletVerificationError ? error.status : inputErrors.has(reason) ? 400 : 503)
  }
}
