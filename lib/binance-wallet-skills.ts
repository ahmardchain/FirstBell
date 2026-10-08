// HTTP contracts from Binance's published Wallet Skills. The skills are
// Markdown tool specifications, not a browser SDK or an LLM implementation.
export const walletSkills = {
  stocks: { name: 'binance-tokenized-securities-info', version: '1.1', blob: '1c960eb9eb90ddffc85e13112daa0c291c7fea1e',
    source: 'https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-tokenized-securities-info/SKILL.md' },
  audit: { name: 'query-token-audit', version: '1.4', blob: 'fd45c80765df00c8dfe5155055a7d23c2f3b03c5',
    source: 'https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/query-token-audit/SKILL.md' },
  execution: { name: 'binance-agentic-wallet', version: '1.12.0', cliVersion: '1.10.0', blob: '33c68dd84f47f5a117c7a31e062d671bee40bfb4',
    source: 'https://github.com/binance/binance-skills-hub/blob/main/skills/binance-web3/binance-agentic-wallet/SKILL.md' },
} as const

export type SkillTrace = { skill: string; version: string; operation: string; status: 'ready' | 'unavailable' | 'unsupported'; durationMs: number }
export type SkillMarket = { open: boolean | null; session: string | null; reason: string | null; detail: string | null; nextOpen: number | null }
export type SkillStock = {
  symbol: string; ticker: string; chainId: 56; address: string; multiplier: number | null;
  tokenPrice: number | null; perSharePrice: number | null; stockPrice: number | null; premiumPct: number | null;
  change24h: number | null; pe: number | null; dividendYield: number | null;
  market: SkillMarket; attestation: string | null;
}
export type SkillAudit = {
  available: boolean; level: number | null; label: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  reason?: 'unsupported' | 'no_result' | 'provider_error' | 'invalid_response';
  buyTax: number | null; sellTax: number | null; verified: boolean | null;
  risks: { title: string; description: string; critical: boolean }[];
}
export type SkillReport = { source: 'binance-wallet-skills'; checkedAt: string; stock: SkillStock; audit: SkillAudit; trace: SkillTrace[] }
export class WalletSkillError extends Error {
  constructor(reason: string) { super(reason); this.name = 'WalletSkillError' }
}
export const auditRiskLabel = (level: number) => level <= 1 ? 'LOW' : level <= 3 ? 'MEDIUM' : 'HIGH'
export function validateSkillReport(value: unknown, symbol: string, address: string): SkillReport {
  const r = value as SkillReport
  if (!r || r.source !== 'binance-wallet-skills' || r.stock?.symbol !== symbol || r.stock.chainId !== 56
    || typeof r.stock.address !== 'string' || r.stock.address.toLowerCase() !== address.toLowerCase()
    || !Number.isFinite(Date.parse(r.checkedAt)) || Date.parse(r.checkedAt) > Date.now() + 120_000
    || typeof r.stock.ticker !== 'string' || !/^[A-Z0-9.-]{1,20}$/.test(r.stock.ticker)
    || !r.stock.market || ![true, false, null].includes(r.stock.market.open)
    || [r.stock.market.session, r.stock.market.reason, r.stock.market.detail].some(v => v !== null && (typeof v !== 'string' || v.length > 180))
    || r.stock.market.nextOpen !== null && (typeof r.stock.market.nextOpen !== 'number' || !Number.isFinite(r.stock.market.nextOpen) || r.stock.market.nextOpen <= 0 || r.stock.market.nextOpen > 8_640_000_000_000_000)
    || r.stock.attestation !== null && (typeof r.stock.attestation !== 'string' || !/^https:\/\/bin\.bnbstatic\.com\/images\/web3-data\/public\/token\/ondo\/pdf\/[a-zA-Z0-9._-]+\.pdf$/.test(r.stock.attestation))
    || !r.audit || typeof r.audit.available !== 'boolean' || ![true, false, null].includes(r.audit.verified)
    || r.audit.reason !== undefined && (!['unsupported', 'no_result', 'provider_error', 'invalid_response'].includes(r.audit.reason) || r.audit.available)
    || !Array.isArray(r.audit.risks) || r.audit.risks.length > 12 || r.audit.risks.some(x => !x || typeof x.title !== 'string' || x.title.length > 120 || typeof x.description !== 'string' || x.description.length > 220 || typeof x.critical !== 'boolean')
    || !Array.isArray(r.trace) || r.trace.length > 8 || r.trace.some(x => !x || [x.skill, x.version, x.operation].some(v => typeof v !== 'string' || v.length > 80) || !['ready', 'unavailable', 'unsupported'].includes(x.status) || !Number.isFinite(x.durationMs) || x.durationMs < 0)
    || [r.stock.tokenPrice, r.stock.perSharePrice, r.stock.stockPrice, r.stock.multiplier, r.stock.premiumPct, r.stock.change24h, r.stock.pe, r.stock.dividendYield, r.audit.buyTax, r.audit.sellTax].some(n => n !== null && (typeof n !== 'number' || !Number.isFinite(n)))
    || !r.audit.available && (r.audit.level !== null || r.audit.label !== null || r.audit.buyTax !== null || r.audit.sellTax !== null || r.audit.verified !== null || r.audit.risks.length > 0)
    || r.audit.available && (!Number.isInteger(r.audit.level) || r.audit.level! < 0 || r.audit.level! > 5 || r.audit.label !== auditRiskLabel(r.audit.level!)))
    throw new WalletSkillError('skill_provider_unavailable')
  return r
}
export const skillRiskFingerprint = (report: SkillReport) => JSON.stringify({ audit: report.audit, market: { open: report.stock.market.open, reason: report.stock.market.reason, detail: report.stock.market.detail } })
export const requiresAuditAcknowledgement = (report?: SkillReport) => report?.audit.available === false && report.audit.reason === 'unsupported'
export function skillTradeBlock(report: SkillReport, options: { allowUnsupportedAudit?: boolean } = {}): string | null {
  if (report.stock.market.open === null) return 'skill_checks_unavailable'
  if (report.audit.level === 5) return 'skill_security_blocked'
  if (report.stock.market.open === false || ['ASSET_PAUSED', 'ASSET_LIMITED', 'UNSUPPORTED', 'MARKET_PAUSED', 'MARKET_MAINTENANCE'].includes(report.stock.market.reason ?? '')) return 'skill_asset_unavailable'
  if (!report.audit.available && !(options.allowUnsupportedAudit && requiresAuditAcknowledgement(report))) return 'skill_checks_unavailable'
  return null
}
