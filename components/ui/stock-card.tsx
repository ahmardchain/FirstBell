import * as React from 'react'
import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { tokenLogoError } from '@/lib/asset-catalog'
import './stock-card.css'

export interface StockCardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  logoSrc: string
  logoClassName?: string
  ticker: string
  name: string
  /** A verified price or position value in USD; null means the feed is unavailable. */
  price: number | null
  change: number | null
  priceLabel?: string
  changeLabel?: string
  buyDisabled?: boolean
  children?: React.ReactNode
  onBuy: (ticker: string) => void
  onInspect?: (ticker: string) => void
  actions?: React.ReactNode
  loading?: boolean
  locale?: string
  buyLabel?: string
  inspectLabel?: string
  loadingLabel?: string
  unavailableLabel?: string
  changeUnavailableLabel?: string
}

const StockCard = React.forwardRef<HTMLDivElement, StockCardProps>(
  ({ className, logoSrc, logoClassName, ticker, name, price, change, onBuy, onInspect,
    actions, children, priceLabel, changeLabel, buyDisabled, loading = false, locale = 'en-US', buyLabel = 'Buy', inspectLabel = 'Open asset file',
    loadingLabel = 'Loading…', unavailableLabel = 'Price unavailable', changeUnavailableLabel = 'No data', ...props }, ref) => {
    const reduceMotion = useReducedMotion()
    const hasPrice = typeof price === 'number' && Number.isFinite(price) && price > 0
    const hasChange = hasPrice && typeof change === 'number' && Number.isFinite(change)
    const isPositiveChange = hasChange && change >= 0
    const formattedPrice = hasPrice ? new Intl.NumberFormat(locale, {
      style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(price) : unavailableLabel
    const identity = <>
      <img src={logoSrc} alt={`${name} logo`} width={40} height={40} loading="lazy" onError={tokenLogoError}
        className={cn('stock-card-logo h-10 w-10 shrink-0 object-contain', logoClassName)} />
      <span className="stock-card-name min-w-0">
        <span className="block truncate text-lg font-bold text-foreground">{ticker}</span>
        <span className="block truncate text-sm text-muted-foreground">{name}</span>
      </span>
    </>

    return <motion.div ref={ref} {...props}
      aria-busy={loading}
      whileHover={reduceMotion ? undefined : { scale: 1.025, transition: { duration: .2 } }}
      className={cn('stock-card w-full max-w-md rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-sm transition-shadow hover:shadow-md', className)}>
      <div className="stock-card-content flex items-center justify-between gap-4">
        {onInspect ? <button type="button" className="stock-card-identity flex min-w-0 items-center gap-3 text-left"
          aria-label={`${inspectLabel}: ${ticker}`} onClick={() => onInspect(ticker)}>{identity}</button>
          : <div className="stock-card-identity flex min-w-0 items-center gap-3">{identity}</div>}
        <div className="stock-card-market flex shrink-0 items-center gap-3 md:gap-5">
          <div className="stock-card-quote text-right tabular-nums">
            {priceLabel && <span className="stock-card-price-label">{priceLabel}</span>}
            <p className={cn('stock-card-price m-0 font-semibold', hasPrice ? 'text-lg text-foreground' : 'text-sm text-muted-foreground')}>
              {loading ? loadingLabel : formattedPrice}
            </p>
            <div className="stock-card-change flex items-center justify-end gap-1 text-sm text-muted-foreground"
              data-direction={loading || !hasChange ? undefined : isPositiveChange ? 'up' : 'down'}>
              {changeLabel && <span className="stock-card-change-label">{changeLabel}</span>}
              {!loading && hasChange ? <>
                {isPositiveChange ? <ArrowUpRight className="h-4 w-4" aria-hidden="true" /> : <ArrowDownRight className="h-4 w-4" aria-hidden="true" />}
                <span>{isPositiveChange ? '+' : '−'}{Math.abs(change!).toFixed(2)}%</span>
              </> : <span>{loading ? '—' : changeUnavailableLabel}</span>}
            </div>
          </div>
          <Button type="button" variant="secondary" size="sm" className="stock-card-buy min-h-11 min-w-14 rounded-full"
            disabled={buyDisabled}
            onClick={() => onBuy(ticker)} aria-label={`${buyLabel} ${ticker}`}>{buyLabel}</Button>
          {actions && <div className="stock-card-actions">{actions}</div>}
        </div>
      </div>
      {children}
    </motion.div>
  },
)

StockCard.displayName = 'StockCard'
export { StockCard }
