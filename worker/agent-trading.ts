import { SignJWT, jwtVerify } from 'jose'
import { decodeEventLog, encodeFunctionData, erc20Abi, formatUnits, hashTypedData, isAddress, parseUnits, verifyTypedData, type Address, type Hex } from 'viem'
import { BSC_USDT } from '../lib/funding.ts'
import { COW_RELAYER, COW_SETTLEMENT, validateOrderTypedData, type AgentOrder, type AgentTradePlan } from '../lib/agent-trading.ts'
import { getQuoteContext, RouteError, tradingClient, tradingRequest, type Credentials } from './binance-trading.ts'
import { assets, isSymbol, parseQuantity } from './market.ts'
import { verifyWalletIdentity, WalletVerificationError } from './wallet-verification.ts'
import type { ApiEnv } from './env.ts'

const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value)

async function tokenKey(secret: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`firstbell-agent-orders-v1:${secret}`)))
}
export async function sealTradeTicket(value: Record<string, unknown>, userId: string, secret: string, kind: 'plan' | 'receipt'): Promise<string> {
  return new SignJWT({ ...value, kind }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer('firstbell-agent')
    .setAudience(`firstbell-${kind}`).setSubject(userId).setIssuedAt().setExpirationTime(kind === 'plan' ? '30m' : '24h').sign(await tokenKey(secret))
}
export async function openTradeTicket(token: unknown, userId: string, secret: string, kind: 'plan' | 'receipt') {
  if (typeof token !== 'string' || token.length > 20_000) throw new RouteError('invalid_order_ticket', 400)
  try {
    const { payload } = await jwtVerify(token, await tokenKey(secret), { algorithms: ['HS256'], issuer: 'firstbell-agent', audience: `firstbell-${kind}` })
    if (payload.sub !== userId || payload.kind !== kind) throw new Error('wrong account')
    return payload
  } catch { throw new RouteError('invalid_order_ticket', 403) }
}

export async function prepareAgentTrade(symbol: string, side: 'buy' | 'sell', amount: string, walletAddress: string, credentials: Credentials): Promise<Omit<AgentTradePlan, 'planToken'>> {
  if (!isSymbol(symbol)) throw new RouteError('invalid_trade_request', 400)
  const context = await getQuoteContext(symbol, side, amount, walletAddress, credentials, true)
  const inputToken = side === 'buy' ? BSC_USDT.address : assets[symbol]
  const inputDecimals = side === 'buy' ? BSC_USDT.decimals : context.tokenDecimals
  const outputDecimals = side === 'buy' ? context.tokenDecimals : BSC_USDT.decimals
  if (context.providerRoute.approveTarget && !same(context.providerRoute.approveTarget, COW_RELAYER)) throw new RouteError('invalid_order_payload')
  const rawAmount = context.rawAmount
  const [balance, allowance, swap] = await Promise.all([
    tradingClient.readContract({ address: inputToken, abi: erc20Abi, functionName: 'balanceOf', args: [walletAddress as Address] }),
    tradingClient.readContract({ address: inputToken, abi: erc20Abi, functionName: 'allowance', args: [walletAddress as Address, COW_RELAYER] }),
    tradingRequest('GET', '/api/v1/dex/aggregator/swap', { binanceChainId: '56', amount: rawAmount,
      fromTokenAddress: inputToken, toTokenAddress: side === 'buy' ? assets[symbol] : BSC_USDT.address,
      userWalletAddress: walletAddress, quoteId: context.providerRoute.quoteId, slippagePercent: '0.5' }, credentials),
  ])
  if (balance < BigInt(rawAmount)) throw new RouteError('insufficient_balance', 409)
  const data = object(swap.data), rfq = object(data?.rfq), router = object(data?.routerResult)
  if (data?.executionMode !== 'RFQ' || rfq?.vendor !== 'CowSwap' || !id(rfq.orderId)
    || (rfq.signingScheme && String(rfq.signingScheme).toLowerCase() !== 'eip712')
    || !router || router.binanceChainId !== '56' || router.vendorName !== 'CowSwap' || router.fromTokenAmount !== rawAmount
    || !same(object(router.fromToken)?.tokenContractAddress, inputToken)
    || !same(object(router.toToken)?.tokenContractAddress, side === 'buy' ? assets[symbol] : BSC_USDT.address)
    || typeof router.toTokenAmount !== 'string' || router.toTokenAmount !== parseUnits(context.route.outputAmount, outputDecimals).toString()) throw new RouteError('invalid_order_payload')
  let typedData
  try { typedData = validateOrderTypedData(rfq.typedDataToSign, { route: context.route, rawAmount, inputDecimals, outputDecimals }) }
  catch (error) { throw new RouteError(error instanceof Error ? error.message : 'invalid_order_payload') }
  let approval: AgentTradePlan['approval'] = null
  if (allowance < BigInt(rawAmount)) {
    // Reset a smaller nonzero allowance first. Both steps authorize only the
    // pinned relayer and are separately simulated, reviewed and confirmed.
    const reset = allowance > 0n
    const approvalAmount = reset ? 0n : BigInt(rawAmount)
    const calldata = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [COW_RELAYER, approvalAmount] })
    const [simulation, gas, gasPrice, native] = await Promise.all([
      tradingRequest('POST', '/api/v1/dex/pre-transaction/simulate', { binanceChainId: '56', evmTx: { from: walletAddress, to: inputToken, value: '0', data: calldata } }, credentials),
      tradingClient.estimateGas({ account: walletAddress as Address, to: inputToken, data: calldata, value: 0n }),
      tradingClient.getGasPrice(), tradingClient.getBalance({ address: walletAddress as Address }),
    ])
    if (object(simulation.data)?.status !== 'SUCCESS') throw new RouteError('simulation_failed', 409)
    const gasBudget = gas * gasPrice * 12n / 10n
    if (native < gasBudget) throw new RouteError('insufficient_gas', 409)
    approval = { chainId: 56, to: inputToken, data: calldata, value: '0', amount: approvalAmount.toString(), spender: COW_RELAYER,
      reset, gasFeeBnb: formatUnits(gasBudget, 18), simulated: true }
  }
  return { route: context.route, rawAmount, inputDecimals, outputDecimals, minimumReceive: typedData.message.buyAmount as string,
    feeAmount: typedData.message.feeAmount as string, slippagePercent: '0.5', expiresAt: new Date(Number(typedData.message.validTo) * 1000).toISOString(),
    requestId: crypto.randomUUID(), orderQuoteId: rfq.orderId, typedData, typedDataHash: hashTypedData(typedData), approval }
}

export async function submitAgentTrade(plan: Omit<AgentTradePlan, 'planToken'>, signature: string, credentials: Credentials) {
  if (plan.approval) throw new RouteError('approval_required', 409)
  if (Date.parse(plan.expiresAt) <= Date.now() + 3_000) throw new RouteError('stale_quote', 409)
  if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) throw new RouteError('invalid_order_signature', 400)
  const typedData = validateOrderTypedData(plan.typedData, plan)
  if (hashTypedData(typedData) !== plan.typedDataHash || !await verifyTypedData({ ...typedData, address: plan.route.walletAddress as Address, signature: signature as Hex }))
    throw new RouteError('invalid_order_signature', 403)
  const inputToken = plan.route.side === 'buy' ? BSC_USDT.address : assets[plan.route.symbol]
  const allowance = await tradingClient.readContract({ address: inputToken, abi: erc20Abi, functionName: 'allowance', args: [plan.route.walletAddress as Address, COW_RELAYER] })
  if (allowance < BigInt(plan.rawAmount)) throw new RouteError('approval_required', 409)
  const result = await tradingRequest('POST', '/api/v1/dex/aggregator/order/submit', { requestId: plan.requestId,
    userSignature: signature, vendor: 'CowSwap', quoteId: plan.orderQuoteId, signingScheme: 'EIP712' }, credentials)
  const order = object(result.data)
  if (!id(order?.orderId) || !['PENDING_VENDOR', 'PENDING_ONCHAIN', 'FILLED'].includes(String(order.status))) throw new RouteError('submission_unknown', 503)
  return { orderId: order.orderId, status: 'PENDING_VENDOR' as const, txHash: null, inputAmount: null, outputAmount: null }
}

export async function checkAgentOrder(orderId: string, plan: Pick<AgentTradePlan, 'route' | 'rawAmount' | 'minimumReceive' | 'inputDecimals' | 'outputDecimals'>, credentials: Credentials): Promise<Omit<AgentOrder, 'receiptToken'>> {
  const result = await tradingRequest('GET', `/api/v1/dex/aggregator/order/${orderId}`, {}, credentials)
  const order = object(result.data)
  const statuses = ['PENDING_VENDOR', 'PENDING_ONCHAIN', 'FILLED', 'FAILED', 'EXPIRED', 'CANCELLED'] as const
  if (!order || order.orderId !== orderId || !statuses.includes(order.status as typeof statuses[number])) throw new RouteError('invalid_provider_response')
  const base = { orderId, status: order.status as AgentOrder['status'], txHash: null, inputAmount: null, outputAmount: null }
  if (order.status !== 'FILLED') return base
  if (typeof order.txHash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(order.txHash)) throw new RouteError('invalid_provider_response')
  const txHash = order.txHash as Hex
  let receipt
  try { receipt = await tradingClient.getTransactionReceipt({ hash: txHash }) }
  catch { return { ...base, status: 'CONFIRMING', txHash } }
  const tip = await tradingClient.getBlockNumber({ cacheTime: 0 })
  if (tip < receipt.blockNumber + 1n) return { ...base, status: 'CONFIRMING', txHash }
  if (receipt.status !== 'success' || !same(receipt.to, COW_SETTLEMENT)) throw new RouteError('settlement_not_verified', 409)
  const owner = plan.route.walletAddress, inputToken = plan.route.side === 'buy' ? BSC_USDT.address : assets[plan.route.symbol]
  const outputToken = plan.route.side === 'buy' ? assets[plan.route.symbol] : BSC_USDT.address
  let spent = 0n, received = 0n
  for (const log of receipt.logs) {
    if (!same(log.address, inputToken) && !same(log.address, outputToken)) continue
    try {
      const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics, eventName: 'Transfer' })
      if (same(log.address, inputToken) && same(event.args.from, owner)) spent += event.args.value
      if (same(log.address, outputToken) && same(event.args.to, owner)) received += event.args.value
    } catch { /* Only actual ERC-20 Transfer logs count. */ }
  }
  if (spent !== BigInt(plan.rawAmount) || received < BigInt(plan.minimumReceive)) throw new RouteError('settlement_not_verified', 409)
  return { orderId, status: 'FILLED', txHash, inputAmount: formatUnits(spent, plan.inputDecimals), outputAmount: formatUnits(received, plan.outputDecimals) }
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const reader = request.body?.getReader()
  if (!reader) throw new RouteError('invalid_trade_request', 400)
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break
      size += value.byteLength; if (size > 24_000) { await reader.cancel(); throw new RouteError('request_too_large', 413) }; chunks.push(value) }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { const body = object(JSON.parse(new TextDecoder().decode(bytes))); if (body) return body } catch { /* fixed error */ }
  throw new RouteError('invalid_trade_request', 400)
}

export async function handleAgentTrade(request: Request, env: ApiEnv, userId: string): Promise<Response> {
  try {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
    if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new RouteError('invalid_origin', 403)
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new RouteError('invalid_trade_request', 400)
    if (!env.BINANCE_WEB3_API_KEY || !env.BINANCE_WEB3_SECRET_KEY) throw new RouteError('not_configured')
    const credentials = { apiKey: env.BINANCE_WEB3_API_KEY, secretKey: env.BINANCE_WEB3_SECRET_KEY }
    const body = await readBody(request)
    if (typeof body.walletAddress !== 'string' || !isAddress(body.walletAddress)) throw new RouteError('invalid_trade_request', 400)
    const path = new URL(request.url).pathname
    let ticket
    if (path !== '/api/trade/prepare') ticket = await openTradeTicket(path === '/api/trade/submit' ? body.planToken : body.receiptToken, userId, credentials.secretKey, path === '/api/trade/submit' ? 'plan' : 'receipt')
    const plan = ticket?.plan as Omit<AgentTradePlan, 'planToken'> | undefined
    if (ticket && (!plan || !same(plan.route?.walletAddress, body.walletAddress))) throw new RouteError('wallet_not_verified', 403)
    if (!await verifyWalletIdentity(request.headers.get('privy-id-token'), env, userId, body.walletAddress)) throw new RouteError('wallet_not_verified', 403)
    const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName(userId))
    const allowed = await stub.fetch(new Request('https://account.internal/quote-rate', { method: 'POST', headers: { 'X-Privy-DID': userId } }))
    if (!allowed.ok) {
      const failure = object(await allowed.json())
      const reason = ['account_storage_not_configured', 'account_storage_unavailable'].includes(String(failure?.error)) ? failure!.error : 'rate_limited'
      return json({ error: reason }, allowed.status)
    }
    if (path === '/api/trade/prepare') {
      if (typeof body.symbol !== 'string' || !isSymbol(body.symbol) || (body.side !== 'buy' && body.side !== 'sell') || !parseQuantity(body.amount)) throw new RouteError('invalid_trade_request', 400)
      const prepared = await prepareAgentTrade(body.symbol, body.side, body.amount as string, body.walletAddress, credentials)
      const planToken = await sealTradeTicket({ plan: prepared }, userId, credentials.secretKey, 'plan')
      return json({ plan: { ...prepared, planToken } })
    }
    if (path === '/api/trade/submit') {
      if (!plan || typeof body.signature !== 'string') throw new RouteError('invalid_order_signature', 400)
      const submitted = await submitAgentTrade(plan, body.signature, credentials)
      const receiptToken = await sealTradeTicket({ plan, orderId: submitted.orderId }, userId, credentials.secretKey, 'receipt')
      return json({ order: { ...submitted, receiptToken } })
    }
    if (path === '/api/trade/status' && plan && id(ticket?.orderId)) return json({ order: { ...await checkAgentOrder(ticket.orderId, plan, credentials), receiptToken: body.receiptToken } })
    return json({ error: 'not_found' }, 404)
  } catch (error) {
    if (error instanceof WalletVerificationError) return json({ error: error.message }, error.status)
    const reason = error instanceof RouteError ? error.reason : error instanceof Error && ['unsupported_order_schema', 'invalid_order_payload'].includes(error.message) ? error.message : 'provider_error'
    return json({ error: reason }, error instanceof RouteError ? error.status : 503)
  }
}
