import { decodeEventLog, erc20Abi, formatUnits, parseAbi, type Hex, type TransactionReceipt } from 'viem'
import { COW_SETTLEMENT } from '../lib/agent-trading.ts'
import { BSC_USDT } from '../lib/funding.ts'
import type { PurchaseBasis } from '../lib/portfolio-performance.ts'
import { getCowWalletTrades } from './cow-trading.ts'
import { readTokenDecimals, RouteError, tradingClient } from './binance-trading.ts'
import { assets, type Symbol } from './market.ts'

export const settlementTradeAbi = parseAbi(['event Trade(address indexed owner, address sellToken, address buyToken, uint256 sellAmount, uint256 buyAmount, uint256 feeAmount, bytes orderUid)'])
const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()
const rawAmount = (a: unknown): a is string => typeof a === 'string' && /^[1-9]\d{0,77}$/.test(a)
type Fill = { orderUid: Hex; txHash: Hex; blockNumber: number; logIndex: number; sellToken: string; buyToken: string; sellAmount: bigint; buyAmount: bigint }

function readFill(value: unknown, owner: string): Fill {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  if (!row || !same(row.owner, owner) || typeof row.orderUid !== 'string' || !/^0x[a-fA-F0-9]{112}$/.test(row.orderUid)
    || !same(`0x${row.orderUid.slice(66, 106)}`, owner) || typeof row.txHash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(row.txHash)
    || typeof row.sellToken !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(row.sellToken)
    || typeof row.buyToken !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(row.buyToken)
    || !Number.isSafeInteger(row.blockNumber) || Number(row.blockNumber) <= 0 || !Number.isSafeInteger(row.logIndex) || Number(row.logIndex) < 0
    || !rawAmount(row.sellAmount) || !rawAmount(row.buyAmount)) throw new RouteError('purchase_history_unverified')
  return { orderUid: row.orderUid as Hex, txHash: row.txHash as Hex, blockNumber: Number(row.blockNumber), logIndex: Number(row.logIndex),
    sellToken: row.sellToken, buyToken: row.buyToken, sellAmount: BigInt(row.sellAmount), buyAmount: BigInt(row.buyAmount) }
}

// Bind the indexer's fill to the actual settlement event, confirmed receipt and
// wallet's exact token transfers. Indexer amounts alone never become cost.
export function verifyPurchaseFill(fill: Fill, receipt: TransactionReceipt, owner: string, tip: bigint) {
  if (!same(receipt.transactionHash, fill.txHash) || receipt.status !== 'success' || !same(receipt.to, COW_SETTLEMENT)
    || receipt.blockNumber !== BigInt(fill.blockNumber) || tip < receipt.blockNumber + 1n) return false
  let spent = 0n, received = 0n, ownEvents = 0, matchingEvent = false
  for (const log of receipt.logs) {
    if (same(log.address, COW_SETTLEMENT)) {
      try {
        const event = decodeEventLog({ abi: settlementTradeAbi, eventName: 'Trade', data: log.data, topics: log.topics })
        if (same(event.args.owner, owner)) {
          ownEvents++
          if (log.logIndex === fill.logIndex && same(event.args.orderUid, fill.orderUid)
            && same(event.args.sellToken, fill.sellToken) && same(event.args.buyToken, fill.buyToken)
            && event.args.sellAmount === fill.sellAmount && event.args.buyAmount === fill.buyAmount) matchingEvent = true
        }
      } catch { /* Ignore other settlement event types. */ }
    }
    if (!same(log.address, fill.sellToken) && !same(log.address, fill.buyToken)) continue
    try {
      const event = decodeEventLog({ abi: erc20Abi, eventName: 'Transfer', data: log.data, topics: log.topics })
      if (same(log.address, fill.sellToken)) {
        if (same(event.args.from, owner)) spent += event.args.value
        if (same(event.args.to, owner)) spent -= event.args.value
      }
      if (same(log.address, fill.buyToken)) {
        if (same(event.args.to, owner)) received += event.args.value
        if (same(event.args.from, owner)) received -= event.args.value
      }
    } catch { /* Only actual ERC-20 transfer logs count. */ }
  }
  // Multiple fills by the same wallet in one settlement need allocation. Fail
  // closed rather than assigning its aggregate cash spend to one position.
  return ownEvents === 1 && matchingEvent && spent === fill.sellAmount && received === fill.buyAmount
}

async function recover(owner: string, symbols: Symbol[], signal: AbortSignal): Promise<PurchaseBasis[]> {
  const values = await getCowWalletTrades(owner, signal)
  const unique = new Map<string, Fill>()
  for (const value of values) {
    const fill = readFill(value, owner), key = `${fill.txHash.toLowerCase()}:${fill.logIndex}`
    const previous = unique.get(key)
    if (previous && (previous.orderUid.toLowerCase() !== fill.orderUid.toLowerCase() || previous.sellAmount !== fill.sellAmount || previous.buyAmount !== fill.buyAmount
      || previous.blockNumber !== fill.blockNumber || !same(previous.sellToken, fill.sellToken) || !same(previous.buyToken, fill.buyToken))) throw new RouteError('purchase_history_unverified')
    unique.set(key, fill)
  }
  const fills = [...unique.values()].filter(fill => symbols.some(symbol => same(fill.sellToken, assets[symbol]) || same(fill.buyToken, assets[symbol])))
    .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
  if (!fills.length || fills.length > 40) return []
  const relevant = symbols.filter(symbol => fills.some(fill => same(fill.sellToken, assets[symbol]) || same(fill.buyToken, assets[symbol])))
  const [tip, chain, metadata] = await Promise.all([tradingClient.getBlockNumber({ cacheTime: 0 }), tradingClient.getChainId(),
    Promise.allSettled(relevant.map(async symbol => [symbol, await readTokenDecimals(symbol)] as const))])
  signal.throwIfAborted()
  if (chain !== 56) throw new RouteError('chain_unavailable')
  const receipts = new Map<string, TransactionReceipt>()
  const hashes = [...new Set(fills.map(fill => fill.txHash.toLowerCase() as Hex))]
  for (let start = 0; start < hashes.length; start += 3) {
    signal.throwIfAborted()
    const results = await Promise.allSettled(hashes.slice(start, start + 3).map(hash => tradingClient.getTransactionReceipt({ hash })))
    signal.throwIfAborted()
    for (let index = 0; index < results.length; index++) {
      const result = results[index]
      if (result.status === 'fulfilled') receipts.set(hashes[start + index], result.value)
    }
  }
  const costs: PurchaseBasis[] = [], asOf = new Date().toISOString()
  for (const [symbol, tokenDecimals] of metadata.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])) {
    let held = 0n, cost = 0, valid = true
    for (const fill of fills.filter(fill => same(fill.sellToken, assets[symbol]) || same(fill.buyToken, assets[symbol]))) {
      const buying = same(fill.buyToken, assets[symbol]), receipt = receipts.get(fill.txHash.toLowerCase())
      if (!same(buying ? fill.sellToken : fill.buyToken, BSC_USDT.address) || !receipt || !verifyPurchaseFill(fill, receipt, owner, tip)) { valid = false; break }
      if (buying) {
        held += fill.buyAmount
        cost += Number(formatUnits(fill.sellAmount, BSC_USDT.decimals))
      } else {
        if (fill.sellAmount > held) { valid = false; break }
        const remaining = held - fill.sellAmount
        cost *= Number(remaining) / Number(held)
        held = remaining
      }
    }
    // The client also requires this exact remaining quantity to match the
    // current wallet balance; missing purchases/transfers cannot imply profit.
    if (valid && held > 0n && cost > 0 && Number.isFinite(cost)) costs.push({ symbol, quantity: formatUnits(held, tokenDecimals), cost, asOf })
  }
  return costs
}

export async function recoverWalletPurchaseBasis(owner: string, symbols: Symbol[]): Promise<PurchaseBasis[]> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12_000)
  const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new RouteError('purchase_history_timeout')), { once: true }))
  try { return await Promise.race([recover(owner, symbols, controller.signal), aborted]) }
  catch { return [] }
  finally { clearTimeout(timer) }
}
