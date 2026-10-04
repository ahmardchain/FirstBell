import { decodeFunctionData, erc20Abi, getAddress, hashTypedData, parseUnits, type Address, type Hex } from 'viem'
import { tokenAddresses } from './asset-catalog.ts'
import { BSC_USDT } from './funding.ts'
import type { TradingRoute } from './trading.ts'

// CoW Protocol's published deployment and Order schema. Never sign a raw hash,
// permit, arbitrary vendor schema or an order with unreviewed spend semantics.
export const COW_SETTLEMENT = '0x9008D19f58AAbD9eD0D60971565AA8510560ab41' as Address
export const COW_RELAYER = '0xC92E8bdf79f0507f65a392b0ab4667716BFE0110' as Address
export const COW_ORDER_FIELDS = [
  { name: 'sellToken', type: 'address' }, { name: 'buyToken', type: 'address' }, { name: 'receiver', type: 'address' },
  { name: 'sellAmount', type: 'uint256' }, { name: 'buyAmount', type: 'uint256' }, { name: 'validTo', type: 'uint32' },
  { name: 'appData', type: 'bytes32' }, { name: 'feeAmount', type: 'uint256' }, { name: 'kind', type: 'string' },
  { name: 'partiallyFillable', type: 'bool' }, { name: 'sellTokenBalance', type: 'string' }, { name: 'buyTokenBalance', type: 'string' },
] as const
export type OrderTypedData = { domain: { name: 'Gnosis Protocol'; version: 'v2'; chainId: 56; verifyingContract: Address }; types: Record<string, { name: string; type: string }[]>; primaryType: 'Order'; message: Record<string, unknown> }
export type AgentTradePlan = {
  route: TradingRoute; inputDecimals: number; outputDecimals: number; rawAmount: string; minimumReceive: string;
  feeAmount: string; slippagePercent: '0.5'; expiresAt: string; requestId: string; orderQuoteId: string;
  typedData: OrderTypedData; typedDataHash: Hex;
  approval: null | { chainId: 56; to: Address; data: Hex; value: '0'; amount: string; spender: Address; reset: boolean; gasFeeBnb: string; simulated: true };
  planToken: string;
}
export type AgentOrder = { orderId: string; status: 'PENDING_VENDOR' | 'PENDING_ONCHAIN' | 'CONFIRMING' | 'FILLED' | 'FAILED' | 'EXPIRED' | 'CANCELLED'; txHash: Hex | null; inputAmount: string | null; outputAmount: string | null; receiptToken: string }
export const terminalOrder = (status: AgentOrder['status']) => ['FILLED', 'FAILED', 'EXPIRED', 'CANCELLED'].includes(status)
const obj = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const sameAddress = (a: unknown, b: string) => typeof a === 'string' && /^0x[a-fA-F0-9]{40}$/.test(a) && a.toLowerCase() === b.toLowerCase()
const integer = (value: unknown): value is string => typeof value === 'string' && /^(?:0|[1-9]\d{0,77})$/.test(value)

export function validateOrderTypedData(value: unknown, plan: Pick<AgentTradePlan, 'route' | 'rawAmount' | 'inputDecimals' | 'outputDecimals'>, now = Date.now()): OrderTypedData {
  if (typeof value === 'string') { try { value = JSON.parse(value) } catch { throw new Error('unsupported_order_schema') } }
  const data = obj(value), domain = obj(data?.domain), types = obj(data?.types), message = obj(data?.message)
  if (!data || !domain || !types || !message || plan.route.vendor !== 'CowSwap' || data.primaryType !== 'Order'
    || domain.name !== 'Gnosis Protocol' || domain.version !== 'v2' || Number(domain.chainId) !== 56
    || !sameAddress(domain.verifyingContract, COW_SETTLEMENT) || Object.keys(domain).some(key => !['name', 'version', 'chainId', 'verifyingContract'].includes(key))
    || Object.keys(data).some(key => !['domain', 'types', 'primaryType', 'message'].includes(key))
    || Object.keys(types).some(key => !['Order', 'EIP712Domain'].includes(key))
    || !Array.isArray(types.Order) || types.Order.length !== COW_ORDER_FIELDS.length
    || COW_ORDER_FIELDS.some((field, index) => obj((types.Order as unknown[])[index])?.name !== field.name || obj((types.Order as unknown[])[index])?.type !== field.type)
    || Object.keys(message).length !== COW_ORDER_FIELDS.length || COW_ORDER_FIELDS.some(field => !Object.hasOwn(message, field.name))) throw new Error('unsupported_order_schema')
  const sellToken = plan.route.side === 'buy' ? BSC_USDT.address : tokenAddresses[plan.route.symbol]
  const buyToken = plan.route.side === 'buy' ? tokenAddresses[plan.route.symbol] : BSC_USDT.address
  const quotedOutput = parseUnits(plan.route.outputAmount, plan.outputDecimals)
  const validTo = Number(message.validTo)
  if (!integer(message.sellAmount) || !integer(message.buyAmount) || !integer(message.feeAmount)
    || !sameAddress(message.sellToken, sellToken) || !sameAddress(message.buyToken, buyToken) || !sameAddress(message.receiver, plan.route.walletAddress)
    || BigInt(message.sellAmount) <= 0n || BigInt(message.buyAmount) <= 0n || BigInt(message.sellAmount) + BigInt(message.feeAmount) !== BigInt(plan.rawAmount)
    || BigInt(message.buyAmount) < quotedOutput * 995n / 1000n
    || message.kind !== 'sell' || message.partiallyFillable !== false || message.sellTokenBalance !== 'erc20' || message.buyTokenBalance !== 'erc20'
    || typeof message.appData !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(message.appData)
    || !Number.isSafeInteger(validTo) || validTo * 1000 < now + 5_000 || validTo * 1000 > now + 1_800_000) throw new Error('invalid_order_payload')
  // Rebuild the domain and types so caller-supplied EIP712Domain types cannot
  // alter what Privy signs. This is the exact audited Order hashing schema.
  return { domain: { name: 'Gnosis Protocol', version: 'v2', chainId: 56, verifyingContract: COW_SETTLEMENT },
    types: { Order: COW_ORDER_FIELDS.map(field => ({ ...field })) }, primaryType: 'Order', message }
}

export function validateAgentTradePlan(value: unknown, request: { symbol: string; side: 'buy' | 'sell'; amount: string; walletAddress: string }): AgentTradePlan {
  const plan = value as AgentTradePlan
  const route = plan?.route
  if (!route || route.source !== 'binance-web3' || route.chainId !== 56 || route.executionMode !== 'RFQ' || route.executable !== false
    || route.symbol !== request.symbol || route.side !== request.side || route.inputAmount !== request.amount || !sameAddress(route.walletAddress, request.walletAddress)
    || route.inputSymbol !== (request.side === 'buy' ? 'USDT' : request.symbol) || route.outputSymbol !== (request.side === 'buy' ? request.symbol : 'USDT')
    || !integer(plan.rawAmount) || !Number.isInteger(plan.inputDecimals) || plan.inputDecimals < 0 || plan.inputDecimals > 36
    || !Number.isInteger(plan.outputDecimals) || plan.outputDecimals < 0 || plan.outputDecimals > 36
    || (request.side === 'buy' ? plan.inputDecimals : plan.outputDecimals) !== BSC_USDT.decimals
    || plan.rawAmount !== parseUnits(request.amount, plan.inputDecimals).toString() || plan.slippagePercent !== '0.5'
    || typeof plan.planToken !== 'string' || plan.planToken.length > 20_000 || !plan.planToken
    || !/^[a-f0-9-]{36}$/.test(plan.requestId) || !/^[a-zA-Z0-9_-]{1,256}$/.test(plan.orderQuoteId)
    || !/^\d+(?:\.\d+)?$/.test(route.outputAmount)) throw new Error('invalid_order_payload')
  const typedData = validateOrderTypedData(plan.typedData, plan)
  if (hashTypedData(typedData) !== plan.typedDataHash || Date.parse(plan.expiresAt) !== Number(typedData.message.validTo) * 1000
    || plan.minimumReceive !== BigInt(typedData.message.buyAmount as string).toString() || plan.feeAmount !== typedData.message.feeAmount) throw new Error('invalid_order_payload')
  if (plan.approval) {
    const approval = plan.approval
    const token = request.side === 'buy' ? BSC_USDT.address : tokenAddresses[request.symbol]
    const decoded = decodeFunctionData({ abi: erc20Abi, data: approval.data })
    if (approval.chainId !== 56 || approval.value !== '0' || !sameAddress(approval.to, token) || !sameAddress(approval.spender, COW_RELAYER)
      || decoded.functionName !== 'approve' || !sameAddress(decoded.args?.[0], COW_RELAYER)
      || decoded.args?.[1] !== BigInt(approval.reset ? '0' : plan.rawAmount) || approval.amount !== decoded.args?.[1].toString()
      || approval.simulated !== true || !/^\d+(?:\.\d+)?$/.test(approval.gasFeeBnb)) throw new Error('invalid_order_payload')
  }
  return { ...plan, typedData, ...(plan.approval ? { approval: { ...plan.approval, to: getAddress(plan.approval.to) } } : {}) }
}
