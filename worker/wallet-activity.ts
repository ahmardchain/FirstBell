import { formatUnits, isAddress } from 'viem'
import { BSC_USDT } from '../lib/funding.ts'
import { COW_RELAYER, COW_SETTLEMENT } from '../lib/agent-trading.ts'
import type { CashTransfer, PurchaseBasis, WalletActivityPage } from '../lib/portfolio-performance.ts'
import { assets, isSymbol } from './market.ts'
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
    if (!row || String(row.binanceChainId) !== '56' || String(row.itype) !== '2'
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
    if (walletParties.some(party => !rawAmount(party!.amount))) continue
    const amount = walletParties.reduce((sum, party) => sum + BigInt(party!.amount as string), 0n)
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

export async function walletCashActivity(owner: string, cursor: string, credentials: BinanceCredentials): Promise<WalletActivityPage> {
  if (!isAddress(owner) || !validCursor(cursor)) throw new Error('invalid_wallet_activity')
  const result = await signedBinanceRequest('GET', '/api/v1/dex/post-transaction/transactions-by-address', {
    address: owner.toLowerCase(), chains: '56', tokenContractAddress: BSC_USDT.address, limit: '100', ...(cursor ? { cursor } : {}),
  }, credentials)
  return parseCashActivity(result.data, owner)
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

export async function walletPurchaseBasis(owner: string, symbols: string[], credentials: BinanceCredentials) {
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
    if (!env.BINANCE_WEB3_API_KEY || !env.BINANCE_WEB3_SECRET_KEY) return json({ error: 'not_configured' }, 503)
    const stub = env.ACCOUNTS.get(env.ACCOUNTS.idFromName(userId))
    const allowed = await stub.fetch(new Request('https://account.internal/trade-status-rate', { method: 'POST', headers: { 'X-Privy-DID': userId } }))
    if (!allowed.ok) return json({ error: 'activity_unavailable' }, allowed.status)
    if (costRequest) return json({ status: 'ready', costs: await walletPurchaseBasis(body.walletAddress, [...new Set(body.symbols as string[])], { apiKey: env.BINANCE_WEB3_API_KEY, secretKey: env.BINANCE_WEB3_SECRET_KEY }) })
    return json({ status: 'ready', ...await walletCashActivity(body.walletAddress, String(body.cursor ?? ''), { apiKey: env.BINANCE_WEB3_API_KEY, secretKey: env.BINANCE_WEB3_SECRET_KEY }) })
  } catch (error) { return json({ status: 'unavailable', ...binanceFailure(error) }, 503) }
}
