import { signedPercent, text, localeFor, type Language } from '../lib/i18n'
import { StockCard } from '@/components/ui/stock-card'
import { assetLogo, type CatalogAsset } from '../lib/asset-catalog'
import { performanceFromBasis, positionPerformance, type PurchaseBasis } from '../lib/portfolio-performance'
import type { AgentOrder } from '../lib/agent-trading'
import type { TokenPrice } from './market-api'
import { displayQuantity } from './wallet-balances'

export function PortfolioPosition({ asset, quantity, market, change7d, orders, basis, hidden, language, canSell, onInspect, onSell }: {
  asset: CatalogAsset; quantity: string; market?: TokenPrice; change7d?: number | null; orders: AgentOrder[]; hidden: boolean;
  language: Language; canSell: boolean; onInspect: () => void; onSell: () => void; basis?: PurchaseBasis
}) {
  const price = market?.priceUsd ?? null
  const performance = positionPerformance(asset.symbol, quantity, price, orders) ?? performanceFromBasis(basis, quantity, price)
  const value = price !== null ? Number(quantity) * price : null
  const usd = (amount: number, maximumFractionDigits = 2) => new Intl.NumberFormat(localeFor(language), { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits }).format(amount)
  const unavailable = text(language, 'Unavailable', '暂无数据')
  const purchaseUnavailable = text(language, 'Purchase price unavailable', '买入价格暂不可用')
  const marketPrice = price !== null ? usd(price) : market === undefined ? text(language, 'Loading…', '加载中…') : unavailable
  return <StockCard className="app-stock-card portfolio-position-card max-w-none" logoSrc={assetLogo(asset)} logoClassName={`brand-mark brand-mark--${asset.mark}`}
    ticker={asset.symbol} name={asset.company} price={hidden ? null : value} change={hidden ? null : performance?.gainPct ?? null}
    priceMaximumFractionDigits={value !== null && value < 10 ? 4 : 2}
    priceLabel={text(language, 'Position value', '持仓价值')} changeLabel={text(language, 'Since purchase', '买入以来')}
    loading={!hidden && market === undefined} locale={localeFor(language)} buyLabel={text(language, 'Sell', '卖出')} buyDisabled={!canSell}
    inspectLabel={text(language, 'Open asset file', '查看资产')} unavailableLabel={hidden ? '••••••' : text(language, 'Value unavailable', '估值暂不可用')}
    changeUnavailableLabel={hidden ? '••••' : purchaseUnavailable}
    onInspect={onInspect} onBuy={onSell}>
    <div className="portfolio-position-summary">
      <div><span>{text(language, 'Holding', '持仓')}</span><strong title={hidden ? undefined : quantity}>{hidden ? '••••' : `${displayQuantity(quantity, 8, localeFor(language))} ${asset.symbol}`}</strong>
        <small>{text(language, 'Token price', '代币价格')} · {marketPrice}</small></div>
      <div><span>{text(language, 'Your gain / loss', '持仓盈亏')}</span>{hidden ? <strong>••••••</strong> : performance ? <strong data-direction={performance.gain >= 0 ? 'up' : 'down'}>
        {performance.gain >= 0 ? '+' : '−'}{usd(Math.abs(performance.gain), performance.gain !== 0 && Math.abs(performance.gain) < .01 ? 4 : 2)}
      </strong> : <strong className="portfolio-metric-unavailable">{purchaseUnavailable}</strong>}</div>
    </div>
    <div className="portfolio-position-performance">
      <div><span>{text(language, 'Avg. purchase price', '平均买入价')}</span><strong>{hidden ? '••••••' : performance ? usd(performance.averagePrice) : unavailable}</strong></div>
      <div><span>{text(language, 'Market 24h', '市场 24h')}</span><Percent value={market?.change24hPct} unavailable={unavailable} language={language} /></div>
      <div><span>{text(language, 'Market 7d', '市场 7d')}</span><Percent value={change7d} unavailable={unavailable} language={language} /></div>
    </div>
  </StockCard>
}
function Percent({ value, unavailable, language }: { value: number | null | undefined; unavailable: string; language: Language }) {
  if (value === undefined) return <strong className="portfolio-metric-unavailable">…</strong>
  if (value === null || !Number.isFinite(value)) return <strong className="portfolio-metric-unavailable">{unavailable}</strong>
  return <strong data-direction={value >= 0 ? 'up' : 'down'}>{signedPercent(value, language)}</strong>
}
