import * as React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowUpRight, ChartCandlestick, Check, ChevronDown, ExternalLink, X } from 'lucide-react'
import { MarketChart } from '@/components/spectrumui/charts/market-chart'
import { getMarket, getTradeQuote, type MarketData, type Timeframe, type TradeQuote } from './market-api'
import './trade.css'

export type TradeAsset = {
  symbol: string
  company: string
  mark: string
  address: string
  chainId: number
  name: string
  source: string
  file: string
}

type Side = 'buy' | 'sell'
type Language = 'en' | 'zh'

const words = {
  en: {
    label: 'FIRSTBELL / TRADE', chart: 'Chart', market: 'MARKET / BNB SMART CHAIN',
    lastPrice: 'Last price', change: '24h change', orderType: 'Order type', orderMarket: 'Market', quantity: 'Quantity', allocation: 'Available balance', timeframe: 'Chart timeframe',
    select: 'Select asset', quote: 'Live quote unavailable', noData: 'No token price history yet',
    noDataBody: 'A verified market feed is needed before candles and prices can be shown.',
    source: 'ASSET RECORD', issuer: 'Issuer', network: 'Network', contract: 'Contract',
    inspect: 'Inspect asset file', scan: 'View contract on BscScan',
    buy: 'Buy', sell: 'Sell', sheetTitle: 'Trade', buyAmount: 'Quantity', sellAmount: 'Quantity',
    receive: 'Estimated receive', unavailable: 'Quote unavailable', balance: 'Wallet balance unavailable', balanceLabel: 'Wallet balance', noPrice: 'Price unavailable', noChange: 'No data', noBalance: 'Not connected',
    sheetNote: 'Ondo soft quotes are estimates, not executable orders. On-chain trading requires an eligible account, a binding quote, and wallet approval. No trade will be submitted here.',
    loading: 'Loading market data', retry: 'Retry', sourceOndo: 'Ondo primary-market data', sourceDex: 'GeckoTerminal DEX pool data', marketPrice: 'Market price', updated: 'Updated',
    getQuote: 'Get estimate', gettingQuote: 'Requesting estimate', login: 'Log In for estimate', quotePrice: 'Indicative token price', quoteTotal: 'Estimated total', quoteDisclaimer: 'Indicative Ondo quote. This cannot be executed from FirstBell yet.', quoteError: 'Quote unavailable',
    close: 'Close trade sheet', choose: 'Choose a tokenized equity',
  },
  zh: {
    label: 'FIRSTBELL / 交易', chart: '图表', market: '市场 / BNB 智能链',
    lastPrice: '最新价格', change: '24小时涨跌', orderType: '订单类型', orderMarket: '市价', quantity: '数量', allocation: '可用余额', timeframe: '图表周期',
    select: '选择资产', quote: '暂无实时报价', noData: '暂无代币价格历史',
    noDataBody: '接入经过核实的行情数据后，才能显示 K 线和价格。',
    source: '资产记录', issuer: '发行方', network: '网络', contract: '合约',
    inspect: '查看资产资料', scan: '在 BscScan 查看合约',
    buy: '买入', sell: '卖出', sheetTitle: '交易', buyAmount: '数量', sellAmount: '数量',
    receive: '预计收到', unavailable: '暂无报价', balance: '暂无钱包余额', balanceLabel: '钱包余额', noPrice: '暂无报价', noChange: '暂无数据', noBalance: '未连接',
    sheetNote: 'Ondo 参考报价只是估算，不能直接执行。链上交易还需要合格账户、正式报价和钱包授权。这里不会提交交易。',
    loading: '正在加载市场数据', retry: '重试', sourceOndo: 'Ondo 一级市场数据', sourceDex: 'GeckoTerminal 去中心化交易池数据', marketPrice: '市场价格', updated: '更新时间',
    getQuote: '获取估算', gettingQuote: '正在请求估算', login: '登录后获取估算', quotePrice: '参考代币价格', quoteTotal: '预计总额', quoteDisclaimer: 'Ondo 参考报价，目前不能在 FirstBell 执行。', quoteError: '暂无报价',
    close: '关闭交易面板', choose: '选择代币化股票',
  },
}

const sourceHref = (asset: TradeAsset) => `https://bscscan.com/token/${asset.address}`

function TokenMark({ asset }: { asset: TradeAsset }) {
  return <img src={`/assets/marks/${asset.mark}.svg`} className={`brand-mark brand-mark--${asset.mark}`} alt="" />
}

export function TradeWorkspace({ assets, asset, onAssetChange, onInspect, language }: {
  assets: TradeAsset[]
  asset: TradeAsset
  onAssetChange: (asset: TradeAsset) => void
  onInspect: (asset: TradeAsset) => void
  language: Language
}) {
  const t = words[language]
  const [selectorOpen, setSelectorOpen] = React.useState(false)
  const reduceMotion = useReducedMotion()
  const [side, setSide] = React.useState<Side | null>(null)
  const [amount, setAmount] = React.useState('')
  const [timeframe, setTimeframe] = React.useState<Timeframe>('15m')
  const [market, setMarket] = React.useState<MarketData | null>(null)
  const [marketState, setMarketState] = React.useState<'loading' | 'empty' | 'error' | 'ready'>('loading')
  const [refresh, setRefresh] = React.useState(0)
  const [quote, setQuote] = React.useState<TradeQuote | null>(null)
  const [quoteState, setQuoteState] = React.useState<'idle' | 'loading' | 'error'>('idle')
  const [quoteError, setQuoteError] = React.useState('')
  const { authenticated, login, getAccessToken } = usePrivy()
  const sheetRef = React.useRef<HTMLElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const quoteVersion = React.useRef(0)

  React.useEffect(() => {
    const controller = new AbortController()
    setMarket(null)
    setMarketState('loading')
    getMarket(asset.symbol, timeframe, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setMarket(result)
      setMarketState(result?.candles.length ? 'ready' : 'empty')
    }).catch(() => { if (!controller.signal.aborted) setMarketState('error') })
    return () => controller.abort()
  }, [asset.symbol, timeframe, refresh])

  React.useEffect(() => {
    const timer = window.setInterval(() => setRefresh(value => value + 1), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  React.useEffect(() => { quoteVersion.current += 1; setQuote(null); setQuoteState('idle'); setQuoteError('') }, [asset.symbol, side, amount])

  const requestQuote = async () => {
    if (!side) return
    if (!authenticated) { login(); return }
    const version = ++quoteVersion.current
    setQuoteState('loading'); setQuoteError('')
    const token = await getAccessToken()
    if (version !== quoteVersion.current) return
    if (!token) { setQuoteState('error'); setQuoteError(t.login); return }
    try {
      const result = await getTradeQuote(asset.symbol, side, amount, token)
      if (version !== quoteVersion.current) return
      setQuote(result)
      setQuoteState('idle')
    } catch (error) {
      if (version !== quoteVersion.current) return
      setQuoteState('error')
      setQuoteError(error instanceof Error ? error.message : t.quoteError)
    }
  }

  const validAmount = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,18})?$/.test(amount) && /[1-9]/.test(amount)
  const price = market?.priceUsd && Number.isFinite(market.priceUsd)
    ? new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(market.priceUsd)
    : t.noPrice
  const change = market?.change24hPct != null && Number.isFinite(market.change24hPct)
    ? `${market.change24hPct >= 0 ? '+' : ''}${market.change24hPct.toFixed(2)}%` : t.noChange
  const sourceLabel = market?.source === 'ondo' ? t.sourceOndo : market?.source === 'geckoterminal' ? t.sourceDex : t.quote

  const openSheet = (nextSide: Side, event: React.MouseEvent<HTMLButtonElement>) => {
    triggerRef.current = event.currentTarget
    setSelectorOpen(false)
    setSide(nextSide)
  }

  React.useEffect(() => {
    if (!side) return
    const priorOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => sheetRef.current?.querySelector<HTMLInputElement>('input')?.focus(), 80)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSide(null); return }
      if (event.key !== 'Tab' || !sheetRef.current) return
      const focusable = Array.from(sheetRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]'))
      if (!focusable.length) return
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = priorOverflow
      document.removeEventListener('keydown', onKey)
      triggerRef.current?.focus()
    }
  }, [side])

  React.useEffect(() => { setAmount('') }, [asset.symbol])

  return <section className="trade-terminal" aria-labelledby="trade-heading">
    <div className="trade-topline"><span>{t.label}</span><span>FB / 002</span></div>
    <div className="trade-heading-row">
      <div className="trade-asset-picker">
        <button type="button" className="trade-asset-trigger" onClick={() => setSelectorOpen(value => !value)} aria-expanded={selectorOpen} aria-controls="trade-asset-menu" aria-label={t.select}>
          <TokenMark asset={asset} /><span><strong id="trade-heading">{asset.symbol}</strong><small>{asset.company} · Ondo</small></span><ChevronDown size={20} aria-hidden="true" />
        </button>
        <AnimatePresence>{selectorOpen && <motion.div id="trade-asset-menu" role="listbox" aria-label={t.choose} className="trade-asset-menu" initial={reduceMotion ? false : { opacity: 0, scale: .97, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .99, y: -4 }} transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }}>
          {assets.map(candidate => <button type="button" role="option" aria-selected={asset.symbol === candidate.symbol} key={candidate.symbol} onClick={() => { onAssetChange(candidate); setSelectorOpen(false) }}><TokenMark asset={candidate} /><span><strong>{candidate.symbol}</strong><small>{candidate.company}</small></span>{candidate.symbol === asset.symbol && <Check size={17} />}</button>)}
        </motion.div>}</AnimatePresence>
      </div>
      <div className="trade-header-right"><span className="trade-network"><i /> BNB SMART CHAIN</span><div className="trade-price-pair"><span><small>{t.lastPrice}</small><strong className={market?.priceUsd ? '' : 'trade-unavailable-value'}>{price}</strong></span><span><small>{t.change}</small><strong className={market?.change24hPct != null ? (market.change24hPct >= 0 ? 'trade-change-up' : 'trade-change-down') : 'trade-unavailable-value'}>{change}</strong></span></div></div>
    </div>

    <div className="trade-body">
      <div className="trade-market-panel">
        <div className="trade-tabs"><span className="active"><ChartCandlestick size={17} />{t.chart}</span><span>{t.market}</span></div>
        <div className="trade-timeframes" role="group" aria-label={t.timeframe}>{(['15m', '1h', '4h', '1D'] as const).map(value => <button type="button" className="motion-tab" key={value} aria-pressed={timeframe === value} onClick={() => setTimeframe(value)}>{timeframe === value && <motion.span className="motion-tab-indicator" layoutId="trade-timeframe-active" transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }} />}<span>{value}</span></button>)}</div>
        <div className="trade-chart" key={asset.symbol}>
          <MarketChart data={market?.candles ?? []} symbol={asset.symbol} name={asset.company} status={marketState} showRangeSelector={false} showVolume={market?.source === 'geckoterminal'} height={320} emptyTitle={marketState === 'loading' ? t.loading : t.noData} emptyDescription={t.noDataBody} onRetry={() => setRefresh(value => value + 1)} />
        </div>
        <div className="trade-chart-foot"><span>OHLC / {timeframe} / {asset.symbol}</span><span>{sourceLabel}{market?.asOf ? ` · ${t.updated} ${new Date(market.asOf).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC` : ''}</span></div>
      </div>

      <aside className="trade-asset-record" aria-label={t.source}>
        <div className="trade-record-head"><span>{t.source}</span><span>01 / 05</span></div>
        <div className="trade-record-mark"><TokenMark asset={asset} /></div>
        <dl>
          <div><dt>{t.issuer}</dt><dd>Ondo Global Markets</dd></div>
          <div><dt>{t.network}</dt><dd>BNB Smart Chain</dd></div>
          <div><dt>{t.contract}</dt><dd title={asset.address}>{asset.address.slice(0, 8)}…{asset.address.slice(-6)}</dd></div>
        </dl>
        <button type="button" className="trade-inspect" onClick={() => onInspect(asset)}>{t.inspect}<ArrowUpRight size={16} /></button>
        <a href={sourceHref(asset)} target="_blank" rel="noreferrer" className="trade-external">{t.scan}<ExternalLink size={15} /></a>
      </aside>
    </div>

    <section className="trade-ticket" aria-label={t.sheetTitle}>
      <div className="trade-ticket-head"><span>{t.sheetTitle} / {asset.symbol}</span><span>{sourceLabel}</span></div>
      <div className="trade-ticket-fields"><div className="trade-ticket-market"><small>{t.orderType}</small><strong>{t.orderMarket}</strong></div><label className="trade-ticket-quantity"><small>{t.quantity}</small><span><input id="trade-ticket-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /><strong>{asset.symbol}</strong></span></label></div>
      <div className="trade-ticket-slider"><input type="range" min="0" max="100" value="0" disabled aria-label={t.allocation} /><span>{t.balance}</span></div>
      <div className="trade-dock-buttons"><button type="button" className="trade-buy" onClick={event => openSheet('buy', event)}>{t.buy}</button><button type="button" className="trade-sell" onClick={event => openSheet('sell', event)}>{t.sell}</button></div>
    </section>

    <AnimatePresence>{side && <div className="trade-sheet-layer">
      <motion.button className="trade-sheet-scrim" type="button" aria-label={t.close} onClick={() => setSide(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.section ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="trade-sheet-heading" className="trade-sheet" initial={reduceMotion ? false : { y: 100, opacity: 0, filter: 'blur(2px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }} exit={reduceMotion ? { opacity: 0 } : { y: 100, opacity: 0, filter: 'blur(2px)' }} transition={{ duration: reduceMotion ? 0 : .4, ease: [.22, 1, .36, 1] }}>
        <div className="trade-sheet-handle" aria-hidden="true" />
        <div className="trade-sheet-header"><div><span>{t.sheetTitle} / {asset.symbol}</span><h2 id="trade-sheet-heading">{side === 'buy' ? t.buy : t.sell} {asset.symbol}</h2></div><button type="button" onClick={() => setSide(null)} aria-label={t.close}><X size={22} /></button></div>
        <div className="trade-sheet-tabs" role="tablist" aria-label={t.sheetTitle}>{(['buy', 'sell'] as const).map(value => <button type="button" role="tab" key={value} aria-selected={side === value} className={`motion-tab trade-${value} ${side === value ? 'active' : ''}`} onClick={() => setSide(value)}>{side === value && <motion.span className="motion-tab-indicator" layoutId="trade-side-active" transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }} />}<span>{t[value]}</span></button>)}</div>
        <label className="trade-amount-label" htmlFor="trade-amount">{side === 'buy' ? t.buyAmount : t.sellAmount}</label>
        <div className="trade-amount-field"><input id="trade-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /><span>{asset.symbol}</span></div>
        <div className="trade-sheet-row"><span>{t.quotePrice}</span><strong>{quote ? `$${quote.priceUsd}` : t.unavailable}</strong></div>
        {quote && <div className="trade-sheet-row"><span>{t.quoteTotal}</span><strong>${quote.estimatedTotalUsd}</strong></div>}
        {side === 'sell' && <div className="trade-sheet-row"><span>{t.balanceLabel}</span><strong>{t.noBalance}</strong></div>}
        <div className="trade-sheet-status"><span>{quote ? t.quoteDisclaimer : t.unavailable}</span><span>BNB SMART CHAIN</span></div>
        {quoteError && <p role="alert" className="trade-sheet-error">{quoteError}</p>}
        <button type="button" className={`trade-submit trade-${side}`} disabled={quoteState === 'loading' || (authenticated && !validAmount)} onClick={requestQuote}>{!authenticated ? t.login : quoteState === 'loading' ? t.gettingQuote : t.getQuote}</button>
        <p className="trade-sheet-note">{t.sheetNote}</p>
      </motion.section>
    </div>}</AnimatePresence>
  </section>
}
