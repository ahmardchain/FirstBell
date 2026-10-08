import { ExternalLink } from 'lucide-react'
import { type SkillReport, walletSkills } from '../lib/binance-wallet-skills.ts'
import { walletSkillsCopy } from '../lib/wallet-skills-copy.ts'
import { localeFor, type Language } from '../lib/i18n.ts'
import { agentHistoryCopy } from '../lib/agent-history-copy.ts'

export function WalletSkillReport({ report, language, compact = false, historical = false, onRefresh, busy = false }: {
  report: SkillReport; language: Language; compact?: boolean; historical?: boolean; onRefresh?: () => void; busy?: boolean
}) {
  const t = walletSkillsCopy[language], { stock, audit } = report, locale = localeFor(language)
  const historyText = agentHistoryCopy[language]
  const format = (n: number | null, suffix = '') => n === null ? t.unknown : `${n.toLocaleString(locale, { maximumFractionDigits: 6 })}${suffix}`
  const dollars = (n: number | null) => n === null ? t.unknown : n.toLocaleString(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: n < 10 ? 4 : 2 })
  const state = stock.market.open === null ? t.unknown : stock.market.open ? t.open : t.closed
  return <section className={`agent-skill-report${compact ? ' compact' : ''}`} aria-label={`${t.research}: ${stock.symbol}`}>
    <div className="agent-skill-heading"><strong>{stock.symbol}</strong><a href={walletSkills.stocks.source} target="_blank" rel="noreferrer">Binance Wallet Skills<ExternalLink size={12} /></a></div>
    {historical && <p>{historyText.savedResearch}</p>}
    {!compact && <dl>
      <div><dt>{t.tokenPrice}</dt><dd>{dollars(stock.tokenPrice)}</dd></div><div><dt>{t.multiplier}</dt><dd>{format(stock.multiplier)}</dd></div>
      <div><dt>{t.sharePrice}</dt><dd>{dollars(stock.perSharePrice)}</dd></div><div><dt>{t.reference}</dt><dd>{dollars(stock.stockPrice)}</dd></div>
      <div><dt>{t.premium}</dt><dd>{stock.premiumPct === null ? t.unknown : `${stock.premiumPct > 0 ? '+' : ''}${format(stock.premiumPct, '%')}`}</dd></div>
      <div><dt>{t.change}</dt><dd>{format(stock.change24h, '%')}</dd></div>{stock.pe !== null && <div><dt>{t.pe}</dt><dd>{format(stock.pe)}</dd></div>}{stock.dividendYield !== null && <div><dt>{t.dividend}</dt><dd>{format(stock.dividendYield, '%')}</dd></div>}
    </dl>}
    <dl><div><dt>{t.status}</dt><dd>{state}</dd></div>{stock.market.nextOpen !== null && !stock.market.open && <div><dt>{t.nextOpen}</dt><dd>{new Date(stock.market.nextOpen).toLocaleString(locale)}</dd></div>}
      <div><dt>{t.risk}</dt><dd>{audit.available ? `${audit.label} · ${audit.level}/5` : audit.reason === 'unsupported' ? t.notSupported : t.unknown}</dd></div>
      {audit.available && <><div><dt>{t.buyTax}</dt><dd>{format(audit.buyTax, '%')}</dd></div><div><dt>{t.sellTax}</dt><dd>{format(audit.sellTax, '%')}</dd></div><div><dt>{t.verified}</dt><dd>{audit.verified === null ? t.unknown : audit.verified ? t.yes : t.no}</dd></div></>}
    </dl>
    {stock.market.reason && <p className="agent-skill-reason">{stock.market.reason}{stock.market.detail ? ` · ${stock.market.detail}` : ''}</p>}
    {!audit.available && <p>{audit.reason === 'unsupported' ? t.auditUnsupported : audit.reason === 'no_result' ? t.auditNoResult : t.auditMissing}</p>}
    {audit.risks.length > 0 && <ul>{audit.risks.map((risk, i) => <li key={i}><strong>{risk.title}</strong>{risk.description && <span>{risk.description}</span>}</li>)}</ul>}
    <a className="agent-skill-contract" href={`https://bscscan.com/token/${stock.address}`} target="_blank" rel="noreferrer"><span>{t.contract}</span>{stock.address}</a>
    <p>{t.auditNote}</p><small>{t.checked} · {new Date(report.checkedAt).toLocaleString(locale)}</small>
    <details><summary>{t.trace}</summary>{report.trace.map(step => <div key={step.operation}><span>{step.skill} v{step.version} · {step.operation}</span><small>{step.status === 'ready' ? '✓' : step.status === 'unsupported' ? t.notSupported : t.unknown} · {step.durationMs} ms</small></div>)}</details>
    {stock.attestation && <a href={stock.attestation} target="_blank" rel="noreferrer">{t.attestation}<ExternalLink size={12} /></a>}
    {onRefresh && <button type="button" className="agent-inline-action" disabled={busy} onClick={onRefresh}>{historyText.refreshed}</button>}
  </section>
}
