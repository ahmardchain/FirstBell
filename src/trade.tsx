import * as React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { getIdentityToken, useIdentityToken, usePrivy, useWallets } from '@privy-io/react-auth'
import { ArrowUpRight, ChartCandlestick, Check, ChevronDown, ExternalLink, Search, X } from 'lucide-react'
import { assetLogo, tokenLogoError, type CatalogAsset } from '../lib/asset-catalog'
import { MarketChart } from '@/components/spectrumui/charts/market-chart'
import { getMarket, getRwa, getTradingRoute, MarketRequestError, type MarketData, type MarketFailure, type RwaContext, type Timeframe, type TradingRoute } from './market-api'
import { displayQuantity } from './wallet-balances'
import { withWalletSession } from '../lib/wallet-session'
import './trade.css'

export type TradeAsset = CatalogAsset

type Side = 'buy' | 'sell'
type Language = 'en' | 'zh'

const words = {
  en: {
    label: 'FIRSTBELL / TRADE', chart: 'Chart', market: 'MARKET / BNB SMART CHAIN',
    lastPrice: 'Last price', change: '24h change', orderType: 'Order type', orderMarket: 'Market', quantity: 'Quantity', allocation: 'Available balance', timeframe: 'Chart timeframe',
    select: 'Select asset', quote: 'Live quote unavailable', noData: 'No token price history yet',
    noDataBody: 'No verified candle history is available for this token and timeframe.',
    marketError: 'Market data unavailable', marketErrorBody: 'The market-data provider could not be reached. Retry shortly.',
    marketAuth: 'Binance API access rejected', marketAuthBody: 'The saved Binance credentials or their access settings need to be checked.',
    marketRate: 'Market-data request limit reached', marketRateBody: 'Wait a minute, then retry.',
    source: 'ASSET RECORD', issuer: 'Issuer', network: 'Network', contract: 'Contract',
    inspect: 'Inspect asset file', scan: 'View contract on BscScan',
    buy: 'Buy', sell: 'Sell', sheetTitle: 'Trade', buyAmount: 'Amount to spend', sellAmount: 'Token quantity',
    receive: 'Estimated receive', unavailable: 'Quote unavailable', enterAmount: 'Enter an amount', routePrompt: 'Check route for a quote', balance: 'Wallet balance unavailable', balanceLabel: 'Wallet balance', noPrice: 'Price unavailable', noChange: 'No data', noBalance: 'Not connected',
    sheetNote: 'Check a BSC trading route for your wallet. This check does not place an order. Stock purchase and sale are not available in FirstBell yet.',
    loading: 'Loading market data', retry: 'Retry', sourceOndo: 'Ondo primary-market data', sourceDex: 'GeckoTerminal DEX pool data', sourceBinance: 'Binance Web3 token-market data', sourceBinanceRwa: 'Binance RWA token price', marketPrice: 'Market price', updated: 'Updated',
    getQuote: 'Check trading route', gettingQuote: 'Checking route', login: 'Log In to check route', quoteDisclaimer: 'Route found · no order placed', quoteError: 'Trading route could not be checked. Try again.',
    route: 'Trading route', wallet: 'Receiving wallet', routeExpired: 'Quote expired. Check the route again.',
    errors: { not_configured: 'Trading quotes are not configured yet.', account_not_configured: 'Account verification is not configured yet.',
      unauthorized: 'Sign in again to check this route.', session_unavailable: 'Your session could not be loaded. Refresh the page and retry.', session_refresh_failed: 'Your session could not be refreshed. Sign in again and retry.', wallet_not_verified: 'Your wallet could not be verified. Sign in again and retry.',
      wallet_loading: 'Your wallet is still being prepared. Try again shortly.', identity_token_unavailable: 'Wallet verification is not available yet. Sign in again and retry.',
      wallet_verification_not_configured: 'Wallet verification needs to be enabled for this app.', wallet_verification_unavailable: 'Wallet verification is temporarily unavailable. Try again.',
      session_timeout: 'Your sign-in session took too long. Try again.', quote_timeout: 'No quote was returned within 20 seconds. Try again.',
      no_verified_route: 'No verified BSC route is available for this token and amount.', chain_unavailable: 'The trading provider is not offering BSC routes right now.',
      invalid_amount: 'This amount has too many decimal places for the token.', invalid_trade_request: 'Enter a valid amount and try again.',
      provider_auth_error: 'Trading provider access needs to be checked.', rate_limited: 'Please wait a minute before checking another route.', stale_quote: 'The quote expired. Check the route again.' },
    rwaSource: 'BINANCE WEB3 / RWA DATA', rwaPrice: 'On-chain token price', rwaReference: 'Per-share reference', rwaSession: 'Underlying market', rwaPending: 'Binance Web3 API setup pending', rwaUnavailable: 'Binance RWA data unavailable', rwaAssetMissing: 'This asset is not verified in the Binance RWA response', rwaLoading: 'Loading RWA data', rwaNoSession: 'Market status unavailable', rwaNextOpen: 'Next open',
    rwaNote: 'The reference is a per-share conversion derived from the token price, not an official stock exchange quote or a trade fill.',
    close: 'Close trade sheet', choose: 'Choose a token', search: 'Search name or token', noTokens: 'No tokens found.',
  },
  zh: {
    label: 'FIRSTBELL / 交易', chart: '图表', market: '市场 / BNB 智能链',
    lastPrice: '最新价格', change: '24小时涨跌', orderType: '订单类型', orderMarket: '市价', quantity: '数量', allocation: '可用余额', timeframe: '图表周期',
    select: '选择资产', quote: '暂无实时报价', noData: '暂无代币价格历史',
    noDataBody: '此代币和周期暂无经过核实的 K 线历史。',
    marketError: '行情数据暂不可用', marketErrorBody: '无法连接行情服务，请稍后重试。',
    marketAuth: 'Binance API 访问被拒绝', marketAuthBody: '需要检查已保存的 Binance 凭证或访问设置。',
    marketRate: '行情请求已达上限', marketRateBody: '请等待一分钟后重试。',
    source: '资产记录', issuer: '发行方', network: '网络', contract: '合约',
    inspect: '查看资产资料', scan: '在 BscScan 查看合约',
    buy: '买入', sell: '卖出', sheetTitle: '交易', buyAmount: '支付金额', sellAmount: '代币数量',
    receive: '预计收到', unavailable: '暂无报价', enterAmount: '请输入金额', routePrompt: '检查路线以获取报价', balance: '暂无钱包余额', balanceLabel: '钱包余额', noPrice: '暂无报价', noChange: '暂无数据', noBalance: '未连接',
    sheetNote: '为你的钱包检查 BSC 交易路线。此检查不会下单，FirstBell 目前尚不能买入或卖出股票代币。',
    loading: '正在加载市场数据', retry: '重试', sourceOndo: 'Ondo 一级市场数据', sourceDex: 'GeckoTerminal 去中心化交易池数据', sourceBinance: 'Binance Web3 代币行情', sourceBinanceRwa: 'Binance RWA 代币价格', marketPrice: '市场价格', updated: '更新时间',
    getQuote: '检查交易路线', gettingQuote: '正在检查路线', login: '登录后检查路线', quoteDisclaimer: '已找到路线，尚未下单', quoteError: '无法检查交易路线，请重试。',
    route: '交易路线', wallet: '接收钱包', routeExpired: '报价已过期，请重新检查路线。',
    errors: { not_configured: '交易报价尚未配置。', account_not_configured: '账户验证尚未配置。',
      unauthorized: '请重新登录后检查路线。', session_unavailable: '无法加载登录状态，请刷新后重试。', session_refresh_failed: '无法刷新登录状态，请重新登录后重试。', wallet_not_verified: '无法验证你的钱包，请重新登录后重试。',
      wallet_loading: '正在准备你的钱包，请稍后重试。', identity_token_unavailable: '钱包验证暂不可用，请重新登录后重试。',
      wallet_verification_not_configured: '此应用需要启用钱包验证。', wallet_verification_unavailable: '钱包验证暂不可用，请重试。',
      session_timeout: '登录状态加载超时，请重试。', quote_timeout: '20 秒内未收到报价，请重试。',
      no_verified_route: '此代币和金额暂无经过核实的 BSC 路线。', chain_unavailable: '交易服务目前不提供 BSC 路线。',
      invalid_amount: '金额的小数位数超过代币支持的精度。', invalid_trade_request: '请输入有效金额后重试。',
      provider_auth_error: '需要检查交易服务的访问配置。', rate_limited: '请等待一分钟后再次检查路线。', stale_quote: '报价已过期，请重新检查路线。' },
    rwaSource: 'BINANCE WEB3 / RWA 数据', rwaPrice: '链上代币价格', rwaReference: '每股参考价', rwaSession: '标的市场', rwaPending: 'Binance Web3 API 待配置', rwaUnavailable: 'Binance RWA 数据暂不可用', rwaAssetMissing: 'Binance RWA 响应中未核实此资产', rwaLoading: '正在加载 RWA 数据', rwaNoSession: '市场状态暂不可用', rwaNextOpen: '下次开市',
    rwaNote: '参考价由代币价格换算为每股价格，并非证券交易所官方报价或成交价。',
    close: '关闭交易面板', choose: '选择代币', search: '搜索名称或代币', noTokens: '没有找到代币。',
  },
}

const sourceHref = (asset: TradeAsset) => `https://bscscan.com/token/${asset.address}`

function TokenMark({ asset }: { asset: TradeAsset }) {
  return <img src={assetLogo(asset)} className={`brand-mark brand-mark--${asset.mark}`} alt="" loading="lazy" onError={tokenLogoError} />
}

export function TradeWorkspace({ assets, asset, onAssetChange, onInspect, language, initialSide = null }: {
  assets: TradeAsset[]
  asset: TradeAsset
  onAssetChange: (asset: TradeAsset) => void
  onInspect: (asset: TradeAsset) => void
  language: Language
  initialSide?: Side | null
}) {
  const t = words[language]
  const [selectorOpen, setSelectorOpen] = React.useState(false)
  const [selectorQuery, setSelectorQuery] = React.useState('')
  const matchingAssets = assets.filter(candidate => `${candidate.company} ${candidate.symbol}`.toLowerCase().includes(selectorQuery.trim().toLowerCase()))
  const reduceMotion = useReducedMotion()
  const [side, setSide] = React.useState<Side | null>(initialSide)
  const [amount, setAmount] = React.useState('')
  const [ticketAmount, setTicketAmount] = React.useState('')
  const [timeframe, setTimeframe] = React.useState<Timeframe>('15m')
  const [market, setMarket] = React.useState<MarketData | null>(null)
  const [marketState, setMarketState] = React.useState<'loading' | 'empty' | 'error' | 'ready'>('loading')
  const [marketFailure, setMarketFailure] = React.useState<MarketFailure>('provider_error')
  const [rwa, setRwa] = React.useState<RwaContext | null>(null)
  const [rwaState, setRwaState] = React.useState<'loading' | 'not_configured' | 'no_verified_asset' | MarketFailure>('loading')
  const [refresh, setRefresh] = React.useState(0)
  const [quote, setQuote] = React.useState<TradingRoute | null>(null)
  const [quoteExpired, setQuoteExpired] = React.useState(false)
  const [quoteState, setQuoteState] = React.useState<'idle' | 'loading' | 'error'>('idle')
  const [quoteError, setQuoteError] = React.useState('')
  const { authenticated, login, getAccessToken } = usePrivy()
  const { wallets, ready: walletsReady } = useWallets()
  const { identityToken } = useIdentityToken()
  const identity = React.useRef(identityToken)
  identity.current = identityToken
  const wallet = wallets.find(item => item.walletClientType === 'privy' || item.walletClientType === 'privy_v2')
  const address = authenticated && walletsReady ? wallet?.address : undefined
  const sheetRef = React.useRef<HTMLElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)
  const quoteVersion = React.useRef(0)
  const quoteAbort = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    setMarket(null)
    setMarketState('loading')
    getMarket(asset.symbol, timeframe, controller.signal).then(result => {
      if (controller.signal.aborted) return
      setMarket(result)
      if (result?.historyError) setMarketFailure(result.historyError.reason)
      setMarketState(result?.candles.length ? 'ready' : result?.historyError ? 'error' : 'empty')
    }).catch(error => {
      if (controller.signal.aborted) return
      setMarketFailure(error instanceof MarketRequestError ? error.reason : 'provider_error')
      setMarketState('error')
    })
    return () => controller.abort()
  }, [asset.symbol, timeframe, refresh])

  React.useEffect(() => {
    const controller = new AbortController()
    setRwa(null)
    setRwaState('loading')
    getRwa(asset.symbol, controller.signal).then(result => {
      if (controller.signal.aborted) return
      if (result.status === 'ready') setRwa(result)
      else setRwaState(result.reason)
    }).catch(() => { if (!controller.signal.aborted) setRwaState('provider_error') })
    return () => controller.abort()
  }, [asset.symbol, refresh])

  React.useEffect(() => {
    const timer = window.setInterval(() => setRefresh(value => value + 1), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  React.useEffect(() => {
    quoteVersion.current += 1; quoteAbort.current?.abort(); setQuote(null); setQuoteState('idle'); setQuoteError('')
    return () => { quoteVersion.current += 1; quoteAbort.current?.abort() }
  }, [asset.symbol, side, amount, address, authenticated])

  React.useEffect(() => {
    setQuoteExpired(false)
    if (!quote) return
    const remaining = Date.parse(quote.refreshAt) - Date.now()
    if (remaining <= 0) { setQuoteExpired(true); return }
    const timer = window.setTimeout(() => setQuoteExpired(true), remaining)
    return () => window.clearTimeout(timer)
  }, [quote])

  const requestQuote = async () => {
    if (!side) return
    if (!authenticated) { login(); return }
    const version = ++quoteVersion.current
    quoteAbort.current?.abort()
    const abort = new AbortController()
    quoteAbort.current = abort
    setQuote(null)
    setQuoteState('loading'); setQuoteError('')
    try {
      if (!address) throw new Error('wallet_loading')
      const result = await withWalletSession({ getAccessToken, getIdentityToken: () => identity.current,
        refreshIdentityToken: getIdentityToken }, ({ accessToken, identityToken: proof }) => {
        if (version !== quoteVersion.current || abort.signal.aborted) throw new DOMException('Aborted', 'AbortError')
        return getTradingRoute(asset.symbol, side, amount, address, accessToken, proof, abort.signal)
      })
      if (version !== quoteVersion.current) return
      setQuote(result)
      setQuoteState('idle')
    } catch (error) {
      if (version !== quoteVersion.current) return
      setQuoteState('error')
      const reason = error instanceof Error ? error.message : ''
      setQuoteError(t.errors[reason as keyof typeof t.errors] ?? t.quoteError)
    }
  }

  const validAmount = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,18})?$/.test(amount) && /[1-9]/.test(amount)
  const quoteStatus = quoteExpired ? t.routeExpired : quote ? t.quoteDisclaimer
    : quoteState === 'loading' ? t.gettingQuote : quoteState === 'error' ? t.unavailable
    : validAmount ? t.routePrompt : t.enterAmount
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

  const openSheet = (nextSide: Side, event: React.MouseEvent<HTMLButtonElement>) => {
    triggerRef.current = event.currentTarget
    setSelectorOpen(false)
    setAmount(nextSide === 'sell' ? ticketAmount : '')
    setSide(nextSide)
  }

  React.useEffect(() => {
    if (!side) return
    triggerRef.current ??= document.querySelector<HTMLButtonElement>(`.trade-ticket .trade-${side}`)
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

  React.useEffect(() => { setAmount(''); setTicketAmount('') }, [asset.symbol])

  return <section className="trade-terminal" aria-labelledby="trade-heading">
    <div className="trade-topline"><span>{t.label}</span><span>FB / 002</span></div>
    <div className="trade-heading-row">
      <div className="trade-asset-picker">
        <button type="button" className="trade-asset-trigger" onClick={() => setSelectorOpen(value => !value)} aria-expanded={selectorOpen} aria-controls="trade-asset-menu" aria-label={t.select}>
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
      <div className="trade-market-panel">
        <div className="trade-tabs"><span className="active"><ChartCandlestick size={17} />{t.chart}</span><span>{t.market}</span></div>
        <div className="trade-timeframes" role="group" aria-label={t.timeframe}>{(['15m', '1h', '4h', '1D'] as const).map(value => <button type="button" className="motion-tab" key={value} aria-pressed={timeframe === value} onClick={() => setTimeframe(value)}>{timeframe === value && <motion.span className="motion-tab-indicator" layoutId="trade-timeframe-active" transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }} />}<span>{value}</span></button>)}</div>
        <div className="trade-chart" key={asset.symbol}>
          <MarketChart data={market?.candles ?? []} symbol={asset.symbol} name={asset.company} status={marketState} showRangeSelector={false} showVolume={market?.source === 'geckoterminal' || market?.source === 'binance-web3'} height={320} emptyTitle={marketState === 'loading' ? t.loading : t.noData} emptyDescription={t.noDataBody} errorTitle={marketErrorTitle} errorDescription={marketErrorBody} retryLabel={t.retry} onRetry={() => setRefresh(value => value + 1)} />
        </div>
        <div className="trade-chart-foot"><span>OHLC / {timeframe} / {asset.symbol}</span><span>{sourceLabel}{market?.asOf ? ` · ${t.updated} ${new Date(market.asOf).toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC` : ''}</span></div>
      </div>

      <aside className="trade-asset-record" aria-label={t.source}>
        <div className="trade-record-head"><span>{t.source}</span><span>{String(assets.indexOf(asset) + 1).padStart(2, '0')} / {assets.length}</span></div>
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

    <section className="trade-ticket" aria-label={t.sheetTitle}>
      <div className="trade-ticket-head"><span>{t.sheetTitle} / {asset.symbol}</span><span>{sourceLabel}</span></div>
      <div className="trade-ticket-fields"><div className="trade-ticket-market"><small>{t.orderType}</small><strong>{t.orderMarket}</strong></div><label className="trade-ticket-quantity"><small>{t.quantity}</small><span><input id="trade-ticket-amount" type="number" inputMode="decimal" min="0" step="any" value={ticketAmount} onChange={event => setTicketAmount(event.target.value)} placeholder="0.00" /><strong>{asset.symbol}</strong></span></label></div>
      <div className="trade-ticket-slider"><input type="range" min="0" max="100" value="0" disabled aria-label={t.allocation} /><span>{t.balance}</span></div>
      <div className="trade-dock-buttons"><button type="button" className="trade-buy" onClick={event => openSheet('buy', event)}>{t.buy}</button><button type="button" className="trade-sell" onClick={event => openSheet('sell', event)}>{t.sell}</button></div>
    </section>

    <AnimatePresence>{side && <div className="trade-sheet-layer">
      <motion.button className="trade-sheet-scrim" type="button" aria-label={t.close} onClick={() => setSide(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.section ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="trade-sheet-heading" aria-describedby="trade-sheet-note" className="trade-sheet" initial={reduceMotion ? false : { y: 100, opacity: 0, filter: 'blur(2px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }} exit={reduceMotion ? { opacity: 0 } : { y: 100, opacity: 0, filter: 'blur(2px)' }} transition={{ duration: reduceMotion ? 0 : .4, ease: [.22, 1, .36, 1] }}>
        <div className="trade-sheet-handle" aria-hidden="true" />
        <div className="trade-sheet-header"><div><span>{t.sheetTitle} / {asset.symbol}</span><h2 id="trade-sheet-heading">{side === 'buy' ? t.buy : t.sell} {asset.symbol}</h2></div><button type="button" onClick={() => setSide(null)} aria-label={t.close}><X size={22} /></button></div>
        <div className="trade-sheet-tabs" role="group" aria-label={t.sheetTitle}>{(['buy', 'sell'] as const).map(value => <button type="button" key={value} aria-pressed={side === value} className={`motion-tab trade-${value} ${side === value ? 'active' : ''}`} onClick={() => { if (value !== side) { setAmount(value === 'sell' ? ticketAmount : ''); setSide(value) } }}>{side === value && <motion.span className="motion-tab-indicator" layoutId="trade-side-active" transition={{ duration: reduceMotion ? 0 : .25, ease: [.22, 1, .36, 1] }} />}<span>{t[value]}</span></button>)}</div>
        <label className="trade-amount-label" htmlFor="trade-amount">{side === 'buy' ? t.buyAmount : t.sellAmount}</label>
        <div className="trade-amount-field"><input id="trade-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /><span>{side === 'buy' ? 'USDT' : asset.symbol}</span></div>
        <div className="trade-sheet-row"><span>{t.receive}</span><strong>{quote && !quoteExpired ? `${displayQuantity(quote.outputAmount)} ${quote.outputSymbol}` : quoteStatus}</strong></div>
        {quote && <div className="trade-sheet-row"><span>{t.route}</span><strong>{quote.vendor}</strong></div>}
        <div className="trade-sheet-row"><span>{t.wallet}</span><strong>{address ? `${address.slice(0, 8)}…${address.slice(-6)}` : t.noBalance}</strong></div>
        {side === 'sell' && <div className="trade-sheet-row"><span>{t.balanceLabel}</span><strong>{address ? t.balance : t.noBalance}</strong></div>}
        <div className="trade-sheet-status" role="status" aria-live="polite"><span>{quoteStatus}</span><span>BNB SMART CHAIN</span></div>
        {quoteError && <p role="alert" className="trade-sheet-error">{quoteError}</p>}
        <button type="button" className={`trade-submit trade-${side}`} disabled={quoteState === 'loading' || (authenticated && !validAmount)} onClick={requestQuote}>{!authenticated ? t.login : quoteState === 'loading' ? t.gettingQuote : t.getQuote}</button>
        <p id="trade-sheet-note" className="trade-sheet-note">{t.sheetNote}</p>
      </motion.section>
    </div>}</AnimatePresence>
  </section>
}
