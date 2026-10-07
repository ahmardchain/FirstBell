import { concatHex, formatUnits, hashTypedData, keccak256, numberToHex, toHex, type Hex } from 'viem'
import { COW_ORDER_FIELDS, COW_SETTLEMENT, validateOrderTypedData, type AgentOrder, type AgentTradePlan } from '../lib/agent-trading.ts'
import { BSC_USDT } from '../lib/funding.ts'
import type { TradingRoute } from '../lib/trading.ts'
import { getTradingInputAmount, readTokenDecimals, RouteError, tradingClient } from './binance-trading.ts'
import { assets, type Symbol } from './market.ts'

type Plan = Omit<AgentTradePlan, 'planToken'>
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const same = (value: unknown, expected: string) => typeof value === 'string' && value.toLowerCase() === expected.toLowerCase()
const integer = (value: unknown): value is string => typeof value === 'string' && /^(?:0|[1-9]\d{0,77})$/.test(value)
const appData = '{}'
const appDataHash = keccak256(toHex(appData))
const uid = (value: unknown): value is Hex => typeof value === 'string' && /^0x[a-fA-F0-9]{112}$/.test(value)
const rejectionReasons: Record<string, string> = {
  NoLiquidity: 'no_verified_route', UnsupportedToken: 'no_verified_route',
  SellAmountDoesNotCoverFee: 'minimum_order_not_met', InsufficientBalance: 'insufficient_balance', InsufficientAllowance: 'approval_required',
  NonZeroFee: 'order_fee_changed', QuoteNotFound: 'stale_quote', QuoteExpired: 'stale_quote', InvalidQuote: 'stale_quote',
  ValidToTooSoon: 'stale_quote', InsufficientValidTo: 'stale_quote',
  InvalidSignature: 'invalid_order_signature', WrongOwner: 'invalid_order_signature',
  InvalidAppData: 'invalid_order_payload', AppDataHashMismatch: 'invalid_order_payload',
  OrderNotFound: 'order_not_found', AlreadyCancelled: 'order_not_open', OrderFullyExecuted: 'order_not_open', OrderExpired: 'order_not_open', OnChainOrder: 'cancellation_unavailable',
}

// Fixed BNB-chain API only. No client-selected origin, redirects, hooks or keys.
async function cowRequest(method: 'GET' | 'POST' | 'DELETE', path: string, input?: unknown, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(12_000)
  const bounded = signal ? AbortSignal.any([signal, timeout]) : timeout
  const writing = method === 'POST' && path === '/api/v1/orders'
  const cancelling = method === 'DELETE' && path === '/api/v1/orders'
  const unknownWrite = cancelling ? 'cancellation_unknown' : 'submission_unknown'
  const stage = path.endsWith('/quote') ? 'quote' : writing ? 'submit' : cancelling ? 'cancel' : 'status'
  const started = performance.now()
  let httpStatus: number | undefined
  try {
    bounded.throwIfAborted()
    const response = await fetch(`https://api.cow.fi/bnb${path}`, { method, redirect: 'error', cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }), signal: bounded })
    httpStatus = response.status
    if (method === 'GET' && response.status === 404) return null
    // The spec does not require a cancellation acknowledgement body. The
    // deployed handler may return JSON "Cancelled"; re-read the actual order.
    if (cancelling && response.status === 200) { await response.body?.cancel().catch(() => {}); return null }
    if (!response.body || Number(response.headers.get('content-length')) > 300_000) throw new RouteError(writing || cancelling ? unknownWrite : 'invalid_provider_response')
    const reader = response.body.getReader(), decoder = new TextDecoder()
    let size = 0, text = ''
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > 300_000) { await reader.cancel(); throw new RouteError(writing || cancelling ? unknownWrite : 'invalid_provider_response') }
        text += decoder.decode(chunk.value, { stream: true })
      }
    } finally { reader.releaseLock() }
    bounded.throwIfAborted()
    let result: unknown
    try { result = JSON.parse(text + decoder.decode()) } catch { throw new RouteError(writing || cancelling ? unknownWrite : 'invalid_provider_response') }
    if (!response.ok) {
      const type = object(result)?.errorType
      const knownType = typeof type === 'string' && (Object.hasOwn(rejectionReasons, type) || type === 'DuplicatedOrder') ? type : 'Other'
      // Never log upstream descriptions, signatures, wallet addresses or URLs.
      console.warn('TRADE_COW_REJECTION', { stage, httpStatus, errorType: knownType })
      if (writing && response.status < 500 && type === 'DuplicatedOrder') return { duplicate: true }
      const reason = (writing || cancelling) && response.status >= 500 ? unknownWrite : rejectionReasons[knownType] ?? 'provider_error'
      throw new RouteError(reason, response.status >= 500 ? 503 : 400)
    }
    return result
  } catch (error) {
    if (error instanceof RouteError) throw error
    if (writing || cancelling) throw new RouteError(unknownWrite)
    if (bounded.aborted) throw new RouteError('quote_timeout', 504)
    throw new RouteError('provider_error')
  } finally {
    console.info('TRADE_COW_TIMING', { stage, httpStatus, durationMs: Math.round(performance.now() - started) })
  }
}

export async function cancelCowOrder(orderId: string, signature: Hex) {
  if (!uid(orderId)) throw new RouteError('invalid_order_payload', 400)
  await cowRequest('DELETE', '/api/v1/orders', { orderUids: [orderId], signature, signingScheme: 'eip712' })
}

export async function getCowTrade(symbol: Symbol, side: 'buy' | 'sell', amount: string, walletAddress: string, signal?: AbortSignal) {
  const startedAt = Date.now()
  const buying = side === 'buy'
  const [[rawAmount, tokenDecimals, chain], result] = await Promise.all([
    Promise.all([getTradingInputAmount(symbol, side, amount), readTokenDecimals(symbol), tradingClient.getChainId()]),
    (async () => {
      const rawAmount = await getTradingInputAmount(symbol, side, amount)
      return cowRequest('POST', '/api/v1/quote', { sellToken: buying ? BSC_USDT.address : assets[symbol], buyToken: buying ? assets[symbol] : BSC_USDT.address,
        sellAmountBeforeFee: rawAmount, kind: 'sell', from: walletAddress, receiver: walletAddress, appData,
        signingScheme: 'eip712', partiallyFillable: false, sellTokenBalance: 'erc20', buyTokenBalance: 'erc20', validFor: 120, priceQuality: 'optimal' }, signal)
    })(),
  ])
  if (chain !== 56) throw new RouteError('chain_unavailable')
  signal?.throwIfAborted()
  const response = object(result), quote = object(response?.quote)
  const expiration = typeof response?.expiration === 'string' ? Date.parse(response.expiration) : NaN
  if (!quote || !same(response?.from, walletAddress) || !Number.isSafeInteger(response?.id) || Number(response?.id) <= 0
    || !Number.isFinite(expiration) || expiration <= Date.now() + 5_000
    || !(quote.appData === appData || same(quote.appData, appDataHash)) || (quote.signingScheme !== undefined && quote.signingScheme !== 'eip712')
    || typeof quote.buyAmount !== 'string' || !/^[1-9]\d{0,77}$/.test(quote.buyAmount)
    || !integer(quote.sellAmount) || !integer(quote.feeAmount) || BigInt(quote.sellAmount) <= 0n
    || BigInt(quote.sellAmount) + BigInt(quote.feeAmount) !== BigInt(rawAmount)) throw new RouteError('invalid_provider_response')
  const inputDecimals = buying ? BSC_USDT.decimals : tokenDecimals, outputDecimals = buying ? tokenDecimals : BSC_USDT.decimals
  const route: TradingRoute = { source: 'cow-protocol', chainId: 56, symbol, side, walletAddress, inputAmount: amount,
    inputSymbol: buying ? 'USDT' : symbol, outputAmount: formatUnits(BigInt(quote.buyAmount), outputDecimals), outputSymbol: buying ? symbol : 'USDT',
    vendor: 'CowSwap', executionMode: 'RFQ', executable: false, checkedAt: new Date().toISOString(), refreshAt: new Date(Math.min(expiration, startedAt + 30_000)).toISOString() }
  const message = Object.fromEntries(COW_ORDER_FIELDS.map(field => [field.name, quote[field.name]]))
  // The REST schema accepts/returns full JSON; EIP-712 requires its bytes32 hash.
  // Only our exact empty JSON or its hash is accepted, so no hooks enter signing.
  message.appData = appDataHash
  // Validate the original net quote + fee above before normalizing the order.
  // Current CoW orders sign gross spend and zero fee; the quote fee is only an
  // estimate. Preserve the quoted net receive and the user's exact gross spend.
  message.sellAmount = rawAmount
  message.feeAmount = '0'
  // Bind order validity to the offered quote's expiration.
  if (!Number.isSafeInteger(message.validTo) || Number(message.validTo) * 1000 > expiration) throw new RouteError('invalid_provider_response')
  message.buyAmount = (BigInt(quote.buyAmount) * 995n / 1000n).toString()
  const typedData = validateOrderTypedData({ domain: { name: 'Gnosis Protocol', version: 'v2', chainId: 56, verifyingContract: COW_SETTLEMENT },
    types: { Order: COW_ORDER_FIELDS.map(field => ({ ...field })) }, primaryType: 'Order', message }, { route, rawAmount, inputDecimals, outputDecimals })
  return { route, rawAmount, tokenDecimals, inputDecimals, outputDecimals, estimatedFeeAmount: quote.feeAmount, orderQuoteId: String(response!.id), typedData }
}

export function cowOrderUid(plan: Pick<Plan, 'route' | 'typedData'>): Hex {
  return concatHex([hashTypedData(plan.typedData), plan.route.walletAddress.toLowerCase() as Hex, numberToHex(Number(plan.typedData.message.validTo), { size: 4 })])
}

function verifyCowOrder(value: unknown, orderId: string, plan: Pick<Plan, 'route'>) {
  const order = object(value)
  const buying = plan.route.side === 'buy'
  if (!order || !same(order.uid, orderId) || !same(order.owner, plan.route.walletAddress)
    || !same(order.sellToken, buying ? BSC_USDT.address : assets[plan.route.symbol])
    || !same(order.buyToken, buying ? assets[plan.route.symbol] : BSC_USDT.address)
    || !same(order.receiver, plan.route.walletAddress) || order.partiallyFillable !== false) throw new RouteError('invalid_provider_response')
  return order
}

export async function submitCowOrder(plan: Plan, signature: string, recovering: boolean) {
  const orderId = cowOrderUid(plan)
  if (recovering) {
    const existing = await cowRequest('GET', `/api/v1/orders/${orderId}`)
    if (existing !== null) { verifyCowOrder(existing, orderId, plan); return orderId }
  }
  // Historical signatures may contain the obsolete fee. Look up their exact
  // UID first, but never rewrite signed fields or rebroadcast an invalid order.
  if (plan.typedData.message.feeAmount !== '0') throw new RouteError('order_fee_changed', 409)
  const result = await cowRequest('POST', '/api/v1/orders', { ...plan.typedData.message, appData, appDataHash,
    from: plan.route.walletAddress, signingScheme: 'eip712', signature, quoteId: Number(plan.orderQuoteId) })
  if (object(result)?.duplicate === true) {
    verifyCowOrder(await cowRequest('GET', `/api/v1/orders/${orderId}`), orderId, plan)
    return orderId
  }
  if (!uid(result) || !same(result, orderId)) throw new RouteError('submission_unknown')
  return orderId
}

export async function checkCowOrder(orderId: string, plan: Pick<Plan, 'route'>): Promise<{ orderId: string; status: AgentOrder['status']; txHash: Hex | null }> {
  if (!uid(orderId)) throw new RouteError('invalid_provider_response')
  const response = await cowRequest('GET', `/api/v1/orders/${orderId}`)
  if (response === null) throw new RouteError('order_not_found', 404)
  const order = verifyCowOrder(response, orderId, plan)
  const statuses: Record<string, AgentOrder['status']> = { open: 'PENDING_VENDOR', fulfilled: 'FILLED', cancelled: 'CANCELLED', expired: 'EXPIRED' }
  const status = statuses[String(order.status)]
  if (!status) throw new RouteError('invalid_provider_response')
  if (status !== 'FILLED') return { orderId, status, txHash: null }
  const trades = await cowRequest('GET', `/api/v2/trades?orderUid=${orderId}&offset=0&limit=2`)
  if (!Array.isArray(trades)) throw new RouteError('invalid_provider_response')
  if (!trades.length) return { orderId, status: 'CONFIRMING', txHash: null }
  const trade = object(trades[0])
  if (trades.length !== 1 || !trade || !same(trade.orderUid, orderId) || !same(trade.owner, plan.route.walletAddress)
    || !same(trade.sellToken, String(order.sellToken)) || !same(trade.buyToken, String(order.buyToken))) throw new RouteError('settlement_not_verified', 409)
  if (trade.txHash === null) return { orderId, status: 'CONFIRMING', txHash: null }
  if (typeof trade.txHash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(trade.txHash)) throw new RouteError('invalid_provider_response')
  return { orderId, status: 'FILLED', txHash: trade.txHash as Hex }
}
