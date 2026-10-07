import { StockCard } from '@/components/ui/stock-card'
import { assetLogo, type CatalogAsset } from '../lib/asset-catalog'
import { performanceFromBasis, positionPerformance, type PurchaseBasis } from '../lib/portfolio-performance'
import type { AgentOrder } from '../lib/agent-trading'
import type { TokenPrice } from './market-api'
import { displayQuantity } from './wallet-balances'

export function PortfolioPosition({ asset, quantity, market, change7d, orders, basis, hidden, language, canSell, onInspect, onSell }: {
  asset: CatalogAsset; quantity: string; market?: TokenPrice; change7d?: number | null; orders: AgentOrder[]; hidden: boolean;
  language: 'en' | 'zh'; canSell: boolean; onInspect: () => void; onSell: () => void; basis?: PurchaseBasis
}) {
  const zh = language === 'zh'
  const price = market?.priceUsd ?? null
  const performance = positionPerformance(asset.symbol, quantity, price, orders) ?? performanceFromBasis(basis, quantity, price)
  const value = price !== null ? Number(quantity) * price : null
  const usd = (amount: number) => new Intl.NumberFormat(zh ? 'zh-CN' : 'en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
  const unavailable = zh ? '暂无数据' : 'Unavailable'
  const money = (amount: number | null) => hidden ? '••••••' : amount !== null && Number.isFinite(amount) ? usd(amount) : market === undefined ? zh ? '加载中…' : 'Loading…' : unavailable
  return <StockCard className="app-stock-card portfolio-position-card max-w-none" logoSrc={assetLogo(asset)} logoClassName={`brand-mark brand-mark--${asset.mark}`}
    ticker={asset.symbol} name={asset.company} price={price} change={market?.change24hPct ?? null} changeLabel="24h"
    loading={market === undefined} locale={zh ? 'zh-CN' : 'en-US'} buyLabel={zh ? '卖出' : 'Sell'} buyDisabled={!canSell}
    inspectLabel={zh ? '查看资产' : 'Open asset file'} unavailableLabel={zh ? '价格暂不可用' : 'Price unavailable'} changeUnavailableLabel={unavailable}
    onInspect={onInspect} onBuy={onSell}>
    <div className="portfolio-position-summary">
      <div><span>{zh ? '持仓' : 'Holding'}</span><strong title={hidden ? undefined : quantity}>{hidden ? '••••' : `${displayQuantity(quantity, 8)} ${asset.symbol}`}</strong></div>
      <div><span>{zh ? '持仓价值' : 'Position value'}</span><strong>{money(value)}</strong></div>
    </div>
    <div className="portfolio-position-performance">
      <div><span>{zh ? '买入以来' : 'Since purchase'}</span>{hidden ? <strong>••••••</strong> : performance ? <strong data-direction={performance.gain >= 0 ? 'up' : 'down'}>
        {performance.gain >= 0 ? '+' : '−'}{usd(Math.abs(performance.gain))}<small>{performance.gainPct >= 0 ? '+' : '−'}{Math.abs(performance.gainPct).toFixed(2)}%</small>
      </strong> : <strong className="portfolio-metric-unavailable">{zh ? '买入价格暂不可用' : 'Purchase price unavailable'}</strong>}</div>
      <div><span>{zh ? '平均买入价' : 'Avg. purchase price'}</span><strong>{hidden ? '••••••' : performance ? usd(performance.averagePrice) : unavailable}</strong></div>
      <div><span>7d</span><Percent value={change7d} unavailable={unavailable} /></div>
    </div>
  </StockCard>
}
function Percent({ value, unavailable }: { value: number | null | undefined; unavailable: string }) {
  if (value === undefined) return <strong className="portfolio-metric-unavailable">…</strong>
  if (value === null || !Number.isFinite(value)) return <strong className="portfolio-metric-unavailable">{unavailable}</strong>
  return <strong data-direction={value >= 0 ? 'up' : 'down'}>{value >= 0 ? '+' : '−'}{Math.abs(value).toFixed(2)}%</strong>
}
