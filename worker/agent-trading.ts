import { SignJWT, errors, jwtVerify } from 'jose'
import { decodeEventLog, encodeFunctionData, erc20Abi, formatUnits, hashTypedData, isAddress, parseUnits, verifyTypedData, type Address, type Hex } from 'viem'
import { isPaymentToken, tradeCash, type PaymentToken } from '../lib/trade-assets.ts'
import { COW_RELAYER, COW_SETTLEMENT, validateOrderTypedData, type AgentOrder, type AgentTradePlan } from '../lib/agent-trading.ts'
import { getQuoteContext, getTradingInputAmount, RouteError, tradingClient, tradingRequest, type Credentials } from './binance-trading.ts'
import { assets, isSymbol, parseQuantity } from './market.ts'
import { verifyWalletIdentity, WalletVerificationError } from './wallet-verification.ts'
import type { ApiEnv } from './env.ts'
import { megaFuelConfigured, relaySponsoredApproval, sponsorApproval } from './megafuel.ts'
import { tradeAttempt } from './trade-attempts.ts'
import { cancelCowOrder, checkCowOrder, cowOrderUid, getCowTrade, submitCowOrder } from './cow-trading.ts'
import { cowCancellationTypedData } from '../lib/order-cancellation.ts'

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
export async function openTradeTicket(token: unknown, userId: string, secret: string, kind: 'plan' | 'receipt', readOnly = false) {
  if (typeof token !== 'string' || token.length > 20_000) throw new RouteError('invalid_order_ticket', 400)
  try {
    const key = await tokenKey(secret)
    const options = { algorithms: ['HS256'], issuer: 'firstbell-agent', audience: `firstbell-${kind}` }
    let verified
    try { verified = await jwtVerify(token, key, options) }
    catch (error) {
      // An authentic historical ticket can identify an order for a read. It
      // never authorizes dispatch, approval, or a new signature after expiry.
      if (!readOnly || !(error instanceof errors.JWTExpired) || error.claim !== 'exp' || typeof error.payload.exp !== 'number') throw error
      verified = await jwtVerify(token, key, { ...options, currentDate: new Date(error.payload.exp * 1000 - 1) })
    }
    const { payload } = verified
    if (payload.sub !== userId || payload.kind !== kind) throw new Error('wrong account')
    return payload
  } catch { throw new RouteError('invalid_order_ticket', 403) }
}

export async function prepareTokenApproval(inputToken: Address, owner: Address, rawAmount: string, allowance: bigint, credentials: Credentials, signal?: AbortSignal, env?: ApiEnv): Promise<AgentTradePlan['approval']> {
  signal?.throwIfAborted()
  if (allowance >= BigInt(rawAmount)) return null
  const reset = allowance > 0n, approvalAmount = reset ? 0n : BigInt(rawAmount)
  const data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [COW_RELAYER, approvalAmount] })
  const approval = { chainId: 56 as const, to: inputToken, data, value: '0' as const, amount: approvalAmount.toString(), spender: COW_RELAYER, reset, gasFeeBnb: '0', simulated: true as const }
  if (env && megaFuelConfigured(env)) {
    // A zero-price call checks actual approve() behaviour without needing BNB.
    // Binance's simulation schema has no gasPrice override, so keep it for the
    // existing self-paid path and simulate sponsored calls directly on BSC.
    const [simulation, gas] = await Promise.all([
      tradingClient.simulateContract({ address: inputToken, abi: erc20Abi, functionName: 'approve', args: [COW_RELAYER, approvalAmount], account: owner, gasPrice: 0n }),
      tradingClient.estimateGas({ account: owner, to: inputToken, data, value: 0n, gasPrice: 0n }),
    ])
    if (simulation.result !== true) throw new RouteError('simulation_failed', 409)
    signal?.throwIfAborted()
    return sponsorApproval(approval, owner, gas, env, signal)
  }
  const nativePromise = tradingClient.getBalance({ address: owner })
  if (env && await nativePromise === 0n) throw new RouteError('sponsorship_not_configured', 409)
  const [simulation, gas, gasPrice, native] = await Promise.all([
    tradingRequest('POST', '/api/v1/dex/pre-transaction/simulate', { binanceChainId: '56', evmTx: { from: owner, to: inputToken, value: '0', data } }, credentials, signal),
    tradingClient.estimateGas({ account: owner, to: inputToken, data, value: 0n }),
    tradingClient.getGasPrice(), nativePromise,
  ])
  if (object(simulation.data)?.status !== 'SUCCESS') throw new RouteError('simulation_failed', 409)
  const gasBudget = gas * gasPrice * 12n / 10n
  if (native < gasBudget) throw new RouteError(env ? 'sponsorship_not_configured' : 'insufficient_gas', 409)
  return { ...approval, gasFeeBnb: formatUnits(gasBudget, 18) }
}

export async function prepareAgentTrade(symbol: string, side: 'buy' | 'sell', amount: string, walletAddress: string, credentials: Credentials, signal?: AbortSignal, options: { paymentToken?: PaymentToken; env?: ApiEnv } = {}): Promise<Omit<AgentTradePlan, 'planToken'>> {
  if (!isSymbol(symbol) || !['buy', 'sell'].includes(side) || !parseQuantity(amount) || !isAddress(walletAddress)) throw new RouteError('invalid_trade_request', 400)
  const cancel = new AbortController()
  const bounded = signal ? AbortSignal.any([signal, cancel.signal]) : cancel.signal
  bounded.throwIfAborted()
  const cash = tradeCash(options.paymentToken)
  const inputToken = side === 'buy' ? cash.address : assets[symbol]
  // Amount units and real wallet reads do not depend on an RFQ response.
  // Sell decimals share the verified metadata read with quote preparation.
  const inputAmountPromise = getTradingInputAmount(symbol, side, amount, options.paymentToken)
  const contextPromise = (async () => {
    try {
      const context = await getQuoteContext(symbol, side, amount, walletAddress, credentials, true, bounded, options.paymentToken)
      if (context.providerRoute.approveTarget && !same(context.providerRoute.approveTarget, COW_RELAYER)) throw new RouteError('invalid_order_payload')
      return { ...context, direct: null }
    } catch (error) {
      if (!(error instanceof RouteError) || !['no_verified_route', 'minimum_order_not_met', 'liquidity_unavailable', 'unsupported_execution_mode', 'unsupported_route_vendor'].includes(error.reason)) throw error
      bounded.throwIfAborted()
      console.info('TRADE_ROUTE_FALLBACK', { symbol, side, reason: error.reason })
      try {
        const direct = await getCowTrade(symbol, side, amount, walletAddress, bounded)
        return { ...direct, symbol, side, amount, walletAddress, providerRoute: null, direct }
      } catch (fallbackError) {
        if (fallbackError instanceof RouteError && fallbackError.reason === 'minimum_order_not_met' && error.minimumUsd) throw error
        // Preserve an available-but-unimplemented Binance route when the safe
        // CoW fallback has no quote. Never mask auth, timeout or validation errors.
        if (fallbackError instanceof RouteError && ['liquidity_unavailable', 'token_unavailable'].includes(fallbackError.reason)
          && ['unsupported_execution_mode', 'unsupported_route_vendor'].includes(error.reason)) throw error
        throw fallbackError
      }
    }
  })()
  const balancePromise = Promise.all([inputAmountPromise,
    tradingClient.readContract({ address: inputToken, abi: erc20Abi, functionName: 'balanceOf', args: [walletAddress as Address] }),
  ]).then(([inputAmount, balance]) => {
    if (balance < BigInt(inputAmount)) throw new RouteError('insufficient_balance', 409)
    return balance
  })
  const allowancePromise = tradingClient.readContract({ address: inputToken, abi: erc20Abi, functionName: 'allowance', args: [walletAddress as Address, COW_RELAYER] })
  const builtPromise = contextPromise.then(async context => {
    bounded.throwIfAborted()
    if (context.direct) return { inputDecimals: context.direct.inputDecimals, outputDecimals: context.direct.outputDecimals,
      orderQuoteId: context.direct.orderQuoteId, typedData: context.direct.typedData }
    if (!context.providerRoute) throw new RouteError('invalid_order_payload')
    const inputDecimals = side === 'buy' ? cash.decimals : context.tokenDecimals
    const outputDecimals = side === 'buy' ? context.tokenDecimals : cash.decimals
    const swap = await tradingRequest('GET', '/api/v1/dex/aggregator/swap', { binanceChainId: '56', amount: context.rawAmount,
      fromTokenAddress: inputToken, toTokenAddress: side === 'buy' ? assets[symbol] : cash.address,
      userWalletAddress: walletAddress, quoteId: context.providerRoute.quoteId, slippagePercent: '0.5' }, credentials, bounded)
    const data = object(swap.data), rfq = object(data?.rfq), router = object(data?.routerResult)
    if (data?.executionMode !== 'RFQ' || rfq?.vendor !== 'CowSwap' || !id(rfq.orderId)
      || (rfq.signingScheme && String(rfq.signingScheme).toLowerCase() !== 'eip712')
      || !router || router.binanceChainId !== '56' || router.vendorName !== 'CowSwap' || router.fromTokenAmount !== context.rawAmount
      || !same(object(router.fromToken)?.tokenContractAddress, inputToken)
      || !same(object(router.toToken)?.tokenContractAddress, side === 'buy' ? assets[symbol] : cash.address)
      || typeof router.toTokenAmount !== 'string' || router.toTokenAmount !== parseUnits(context.route.outputAmount, outputDecimals).toString()) throw new RouteError('invalid_order_payload')
    try {
      return { inputDecimals, outputDecimals, orderQuoteId: rfq.orderId,
        typedData: validateOrderTypedData(rfq.typedDataToSign, { route: context.route, rawAmount: context.rawAmount, inputDecimals, outputDecimals }) }
    } catch (error) { throw new RouteError(error instanceof Error ? error.message : 'invalid_order_payload') }
  })
  const approvalPromise = Promise.all([inputAmountPromise, balancePromise, allowancePromise]).then(async ([rawAmount, , allowance]): Promise<AgentTradePlan['approval']> => {
    return prepareTokenApproval(inputToken, walletAddress as Address, rawAmount, allowance, credentials, bounded, options.env)
  })
  try {
    const [context, built, approval, inputAmount] = await Promise.all([contextPromise, builtPromise, approvalPromise, inputAmountPromise])
    if (context.rawAmount !== inputAmount) throw new RouteError('invalid_order_payload')
    const { inputDecimals, outputDecimals, orderQuoteId, typedData } = built
    bounded.throwIfAborted()
    return { route: context.route, rawAmount: context.rawAmount, inputDecimals, outputDecimals, minimumReceive: typedData.message.buyAmount as string,
      feeAmount: typedData.message.feeAmount as string, slippagePercent: '0.5', expiresAt: new Date(Number(typedData.message.validTo) * 1000).toISOString(),
      ...(context.direct ? { estimatedFeeAmount: context.direct.estimatedFeeAmount } : {}),
      requestId: crypto.randomUUID(), orderQuoteId, typedData, typedDataHash: hashTypedData(typedData), approval }
  } catch (error) { cancel.abort(error); throw error }
}

export async function submitAgentTrade(plan: Omit<AgentTradePlan, 'planToken'>, signature: string, credentials: Credentials, recovery?: {
  started: boolean; orderId: string | null; beforeDispatch: () => Promise<void>
}) {
  if (!recovery?.started && Date.parse(plan.expiresAt) <= Date.now() + 3_000) throw new RouteError('stale_quote', 409)
  if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) throw new RouteError('invalid_order_signature', 400)
  // Only a durable, matching prior dispatch may recover an expired/spent order.
  // It reuses the exact signature, quote and requestId for provider idempotency.
  const typedData = validateOrderTypedData(plan.typedData, plan, recovery?.started ? Date.parse(plan.expiresAt) - 10_000 : Date.now())
  if (hashTypedData(typedData) !== plan.typedDataHash || !await verifyTypedData({ ...typedData, address: plan.route.walletAddress as Address, signature: signature as Hex }))
    throw new RouteError('invalid_order_signature', 403)
  if (recovery?.orderId) return { orderId: recovery.orderId, status: 'PENDING_VENDOR' as const, txHash: null, inputAmount: null, outputAmount: null }
  if (!recovery?.started) {
    const cash = tradeCash((plan.route.side === 'buy' ? plan.route.inputSymbol : plan.route.outputSymbol) as PaymentToken)
    const inputToken = plan.route.side === 'buy' ? cash.address : assets[plan.route.symbol]
    const [allowance, balance] = await Promise.all([
      tradingClient.readContract({ address: inputToken, abi: erc20Abi, functionName: 'allowance', args: [plan.route.walletAddress as Address, COW_RELAYER] }),
      tradingClient.readContract({ address: inputToken, abi: erc20Abi, functionName: 'balanceOf', args: [plan.route.walletAddress as Address] }),
    ])
    if (balance < BigInt(plan.rawAmount)) throw new RouteError('insufficient_balance', 409)
    if (allowance < BigInt(plan.rawAmount)) throw new RouteError('approval_required', 409)
  }
  await recovery?.beforeDispatch()
  if (plan.route.source === 'cow-protocol') {
    return { orderId: await submitCowOrder(plan, signature, recovery?.started === true), status: 'PENDING_VENDOR' as const,
      txHash: null, inputAmount: null, outputAmount: null }
  }
  const result = await tradingRequest('POST', '/api/v1/dex/aggregator/order/submit', { requestId: plan.requestId,
    userSignature: signature, vendor: 'CowSwap', quoteId: plan.orderQuoteId, signingScheme: 'EIP712' }, credentials)
  const order = object(result.data)
  if (!id(order?.orderId) || !['PENDING_VENDOR', 'PENDING_ONCHAIN', 'FILLED'].includes(String(order.status))) throw new RouteError('submission_unknown', 503)
  return { orderId: order.orderId, status: 'PENDING_VENDOR' as const, txHash: null, inputAmount: null, outputAmount: null }
}

export async function checkAgentOrder(orderId: string, plan: Pick<AgentTradePlan, 'route' | 'rawAmount' | 'minimumReceive' | 'inputDecimals' | 'outputDecimals'>, credentials: Credentials): Promise<Omit<AgentOrder, 'receiptToken'>> {
  const order = plan.route.source === 'cow-protocol' ? await checkCowOrder(orderId, plan)
    : object((await tradingRequest('GET', `/api/v1/dex/aggregator/order/${orderId}`, {}, credentials)).data)
  const statuses = ['PENDING_VENDOR', 'PENDING_ONCHAIN', 'CONFIRMING', 'FILLED', 'FAILED', 'EXPIRED', 'CANCELLED'] as const
  if (!order || order.orderId !== orderId || !statuses.includes(order.status as typeof statuses[number])) throw new RouteError('invalid_provider_response')
  const base = { orderId, status: order.status as AgentOrder['status'], txHash: null, inputAmount: null, outputAmount: null,
    ...(typeof order.createdAt === 'string' && Number.isFinite(Date.parse(order.createdAt)) ? { createdAt: order.createdAt } : {}) }
  if (order.status !== 'FILLED') return base
  if (typeof order.txHash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(order.txHash)) throw new RouteError('invalid_provider_response')
  const txHash = order.txHash as Hex
  let receipt
  try { receipt = await tradingClient.getTransactionReceipt({ hash: txHash }) }
  catch { return { ...base, status: 'CONFIRMING', txHash } }
  const tip = await tradingClient.getBlockNumber({ cacheTime: 0 })
  if (tip < receipt.blockNumber + 1n) return { ...base, status: 'CONFIRMING', txHash }
  if (receipt.status !== 'success' || !same(receipt.to, COW_SETTLEMENT)) throw new RouteError('settlement_not_verified', 409)
  const cash = tradeCash((plan.route.side === 'buy' ? plan.route.inputSymbol : plan.route.outputSymbol) as PaymentToken)
  const owner = plan.route.walletAddress, inputToken = plan.route.side === 'buy' ? cash.address : assets[plan.route.symbol]
  const outputToken = plan.route.side === 'buy' ? assets[plan.route.symbol] : cash.address
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
  return { ...base, status: 'FILLED', txHash, inputAmount: formatUnits(spent, plan.inputDecimals), outputAmount: formatUnits(received, plan.outputDecimals) }
}

function orderReceipt(order: Omit<AgentOrder, 'receiptToken'>, plan: Omit<AgentTradePlan, 'planToken'>, receiptToken: string): AgentOrder {
  return { ...order, receiptToken, trade: { symbol: plan.route.symbol, side: plan.route.side, amount: plan.route.inputAmount,
    inputSymbol: plan.route.inputSymbol, outputSymbol: plan.route.outputSymbol, expiresAt: plan.expiresAt, source: plan.route.source,
    quotedOutputAmount: plan.route.outputAmount, requestId: plan.requestId },
    canCancel: plan.route.source === 'cow-protocol' && order.status === 'PENDING_VENDOR' && !order.cancellationRequested }
}

export async function cancelAgentOrder(orderId: string, plan: Omit<AgentTradePlan, 'planToken'>, signature: unknown, credentials: Credentials): Promise<Omit<AgentOrder, 'receiptToken'>> {
  if (plan.route.source !== 'cow-protocol') throw new RouteError('cancellation_unavailable', 409)
  if (!same(orderId, cowOrderUid(plan))) throw new RouteError('invalid_order_payload', 400)
  if (typeof signature !== 'string' || !/^0x[a-fA-F0-9]{130}$/.test(signature)
    || !await verifyTypedData({ ...cowCancellationTypedData(orderId, plan.route.walletAddress), address: plan.route.walletAddress as Address, signature: signature as Hex })) throw new RouteError('invalid_order_signature', 403)
  const current = await checkAgentOrder(orderId, plan, credentials)
  if (current.status !== 'PENDING_VENDOR') return current
  try { await cancelCowOrder(orderId, signature as Hex) }
  catch (error) {
    // These explicit rejections can race a fill/cancel/expiry. Re-read rather
    // than inventing a terminal result; ambiguous writes remain unknown.
    if (!(error instanceof RouteError) || error.reason !== 'order_not_open') throw error
    return checkAgentOrder(orderId, plan, credentials)
  }
  try { return { ...await checkAgentOrder(orderId, plan, credentials), cancellationRequested: true } }
  catch { throw new RouteError('cancellation_unknown', 503) }
}

export async function recoverAgentTrade(plan: Omit<AgentTradePlan, 'planToken'>, signature: string, credentials: Credentials, previous: { started: boolean; orderId: string | null }): Promise<Omit<AgentOrder, 'receiptToken'> | null> {
  if (!/^0x[a-fA-F0-9]{130}$/.test(signature)) throw new RouteError('invalid_order_signature', 400)
  const typedData = validateOrderTypedData(plan.typedData, plan, Date.parse(plan.expiresAt) - 10_000)
  if (hashTypedData(typedData) !== plan.typedDataHash || !await verifyTypedData({ ...typedData, address: plan.route.walletAddress as Address, signature: signature as Hex })) throw new RouteError('invalid_order_signature', 403)
  const orderId = previous.orderId ?? (plan.route.source === 'cow-protocol' ? cowOrderUid(plan) : null)
  if (!orderId) return null
  try { return await checkAgentOrder(orderId, plan, credentials) }
  catch (error) {
    // A 404 is an unknown outcome, never evidence of cancellation or a fill.
    if (error instanceof RouteError && error.reason === 'order_not_found') return null
    throw error
  }
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
    const reading = path === '/api/trade/status' || path === '/api/trade/recover'
    const receiptRequest = path === '/api/trade/status' || path === '/api/trade/cancel'
    let ticket
    if (path !== '/api/trade/prepare') ticket = await openTradeTicket(receiptRequest ? body.receiptToken : body.planToken, userId, credentials.secretKey, receiptRequest ? 'receipt' : 'plan', reading)
    const plan = ticket?.plan as Omit<AgentTradePlan, 'planToken'> | undefined
    if (ticket && (!plan || !same(plan.route?.walletAddress, body.walletAddress))) throw new RouteError('wallet_not_verified', 403)
    if (!await verifyWalletIdentity(request.headers.get('privy-id-token'), env, userId, body.walletAddress)) throw new RouteError('wallet_not_verified', 403)
    const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName(userId))
    const limitPath = path === '/api/trade/prepare' ? 'quote-rate' : reading ? 'trade-status-rate' : 'trade-write-rate'
    const allowed = await stub.fetch(new Request(`https://account.internal/${limitPath}`, { method: 'POST', headers: { 'X-Privy-DID': userId } }))
    if (!allowed.ok) {
      const failure = object(await allowed.json())
      const reason = ['account_storage_not_configured', 'account_storage_unavailable'].includes(String(failure?.error)) ? failure!.error : 'rate_limited'
      return json({ error: reason }, allowed.status)
    }
    if (path === '/api/trade/prepare') {
      if (typeof body.symbol !== 'string' || !isSymbol(body.symbol) || (body.side !== 'buy' && body.side !== 'sell') || !parseQuantity(body.amount)) throw new RouteError('invalid_trade_request', 400)
      if (body.paymentToken !== undefined && !isPaymentToken(body.paymentToken)) throw new RouteError('invalid_trade_request', 400)
      if (body.sponsorApproval !== undefined && typeof body.sponsorApproval !== 'boolean') throw new RouteError('invalid_trade_request', 400)
      const prepared = await prepareAgentTrade(body.symbol, body.side, body.amount as string, body.walletAddress, credentials, request.signal, { paymentToken: body.paymentToken as PaymentToken | undefined, env: body.sponsorApproval === true ? env : undefined })
      const planToken = await sealTradeTicket({ plan: prepared }, userId, credentials.secretKey, 'plan')
      return json({ plan: { ...prepared, planToken } })
    }
    if (path === '/api/trade/approval/submit' && plan) return json({ approval: await relaySponsoredApproval(plan, body.rawTransaction, env, body.retry === true) })
    if (path === '/api/trade/approval/refresh' && plan) {
      if (Date.parse(plan.expiresAt) <= Date.now() + 5_000) throw new RouteError('stale_quote', 409)
      const cash = tradeCash((plan.route.side === 'buy' ? plan.route.inputSymbol : plan.route.outputSymbol) as PaymentToken)
      const inputToken = plan.route.side === 'buy' ? cash.address : assets[plan.route.symbol]
      const owner = plan.route.walletAddress as Address
      const [allowance, balance] = await Promise.all([
        tradingClient.readContract({ address: inputToken, abi: erc20Abi, functionName: 'allowance', args: [owner, COW_RELAYER] }),
        tradingClient.readContract({ address: inputToken, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
      ])
      if (balance < BigInt(plan.rawAmount)) throw new RouteError('insufficient_balance', 409)
      const prepared = { ...plan, approval: await prepareTokenApproval(inputToken, owner, plan.rawAmount, allowance, credentials, request.signal, env) }
      return json({ plan: { ...prepared, planToken: await sealTradeTicket({ plan: prepared }, userId, credentials.secretKey, 'plan') } })
    }
    if (path === '/api/trade/submit') {
      if (!plan || typeof body.signature !== 'string') throw new RouteError('invalid_order_signature', 400)
      const previous = await tradeAttempt(env.ACCOUNTS, userId, plan, body.signature, 'get')
      const submitted = await submitAgentTrade(plan, body.signature, credentials, { ...previous,
        beforeDispatch: async () => { await tradeAttempt(env.ACCOUNTS, userId, plan, body.signature as string, 'start') },
      })
      await tradeAttempt(env.ACCOUNTS, userId, plan, body.signature, 'complete', submitted.orderId)
      const receiptToken = await sealTradeTicket({ plan, orderId: submitted.orderId }, userId, credentials.secretKey, 'receipt')
      return json({ order: orderReceipt(submitted, plan, receiptToken) })
    }
    if (path === '/api/trade/recover' && plan) {
      if (typeof body.signature !== 'string') throw new RouteError('invalid_order_signature', 400)
      const previous = await tradeAttempt(env.ACCOUNTS, userId, plan, body.signature, 'get')
      const recovered = await recoverAgentTrade(plan, body.signature, credentials, previous)
      if (!recovered) return json({ order: null })
      const receiptToken = await sealTradeTicket({ plan, orderId: recovered.orderId }, userId, credentials.secretKey, 'receipt')
      return json({ order: orderReceipt(recovered, plan, receiptToken) })
    }
    if (path === '/api/trade/cancel' && plan && id(ticket?.orderId)) return json({ order: orderReceipt(await cancelAgentOrder(ticket.orderId, plan, body.signature, credentials), plan, body.receiptToken as string) })
    if (path === '/api/trade/status' && plan && id(ticket?.orderId)) return json({ order: orderReceipt(await checkAgentOrder(ticket.orderId, plan, credentials), plan, body.receiptToken as string) })
    return json({ error: 'not_found' }, 404)
  } catch (error) {
    if (error instanceof WalletVerificationError) return json({ error: error.message }, error.status)
    const reason = error instanceof RouteError ? error.reason : error instanceof Error && ['unsupported_order_schema', 'invalid_order_payload'].includes(error.message) ? error.message : 'provider_error'
    return json({ error: reason, ...(error instanceof RouteError && error.minimumUsd ? { minimumUsd: error.minimumUsd } : {}) }, error instanceof RouteError ? error.status : 503)
  }
}
