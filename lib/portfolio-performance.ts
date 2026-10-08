import type { AgentOrder } from './agent-trading.ts'

export function orderAmounts(order: AgentOrder) {
  const trade = order.trade
  if (!trade) return null
  const filled = order.status === 'FILLED'
  const input = filled ? order.inputAmount : trade.amount
  const output = filled ? order.outputAmount : trade.quotedOutputAmount ?? null
  return { input, output, inputSymbol: trade.inputSymbol, outputSymbol: trade.outputSymbol,
    token: trade.side === 'buy' ? output : input, estimated: !filled }
}

// Weighted average cost of the remaining position. Only verified fills count;
// quotes, cancelled/failed orders and the proceeds of sales are not purchases.
export function positionPerformance(symbol: string, quantity: string, price: number | null, orders: AgentOrder[]) {
  const held = Number(quantity)
  if (!Number.isFinite(held) || held <= 0 || price === null || !Number.isFinite(price) || price <= 0) return null
  const fills = orders.filter(order => order.status === 'FILLED' && order.trade?.symbol === symbol)
    .sort((a, b) => Date.parse(a.createdAt ?? a.trade!.expiresAt) - Date.parse(b.createdAt ?? b.trade!.expiresAt))
  let units = 0, cost = 0
  const seen = new Set<string>()
  for (const order of fills) {
    if (seen.has(order.orderId)) continue
    seen.add(order.orderId)
    const input = Number(order.inputAmount), output = Number(order.outputAmount)
    if (!Number.isFinite(input) || input <= 0 || !Number.isFinite(output) || output <= 0) return null
    if (order.trade!.side === 'buy') {
      if (order.trade!.inputSymbol !== 'USDT') return null
      units += output; cost += input
    } else {
      if (input > units + Math.max(units, input) * 1e-9) return null
      cost *= Math.max(0, units - input) / units
      units = Math.max(0, units - input)
    }
  }
  // Transfers, missing legacy history and truncated receipts have unknown cost.
  // Never assign today's price or cash remaining as the purchase price.
  if (cost <= 0 || units <= 0 || Math.abs(units - held) > Math.max(units, held) * 1e-9) return null
  const value = held * price, gain = value - cost
  const averagePrice = cost / units, gainPct = gain / cost * 100
  return [value, gain, averagePrice, gainPct].every(Number.isFinite)
    ? { value, cost, averagePrice, gain, gainPct } : null
}

export type CashTransfer = { id: string; kind: 'deposit' | 'withdrawal'; amount: string;
  status: 'success' | 'fail' | 'pending'; hash: string; createdAt: string; counterparty: string }
export type WalletActivityPage = { transfers: CashTransfer[]; cursor: string | null }

export type PurchaseBasis = { symbol: string; quantity: string; cost: number; asOf: string }
export function performanceFromBasis(basis: PurchaseBasis | undefined, quantity: string, price: number | null) {
  if (!basis || !Number.isFinite(basis.cost) || basis.cost <= 0 || price === null || !Number.isFinite(price) || price <= 0) return null
  const held = Number(quantity), known = Number(basis.quantity)
  if (!Number.isFinite(held) || held <= 0 || !Number.isFinite(known) || known <= 0 || Math.abs(held - known) > Math.max(held, known) * 1e-9) return null
  const value = held * price, gain = value - basis.cost
  const averagePrice = basis.cost / held, gainPct = gain / basis.cost * 100
  return [value, gain, averagePrice, gainPct].every(Number.isFinite) ? { value, cost: basis.cost, averagePrice, gain, gainPct } : null
}

// All current holdings must have matching purchase evidence. Cash and realized
// sale proceeds are excluded; percentages are weighted by remaining cost.
export function positionsPerformance(holdings: { symbol: string; quantity: string; price: number | null }[], orders: AgentOrder[], basis: Record<string, PurchaseBasis> = {}) {
  if (!holdings.length) return null
  let value = 0, cost = 0
  for (const holding of holdings) {
    const result = positionPerformance(holding.symbol, holding.quantity, holding.price, orders)
      ?? performanceFromBasis(basis[holding.symbol], holding.quantity, holding.price)
    if (!result) return null
    value += result.value
    cost += result.cost
  }
  const gain = value - cost, gainPct = gain / cost * 100
  return [value, cost, gain, gainPct].every(Number.isFinite) ? { value, cost, gain, gainPct } : null
}
