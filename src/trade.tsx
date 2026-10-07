import * as React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowUpRight, ChartCandlestick, Check, ChevronDown, ExternalLink, Search } from 'lucide-react'
import { assetLogo, tokenLogoError, type CatalogAsset } from '../lib/asset-catalog'
import { MarketChart } from '@/components/spectrumui/charts/market-chart'
import { getMarket, getRwa, MarketRequestError, type MarketData, type MarketFailure, type RwaContext, type Timeframe } from './market-api'
import { TradeConfirmation, type TradeSheetLock } from './trade-confirmation'
import './trade.css'

export type TradeAsset = CatalogAsset

type Side = 'buy' | 'sell'
type Language = 'en' | 'zh'

const words = {
  en: {
    label: 'FIRSTBELL / TRADE', chart: 'Chart', market: 'MARKET / BNB SMART CHAIN',
    lastPrice: 'Last price', change: '24h change', orderType: 'Order type', orderMarket: 'Market', spend: 'Amount to spend', quantity: 'Token quantity', timeframe: 'Chart timeframe',
    select: 'Select asset', quote: 'Live quote unavailable', noData: 'No token price history yet',
    noDataBody: 'No verified candle history is available for this token and timeframe.',
    marketError: 'Market data unavailable', marketErrorBody: 'The market-data provider could not be reached. Retry shortly.',
    marketAuth: 'Binance API access rejected', marketAuthBody: 'The saved Binance credentials or their access settings need to be checked.',
    marketRate: 'Market-data request limit reached', marketRateBody: 'Wait a minute, then retry.',
    inspect: 'Asset details', scan: 'View contract',
    buy: 'Buy', sell: 'Sell', sheetTitle: 'Trade',
    reviewBuy: 'Review buy', reviewSell: 'Review sell', reviewNote: 'Review price and fees before confirming.', invalidAmount: 'Enter a positive amount with up to 18 decimal places.',
    noPrice: 'Price unavailable', noChange: 'No data',
    loading: 'Loading market data', retry: 'Retry', sourceOndo: 'Ondo primary-market data', sourceDex: 'GeckoTerminal DEX pool data', sourceBinance: 'Binance Web3 token-market data', sourceBinanceRwa: 'Binance RWA token price', marketPrice: 'Market price', updated: 'Updated',
    rwaSource: 'BINANCE WEB3 / RWA DATA', rwaPrice: 'On-chain token price', rwaReference: 'Per-share reference', rwaSession: 'Underlying market', rwaPending: 'Binance Web3 API setup pending', rwaUnavailable: 'Binance RWA data unavailable', rwaAssetMissing: 'This asset is not verified in the Binance RWA response', rwaLoading: 'Loading RWA data', rwaNoSession: 'Market status unavailable', rwaNextOpen: 'Next open',
    rwaNote: 'The reference is a per-share conversion derived from the token price, not an official stock exchange quote or a trade fill.',
    close: 'Close trade sheet', choose: 'Choose a token', search: 'Search name or token', noTokens: 'No tokens found.',
  },
  zh: {
    label: 'FIRSTBELL / 交易', chart: '图表', market: '市场 / BNB 智能链',
    lastPrice: '最新价格', change: '24小时涨跌', orderType: '订单类型', orderMarket: '市价', spend: '支付金额', quantity: '代币数量', timeframe: '图表周期',
    select: '选择资产', quote: '暂无实时报价', noData: '暂无代币价格历史',
    noDataBody: '此代币和周期暂无经过核实的 K 线历史。',
    marketError: '行情数据暂不可用', marketErrorBody: '无法连接行情服务，请稍后重试。',
    marketAuth: 'Binance API 访问被拒绝', marketAuthBody: '需要检查已保存的 Binance 凭证或访问设置。',
    marketRate: '行情请求已达上限', marketRateBody: '请等待一分钟后重试。',
    inspect: '资产资料', scan: '查看合约',
    buy: '买入', sell: '卖出', sheetTitle: '交易',
    reviewBuy: '查看买单', reviewSell: '查看卖单', reviewNote: '确认前请查看价格和费用。', invalidAmount: '请输入正数，最多保留 18 位小数。',
    noPrice: '暂无报价', noChange: '暂无数据',
    loading: '正在加载市场数据', retry: '重试', sourceOndo: 'Ondo 一级市场数据', sourceDex: 'GeckoTerminal 去中心化交易池数据', sourceBinance: 'Binance Web3 代币行情', sourceBinanceRwa: 'Binance RWA 代币价格', marketPrice: '市场价格', updated: '更新时间',
    rwaSource: 'BINANCE WEB3 / RWA 数据', rwaPrice: '链上代币价格', rwaReference: '每股参考价', rwaSession: '标的市场', rwaPending: 'Binance Web3 API 待配置', rwaUnavailable: 'Binance RWA 数据暂不可用', rwaAssetMissing: 'Binance RWA 响应中未核实此资产', rwaLoading: '正在加载 RWA 数据', rwaNoSession: '市场状态暂不可用', rwaNextOpen: '下次开市',
    rwaNote: '参考价由代币价格换算为每股价格，并非证券交易所官方报价或成交价。',
    close: '关闭交易面板', choose: '选择代币', search: '搜索名称或代币', noTokens: '没有找到代币。',
  },
}

const sourceHref = (asset: TradeAsset) => `https://bscscan.com/token/${asset.address}`

function TokenMark({ asset }: { asset: TradeAsset }) {
  return <img src={assetLogo(asset)} className={`brand-mark brand-mark--${asset.mark}`} alt="" loading="lazy" onError={tokenLogoError} />
}

export function TradeWorkspace({ assets, asset, onAssetChange, onInspect, language, initialSide = null, onBusyChange, onExit }: {
  assets: TradeAsset[]
  asset: TradeAsset
  onAssetChange: (asset: TradeAsset) => void
  onInspect: (asset: TradeAsset) => void
  language: Language
  initialSide?: Side | null
  onBusyChange?: (busy: boolean) => void
  onExit?: () => void
}) {
  const t = words[language]
  const [selectorOpen, setSelectorOpen] = React.useState(false)
  const [selectorQuery, setSelectorQuery] = React.useState('')
  const matchingAssets = assets.filter(candidate => `${candidate.company} ${candidate.symbol}`.toLowerCase().includes(selectorQuery.trim().toLowerCase()))
  const reduceMotion = useReducedMotion()
  const [side, setSide] = React.useState<Side>(initialSide ?? 'buy')
  const [amount, setAmount] = React.useState('')
  const [timeframe, setTimeframe] = React.useState<Timeframe>('15m')
  const [market, setMarket] = React.useState<MarketData | null>(null)
  const [marketState, setMarketState] = React.useState<'loading' | 'empty' | 'error' | 'ready'>('loading')
  const [marketFailure, setMarketFailure] = React.useState<MarketFailure>('provider_error')
  const [rwa, setRwa] = React.useState<RwaContext | null>(null)
  const [rwaState, setRwaState] = React.useState<'loading' | 'not_configured' | 'no_verified_asset' | MarketFailure>('loading')
  const [refresh, setRefresh] = React.useState(0)
  const [tradeLock, setTradeLock] = React.useState<TradeSheetLock>({ close: false, edit: false })
  const marketQuery = React.useRef('')
  const marketResultQuery = React.useRef('')
  const rwaQuery = React.useRef('')
  const updateLock = React.useCallback((next: TradeSheetLock) => { setTradeLock(next); onBusyChange?.(next.close) }, [onBusyChange])
  React.useEffect(() => () => onBusyChange?.(false), [onBusyChange])

  React.useEffect(() => {
    const controller = new AbortController()
    const query = `${asset.symbol}:${timeframe}`
    const fresh = marketQuery.current !== query
    marketQuery.current = query
    if (fresh) { marketResultQuery.current = ''; setMarket(null); setMarketState('loading') }
    getMarket(asset.symbol, timeframe, controller.signal).then(result => {
      if (controller.signal.aborted) return
      marketResultQuery.current = query
      setMarket(result)
      if (result?.historyError) setMarketFailure(result.historyError.reason)
      setMarketState(result?.candles.length ? 'ready' : result?.historyError ? 'error' : 'empty')
    }).catch(error => {
      if (controller.signal.aborted) return
      setMarketFailure(error instanceof MarketRequestError ? error.reason : 'provider_error')
      // A background update must not remove the previous chart or reset input.
      if (marketResultQuery.current !== query) setMarketState('error')
    })
    return () => controller.abort()
  }, [asset.symbol, timeframe, refresh])

  React.useEffect(() => {
    const controller = new AbortController()
    if (rwaQuery.current !== asset.symbol) { setRwa(null); setRwaState('loading'); rwaQuery.current = asset.symbol }
    getRwa(asset.symbol, controller.signal).then(result => {
      if (controller.signal.aborted) return
      if (result.status === 'ready') setRwa(result)
      else setRwaState(result.reason)
    }).catch(() => { if (!controller.signal.aborted) setRwaState('provider_error') })
    return () => controller.abort()
  }, [asset.symbol, refresh])

  React.useEffect(() => {
    if (amount || tradeLock.edit) return
    const timer = window.setInterval(() => setRefresh(value => value + 1), 30_000)
    return () => window.clearInterval(timer)
  }, [amount, tradeLock.edit])

  const tokenPrice = market?.symbol === asset.symbol && market.priceUsd !== null ? market.priceUsd
    : rwa?.symbol === asset.symbol ? rwa.tokenPriceUsd : null
  const price = tokenPrice !== null && tokenPrice > 0 && Number.isFinite(tokenPrice)
    ? new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(tokenPrice)
    : t.noPrice
  const change = market?.change24hPct != null && Number.isFinite(market.change24hPct)
    ? `${market.change24hPct >= 0 ? '+' : ''}${market.change24hPct.toFixed(2)}%` : t.noChange
  const sourceLabel = market?.source === 'ondo' ? t.sourceOndo : market?.source === 'geckoterminal' ? t.sourceDex : market?.source === 'binance-web3' ? t.sourceBinance : t.quote
  const money = (value: number) => new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value)
  const rwaStatus = rwaState === 'loading' ? t.rwaLoading : rwaState === 'not_configured' ? t.rwaPending : rwaState === 'no_verified_asset' ? t.rwaAssetMissing
    : rwaState === 'provider_auth_error' ? t.marketAuth : rwaState === 'rate_limited' ? t.marketRate : t.rwaUnavailable
  const marketErrorTitle = marketFailure === 'provider_auth_error' ? t.marketAuth : marketFailure === 'rate_limited' ? t.marketRate : t.marketError
  const marketErrorBody = marketFailure === 'provider_auth_error' ? t.marketAuthBody : marketFailure === 'rate_limited' ? t.marketRateBody : t.marketErrorBody

  React.useEffect(() => { setAmount('') }, [asset.symbol])

  return <section className="trade-terminal" aria-labelledby="trade-heading">
    <div className="trade-topline"><span>{t.label}</span><span>FB / 002</span></div>
    <div className="trade-heading-row">
      <div className="trade-asset-picker">
        <button type="button" className="trade-asset-trigger" disabled={tradeLock.edit} onClick={() => setSelectorOpen(value => !value)} aria-expanded={selectorOpen} aria-controls="trade-asset-menu" aria-label={t.select}>
          <TokenMark asset={asset} /><span><strong id="trade-heading">{asset.symbol}</strong><small>{asset.company} · Ondo</small></span><ChevronDown size={20} aria-hidden="true" />
        </button>
        <AnimatePresence>{selectorOpen && <motion.div id="trade-asset-menu" className="trade-asset-menu" initial={reduceMotion ? false : { opacity: 0, scale: .97, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .99, y: -4 }} transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }}>
          <label className="trade-token-search"><Search size={16} /><input type="search" value={selectorQuery} onChange={event => setSelectorQuery(event.target.value)} placeholder={t.search} aria-label={t.search} /></label>
          <div role="listbox" aria-label={t.choose} className="trade-token-options">{matchingAssets.length ? matchingAssets.map(candidate => <button type="button" role="option" aria-selected={asset.symbol === candidate.symbol} key={candidate.symbol} onClick={() => { onAssetChange(candidate); setSelectorOpen(false); setSelectorQuery('') }}><TokenMark asset={candidate} /><span><strong>{candidate.symbol}</strong><small>{candidate.company}</small></span>{candidate.symbol === asset.symbol && <Check size={17} />}</button>) : <p>{t.noTokens}</p>}</div>
        </motion.div>}</AnimatePresence>
      </div>
      <div className="trade-header-right"><span className="trade-network"><i /> BNB SMART CHAIN</span><div className="trade-price-pair"><span><small>{market?.priceUsd == null && rwa ? t.sourceBinanceRwa : t.lastPrice}</small><strong className={tokenPrice ? '' : 'trade-unavailable-value'}>{price}</strong></span><span><small>{t.change}</small><strong className={market?.change24hPct != null ? (market.change24hPct >= 0 ? 'trade-change-up' : 'trade-change-down') : 'trade-unavailable-value'}>{change}</strong></span></div></div>
    </div>

    <div className="trade-body">
      <aside className="trade-entry" aria-labelledby="trade-entry-heading">
        <div className="trade-entry-heading"><h2 id="trade-entry-heading">{t.sheetTitle}</h2><span>{asset.symbol}</span></div>
        <div className="trade-entry-tabs" role="group" aria-label={t.sheetTitle}>{(['buy', 'sell'] as const).map(value => <button type="button" key={value} disabled={tradeLock.edit} aria-pressed={side === value} className={`trade-${value}`} onClick={() => { if (value !== side) { setSide(value); setAmount('') } }}>{t[value]}</button>)}</div>
        <div className="trade-entry-market"><span>{t.orderType}</span><strong>{t.orderMarket}</strong></div>
        <TradeConfirmation symbol={asset.symbol} tokenAddress={asset.address} side={side} amount={amount} onAmountChange={setAmount} language={language} onCancel={() => setAmount('')} onClosePending={onExit} onLockChange={updateLock} />
        <div className="trade-entry-links"><button type="button" disabled={tradeLock.close} onClick={() => onInspect(asset)}>{t.inspect}<ArrowUpRight size={14} aria-hidden="true" /></button><a href={sourceHref(asset)} target="_blank" rel="noreferrer">{t.scan}<ExternalLink size={14} aria-hidden="true" /></a></div>
      </aside>

      <div className="trade-market-panel">
        <div className="trade-tabs"><span className="active"><ChartCandlestick size={17} />{t.chart}</span><span>{t.market}</span></div>
        <div className="trade-timeframes" role="group" aria-label={t.timeframe}>{(['15m', '1h', '4h', '1D'] as const).map(value => <button type="button" className="motion-tab" key={value} aria-pressed={timeframe === value} onClick={() => setTimeframe(value)}>{timeframe === value && <motion.span className="motion-tab-indicator" layoutId="trade-timeframe-active" transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }} />}<span>{value}</span></button>)}</div>
        <div className="trade-chart" key={asset.symbol}>
          <MarketChart data={market?.candles ?? []} symbol={asset.symbol} name={asset.company} status={marketState} showRangeSelector={false} showVolume={market?.source === 'geckoterminal' || market?.source === 'binance-web3'} height={320} emptyTitle={marketState === 'loading' ? t.loading : t.noData} emptyDescription={t.noDataBody} errorTitle={marketErrorTitle} errorDescription={marketErrorBody} retryLabel={t.retry} onRetry={() => setRefresh(value => value + 1)} />
        </div>
        <div className="trade-chart-foot"><span>OHLC / {timeframe} / {asset.symbol}</span><span>{sourceLabel}{market?.asOf ? ` · ${t.updated} ${new Date(market.asOf).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC` : ''}</span></div>
      </div>
    </div>

    <section className="trade-rwa-card" aria-label={t.rwaSource} aria-live="polite">
      <div className="trade-rwa-heading"><span>{t.rwaSource}</span><span>{rwa ? `${t.updated} ${new Date(rwa.priceUpdatedAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC` : rwaStatus}</span></div>
      {rwa && <>
        <div className="trade-rwa-values">
          <div><small>{t.rwaPrice}</small><strong>{money(rwa.tokenPriceUsd)}</strong></div>
          <div><small>{t.rwaReference}</small><strong>{rwa.referencePerShareUsd !== null ? money(rwa.referencePerShareUsd) : t.rwaUnavailable}</strong></div>
          <div><small>{t.rwaSession}</small><strong>{rwa.underlyingMarket ? rwa.underlyingMarket.session : t.rwaNoSession}</strong>{rwa.underlyingMarket?.nextOpenAt && <small>{t.rwaNextOpen}: {new Date(rwa.underlyingMarket.nextOpenAt).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC</small>}</div>
        </div>
        <p>{t.rwaNote}</p>
      </>}
    </section>

  </section>
}
