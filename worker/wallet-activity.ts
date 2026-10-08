import { decodeEventLog, erc20Abi, formatUnits, isAddress, type Hex } from 'viem'
import { BSC_USDT } from '../lib/funding.ts'
import { COW_RELAYER, COW_SETTLEMENT } from '../lib/agent-trading.ts'
import type { CashTransfer, PurchaseBasis, WalletActivityPage } from '../lib/portfolio-performance.ts'
import { assets, isSymbol, type Symbol } from './market.ts'
import { recoverWalletPurchaseBasis, recoverWalletTrades } from './wallet-purchase-basis.ts'
import { tradingClient } from './binance-trading.ts'
import { signedBinanceRequest, binanceFailure, type BinanceCredentials } from './binance-api.ts'
import { verifyWalletIdentity } from './wallet-verification.ts'
import type { ApiEnv } from './env.ts'

const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()
const rawAmount = (value: unknown): value is string => typeof value === 'string' && /^(?:0|[1-9]\d{0,77})$/.test(value)
const parties = (value: unknown) => Array.isArray(value) ? value.map(object).filter(item => item && typeof item.address === 'string' && isAddress(item.address)) : []
const validCursor = (value: unknown): value is string => typeof value === 'string' && value.length <= 512 && /^[A-Za-z0-9_+/=-]*$/.test(value)

export function parseCashActivity(data: unknown, owner: string): WalletActivityPage {
  if (!Array.isArray(data) || data.length > 1) throw new Error('invalid_wallet_activity')
  if (!data.length) return { transfers: [], cursor: null }
  const page = object(data[0])
  if (!page || !Array.isArray(page.transactionList) || page.transactionList.length > 100
    || !validCursor(page.cursor ?? '')) throw new Error('invalid_wallet_activity')
  const entries = new Map<string, CashTransfer>()
  for (const value of page.transactionList) {
    const row = object(value)
    if (!row || String(row.binanceChainId) !== '56' || !['0', '1', '2'].includes(String(row.itype)) || same(row.methodId, '0x095ea7b3')
      || !same(row.tokenContractAddress, BSC_USDT.address) || typeof row.txHash !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(row.txHash)
      || !['success', 'fail', 'pending'].includes(String(row.txStatus))) continue
    const at = Number(row.txTime)
    if (!Number.isFinite(at) || at < 1_500_000_000_000 || at > Date.now() + 120_000) continue
    const from = parties(row.from), to = parties(row.to)
    // A stock settlement's cash leg is a trade, not a deposit/withdrawal.
    if ([...from, ...to].some(party => same(party!.address, COW_SETTLEMENT) || same(party!.address, COW_RELAYER))) continue
    const outgoing = from.filter(party => same(party!.address, owner)), incoming = to.filter(party => same(party!.address, owner))
    if (Boolean(outgoing.length) === Boolean(incoming.length)) continue
    const walletParties = incoming.length ? incoming : outgoing
    const amounts = walletParties.map(party => rawAmount(party!.amount) ? party!.amount as string
      : walletParties.length === 1 && rawAmount(row.amount) ? row.amount : null)
    if (amounts.some(amount => amount === null)) continue
    const amount = amounts.reduce<bigint>((sum, amount) => sum + BigInt(amount!), 0n)
    if (amount <= 0n) continue
    const other = incoming.length ? from : to
    const counterparty = other.find(party => !same(party!.address, owner))?.address
    if (typeof counterparty !== 'string') continue
    const kind = incoming.length ? 'deposit' : 'withdrawal'
    const id = `${row.txHash.toLowerCase()}:${kind}`
    if (entries.has(id)) continue
    entries.set(id, { id, kind, amount: formatUnits(amount, 18), hash: row.txHash, createdAt: new Date(at).toISOString(),
      status: row.txStatus as CashTransfer['status'], counterparty })
  }
  return { transfers: [...entries.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), cursor: page.cursor ? String(page.cursor) : null }
}

async function readCashActivity(owner: string, cursor: string, credentials: BinanceCredentials, signal: AbortSignal): Promise<WalletActivityPage> {
  if (!isAddress(owner) || !validCursor(cursor)) throw new Error('invalid_wallet_activity')
  let unfiltered = cursor.startsWith('all-')
  const providerCursor = unfiltered ? cursor.slice(4) : cursor
  let result = await signedBinanceRequest('GET', '/api/v1/dex/post-transaction/transactions-by-address', {
    address: owner.toLowerCase(), chains: '56', ...(!unfiltered ? { tokenContractAddress: BSC_USDT.address } : {}), limit: '100', ...(providerCursor ? { cursor: providerCursor } : {}),
  }, credentials)
  signal.throwIfAborted()
  // Some indexers omit contract-filtered rows. An unfiltered read still applies
  // the exact BSC/USDT/wallet restrictions locally; it cannot add native BNB.
  const first = Array.isArray(result.data) ? object(result.data[0]) : null
  if (!cursor && Array.isArray(result.data) && (!result.data.length || Array.isArray(first?.transactionList) && !first.transactionList.length)) {
    unfiltered = true
    result = await signedBinanceRequest('GET', '/api/v1/dex/post-transaction/transactions-by-address', { address: owner.toLowerCase(), chains: '56', limit: '100' }, credentials)
    signal.throwIfAborted()
  }
  const page = parseCashActivity(result.data, owner)
  if (unfiltered && page.cursor) {
    if (page.cursor.length > 508) throw new Error('invalid_wallet_activity')
    page.cursor = `all-${page.cursor}`
  }
  const rows = Array.isArray(result.data) && Array.isArray(object(result.data[0])?.transactionList) ? object(result.data[0])!.transactionList as unknown[] : []
  const ambiguous = new Set(rows.map(object).filter(row => row && (String(row.itype) !== '2' || [...parties(row.from), ...parties(row.to)].some(party => !rawAmount(party!.amount))))
    .map(row => String(row!.txHash).toLowerCase()))
  const candidates = page.transfers.filter(item => ambiguous.has(item.hash.toLowerCase()))
  if (!candidates.length) return page
  if (candidates.length > 12) throw new Error('activity_unavailable')
  const [tip, chain] = await Promise.all([tradingClient.getBlockNumber({ cacheTime: 0 }), tradingClient.getChainId()])
  if (chain !== 56) throw new Error('activity_unavailable')
  const verified = new Set<string>()
  for (let start = 0; start < candidates.length; start += 3) {
    signal.throwIfAborted()
    await Promise.all(candidates.slice(start, start + 3).map(async item => {
      const receipt = await tradingClient.getTransactionReceipt({ hash: item.hash as Hex })
      signal.throwIfAborted()
      if (!same(receipt.transactionHash, item.hash) || receipt.status !== 'success' || tip < receipt.blockNumber + 1n) return
      let net = 0n
      for (const log of receipt.logs) {
        if (!same(log.address, BSC_USDT.address)) continue
        try {
          const event = decodeEventLog({ abi: erc20Abi, eventName: 'Transfer', data: log.data, topics: log.topics })
          if (same(event.args.from, COW_SETTLEMENT) || same(event.args.from, COW_RELAYER) || same(event.args.to, COW_SETTLEMENT) || same(event.args.to, COW_RELAYER)) return
          if (same(event.args.to, owner)) net += event.args.value
          if (same(event.args.from, owner)) net -= event.args.value
        } catch { /* Native calls and permissions have no USDT Transfer event. */ }
      }
      if (formatUnits(item.kind === 'deposit' ? net : -net, 18) === item.amount) verified.add(item.id)
    }))
  }
  return { ...page, transfers: page.transfers.filter(item => !ambiguous.has(item.hash.toLowerCase()) || verified.has(item.id)) }
}

export async function walletCashActivity(owner: string, cursor: string, credentials: BinanceCredentials): Promise<WalletActivityPage> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 18_000)
  const aborted = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('activity_unavailable')), { once: true }))
  try { return await Promise.race([readCashActivity(owner, cursor, credentials, controller.signal), aborted]) }
  finally { clearTimeout(timer) }
}

export function parsePurchaseBasis(symbol: string, value: unknown, timestamp: unknown): PurchaseBasis | null {
  const row = object(value), at = Number(timestamp)
  const number = (value: unknown) => typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN
  const bought = number(row?.buyAmount), sold = number(row?.sellAmount), held = number(row?.tokenBalanceAmount)
  const spend = number(row?.buyTxVolume), proceeds = number(row?.sellTxVolume), realized = number(row?.realizedPnlUsd)
  if (!row || row.isPnlSupported !== true || ![bought, sold, held, spend, proceeds, realized, at].every(Number.isFinite)
    || bought <= 0 || sold < 0 || held <= 0 || spend <= 0 || proceeds < 0 || Math.abs(bought - sold - held) > Math.max(bought, held) * 1e-9
    || at < Date.now() - 15 * 60_000 || at > Date.now() + 120_000) return null
  // Realized gain = sale proceeds - cost of the sold units. Therefore the
  // remaining purchase cost = total buy spend - sale proceeds + realized gain.
  // Never treat cumulative realized profit as the current holding's gain.
  const cost = spend - proceeds + realized
  return cost > 0 && Number.isFinite(cost) ? { symbol, quantity: row.tokenBalanceAmount as string, cost, asOf: new Date(at).toISOString() } : null
}

async function providerPurchaseBasis(owner: string, symbols: string[], credentials: BinanceCredentials) {
  const costs: PurchaseBasis[] = []
  for (let start = 0; start < symbols.length; start += 3) {
    const values = await Promise.all(symbols.slice(start, start + 3).map(async symbol => {
      try {
        const result = await signedBinanceRequest('GET', '/api/v1/dex/market/portfolio/token/latest-pnl', {
          binanceChainId: '56', walletAddress: owner.toLowerCase(), tokenContractAddress: assets[symbol].toLowerCase(),
        }, credentials)
        return parsePurchaseBasis(symbol, result.data, result.timestamp)
      } catch { return null }
    }))
    costs.push(...values.filter((value): value is PurchaseBasis => value !== null))
  }
  return costs
}

export async function walletPurchaseBasis(owner: string, symbols: string[], credentials?: BinanceCredentials) {
  if (!isAddress(owner) || !symbols.length || symbols.length > 6 || symbols.some(symbol => !isSymbol(symbol))) throw new Error('invalid_purchase_request')
  // Independent reads avoid making wallet recovery wait for an unsupported or
  // failed analytics response. Receipt-verified wallet fills take precedence.
  const [provider, recovered] = await Promise.all([credentials ? providerPurchaseBasis(owner, symbols, credentials) : [], recoverWalletPurchaseBasis(owner, symbols as Symbol[])])
  return [...new Map([...provider, ...recovered].map(cost => [cost.symbol, cost])).values()]
}

export async function handleWalletActivity(request: Request, env: ApiEnv, userId: string) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (request.headers.get('Origin') !== new URL(request.url).origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return json({ error: 'invalid_origin' }, 403)
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'invalid_request' }, 400)
  try {
    const reader = request.body?.getReader()
    if (!reader) return json({ error: 'invalid_request' }, 400)
    const chunks: Uint8Array[] = []; let size = 0
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength
      if (size > 1024) { await reader.cancel(); return json({ error: 'request_too_large' }, 413) }; chunks.push(part.value) }
    } finally { reader.releaseLock() }
    const bytes = new Uint8Array(size); let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    let body: Record<string, unknown> | null
    try { body = object(JSON.parse(new TextDecoder().decode(bytes))) } catch { return json({ error: 'invalid_request' }, 400) }
    if (!body || typeof body.walletAddress !== 'string' || !isAddress(body.walletAddress) || !validCursor(body.cursor ?? '')) return json({ error: 'invalid_request' }, 400)
    const costRequest = new URL(request.url).pathname === '/api/wallet/cost-basis'
    if (costRequest && (!Array.isArray(body.symbols) || !body.symbols.length || body.symbols.length > 6 || body.symbols.some(symbol => typeof symbol !== 'string' || !isSymbol(symbol)))) return json({ error: 'invalid_request' }, 400)
    if (!await verifyWalletIdentity(request.headers.get('privy-id-token'), env, userId, body.walletAddress)) return json({ error: 'wallet_not_verified' }, 403)
    const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName(userId))
    const allowed = await stub.fetch(new Request('https://account.internal/trade-status-rate', { method: 'POST', headers: { 'X-Privy-DID': userId } }))
    if (!allowed.ok) return json({ error: 'activity_unavailable' }, allowed.status)
    const credentials = env.BINANCE_WEB3_API_KEY && env.BINANCE_WEB3_SECRET_KEY ? { apiKey: env.BINANCE_WEB3_API_KEY, secretKey: env.BINANCE_WEB3_SECRET_KEY } : undefined
    if (costRequest) return json({ status: 'ready', costs: await walletPurchaseBasis(body.walletAddress, [...new Set(body.symbols as string[])], credentials) })
    const [cash, trades] = await Promise.allSettled([
      credentials ? walletCashActivity(body.walletAddress, String(body.cursor ?? ''), credentials) : Promise.reject(new Error('not_configured')),
      recoverWalletTrades(body.walletAddress),
    ])
    return json({ status: 'ready', ...(cash.status === 'fulfilled' ? cash.value : { transfers: [], cursor: null }),
      trades: trades.status === 'fulfilled' ? trades.value : [], partial: cash.status === 'rejected' || trades.status === 'rejected' })
  } catch (error) { return json({ status: 'unavailable', ...binanceFailure(error) }, 503) }
}
