import { assetCatalog } from '../lib/asset-catalog.ts'
import { walletSkills, WalletSkillError, skillTradeBlock, auditRiskLabel, type SkillAudit, type SkillMarket, type SkillReport, type SkillTrace } from '../lib/binance-wallet-skills.ts'

const object = (v: unknown): Record<string, unknown> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
const number = (v: unknown): number | null => (typeof v === 'number' || typeof v === 'string' && /^-?\d+(?:\.\d+)?$/.test(v)) && Number.isFinite(Number(v)) ? Number(v) : null
const positive = (v: unknown) => { const n = number(v); return n !== null && n > 0 ? n : null }
const text = (v: unknown, limit = 180): string | null => typeof v === 'string' && v.length ? v.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, limit) : null
const prefix = 'https://www.binance.com/bapi/defi/'
const stockPath = 'v1/public/wallet-direct/buw/wallet/market/token/rwa/'
const paths = {
  resolve: prefix + stockPath + 'stock/detail/list/ai',
  status: prefix + stockPath + 'asset/market/status/ai',
  meta: prefix + stockPath + 'meta/ai',
  dynamic: prefix + 'v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai',
  audit: 'https://web3.binance.com/bapi/defi/v1/public/wallet-direct/security/token/audit',
} as const

async function request(operation: keyof typeof paths, params: Record<string, string>, trace: SkillTrace[], signal?: AbortSignal): Promise<unknown> {
  const spec = operation === 'audit' ? walletSkills.audit : walletSkills.stocks
  const start = performance.now()
  const step: SkillTrace = { skill: spec.name, version: spec.version, operation, status: 'unavailable', durationMs: 0 }
  trace.push(step)
  const timeout = AbortSignal.timeout(8_000)
  const url = new URL(paths[operation])
  if (operation !== 'audit') Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  try {
    const response = await fetch(url, {
      method: operation === 'audit' ? 'POST' : 'GET', redirect: 'error',
      headers: { Accept: 'application/json', 'Accept-Encoding': 'identity', 'User-Agent': `binance-web3/${spec.version} (Skill)`,
        ...(operation === 'audit' ? { 'Content-Type': 'application/json', source: 'agent' } : {}) },
      ...(operation === 'audit' ? { body: JSON.stringify(params) } : {}),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (response.status === 429) throw new WalletSkillError('rate_limited')
    if (!response.ok || Number(response.headers.get('content-length') ?? 0) > 1_000_000) throw new WalletSkillError('skill_provider_unavailable')
    // Bound streamed bodies as well as Content-Length. Never forward HTML,
    // headers, unknown provider fields or credential-like values to the UI.
    const reader = response.body?.getReader()
    if (!reader) throw new WalletSkillError('skill_provider_unavailable')
    let bytes = 0, body = ''
    const decoder = new TextDecoder()
    try {
      while (true) {
        const part = await reader.read()
        if (part.done) break
        bytes += part.value.byteLength
        if (bytes > 1_000_000) { await reader.cancel(); throw new WalletSkillError('skill_provider_unavailable') }
        body += decoder.decode(part.value, { stream: true })
      }
      body += decoder.decode()
    } finally { reader.releaseLock() }
    const parsed = object(JSON.parse(body))
    if (parsed?.code !== '000000' || parsed.success !== true || parsed.data === undefined) throw new WalletSkillError('skill_provider_unavailable')
    step.status = 'ready'
    return parsed.data
  } catch (error) {
    if (signal?.aborted) throw signal.reason
    throw error instanceof WalletSkillError ? error : new WalletSkillError('skill_provider_unavailable')
  } finally { step.durationMs = Math.round(performance.now() - start) }
}

function market(value: unknown): SkillMarket {
  const v = object(value)
  return { open: typeof v?.openState === 'boolean' ? v.openState : null, session: text(v?.marketStatus, 30),
    reason: text(v?.reasonCode, 60), detail: text(v?.reasonMsg), nextOpen: positive(v?.nextOpenTime) }
}
export function parseSkillAudit(value: unknown, requestId: string): SkillAudit {
  const v = object(value), extra = object(v?.extraInfo), level = number(v?.riskLevel)
  const available = v?.requestId === requestId && v.hasResult === true && v.isSupported === true && level !== null && Number.isInteger(level) && level >= 0 && level <= 5
    && v.riskLevelEnum === auditRiskLabel(level)
  if (!available) return { available: false, level: null, label: null, buyTax: null, sellTax: null, verified: null, risks: [] }
  const risks: SkillAudit['risks'] = []
  for (const category of Array.isArray(v.riskItems) ? v.riskItems.slice(0, 30) : []) {
    const details = object(category)?.details
    for (const item of Array.isArray(details) ? details.slice(0, 30) : []) {
      const d = object(item)
      if (d?.isHit === true && risks.length < 12) risks.push({ title: text(d.title, 120) ?? 'Risk', description: text(d.description, 220) ?? '', critical: d.riskType === 'RISK' })
    }
  }
  const tax = (value: unknown) => { const n = number(value); return n !== null && n >= 0 && n <= 100 ? n : null }
  return { available: true, level, label: v.riskLevelEnum as SkillAudit['label'], buyTax: tax(extra?.buyTax), sellTax: tax(extra?.sellTax),
    verified: typeof extra?.isVerified === 'boolean' ? extra.isVerified : null, risks }
}

// Both web and MCP agents invoke these exact published skill contracts. A
// catalog name is never enough: verify its provider, chain AND full address.
export async function researchStock(symbol: string, signal?: AbortSignal): Promise<SkillReport> {
  const asset = assetCatalog.find(a => a.symbol === symbol)
  if (!asset) throw new WalletSkillError('skill_unknown_asset')
  const trace: SkillTrace[] = []
  const list = await request('resolve', { type: '1' }, trace, signal)
  const found = (Array.isArray(list) ? list : []).map(object).find(r => r?.chainId === '56' && r.type === 1 && r.symbol === symbol &&
    typeof r.contractAddress === 'string' && r.contractAddress.toLowerCase() === asset.address.toLowerCase())
  if (!found) throw new WalletSkillError('skill_asset_not_verified')
  const params = { chainId: '56', contractAddress: asset.address }
  const requestId = crypto.randomUUID()
  const parts = await Promise.allSettled([
    request('dynamic', params, trace, signal), request('status', params, trace, signal), request('meta', params, trace, signal),
    request('audit', { binanceChainId: '56', contractAddress: asset.address, requestId }, trace, signal),
  ])
  if (signal?.aborted) throw signal.reason
  const data = parts.map(p => p.status === 'fulfilled' ? object(p.value) : null)
  const [dynamic, status, meta, audit] = data
  // Mismatched identity invalidates the whole result; missing data stays null.
  for (const v of [dynamic, meta]) if (v && v.symbol !== symbol) throw new WalletSkillError('skill_asset_not_verified')
  const token = object(dynamic?.tokenInfo), stock = object(dynamic?.stockInfo)
  const tokenPrice = positive(token?.price), multiplier = positive(token?.sharesMultiplier) ?? positive(found.multiplier)
  const perSharePrice = tokenPrice !== null && multiplier !== null ? positive(tokenPrice / multiplier) : null
  const stockPrice = positive(stock?.price)
  const premium = perSharePrice !== null && stockPrice !== null ? number((perSharePrice / stockPrice - 1) * 100) : null
  const attestationPath = text(meta?.dailyAttestationReports, 400)
  const attestation = attestationPath && /^\/images\/web3-data\/public\/token\/ondo\/pdf\/[a-zA-Z0-9._-]+\.pdf$/.test(attestationPath)
    ? `https://bin.bnbstatic.com${attestationPath}` : null
  return { source: 'binance-wallet-skills', checkedAt: new Date().toISOString(),
    stock: { symbol, ticker: typeof found.ticker === 'string' && /^[A-Z0-9.-]{1,20}$/.test(found.ticker) ? found.ticker : symbol.replace(/on$/, ''),
      chainId: 56, address: asset.address, multiplier, tokenPrice, perSharePrice, stockPrice,
      premiumPct: premium,
      change24h: number(token?.priceChangePct24h), pe: number(stock?.priceToEarnings), dividendYield: number(stock?.dividendYield),
      market: market(status), attestation }, audit: parseSkillAudit(audit, requestId), trace }
}
export async function checkSkillTrade(symbol: string, signal?: AbortSignal): Promise<SkillReport> {
  const report = await researchStock(symbol, signal)
  const block = skillTradeBlock(report)
  if (block) throw new WalletSkillError(block)
  return report
}

// Public research is coalesced and briefly cached to bound upstream work.
// Trade preparation and dispatch always call the uncached function above.
const publicResearch = new Map<string, { result: Promise<SkillReport>; expires: number; pending: boolean }>()
export async function researchStockPublic(symbol: string, signal?: AbortSignal): Promise<SkillReport> {
  if (!assetCatalog.some(a => a.symbol === symbol)) throw new WalletSkillError('skill_unknown_asset')
  if (signal?.aborted) throw signal.reason
  for (const [key, entry] of publicResearch) if (!entry.pending && entry.expires <= Date.now()) publicResearch.delete(key)
  let entry = publicResearch.get(symbol)
  if (!entry) {
    if ([...publicResearch.values()].filter(v => v.pending).length >= 8) throw new WalletSkillError('rate_limited')
    entry = { result: researchStock(symbol, AbortSignal.timeout(20_000)), expires: Infinity, pending: true }
    const current = entry
    // Both handlers resolve, so this housekeeping never creates an unhandled rejection.
    void current.result.then(() => { current.pending = false; current.expires = Date.now() + 15_000 }, () => { current.pending = false; current.expires = Date.now() + 3_000 })
    publicResearch.set(symbol, current)
  }
  if (!signal) return entry.result
  const result = entry.result
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    void result.then(value => { signal.removeEventListener('abort', abort); resolve(value) }, error => { signal.removeEventListener('abort', abort); reject(error) })
  })
}
