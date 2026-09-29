import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, ChartCandlestick, Check, ChevronDown, ExternalLink, X } from 'lucide-react'
import { MarketChart } from '@/components/spectrumui/charts/market-chart'
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
    select: 'Select asset', quote: 'Live quote unavailable', noData: 'No token price history yet',
    noDataBody: 'A verified market feed is needed before candles and prices can be shown.',
    source: 'ASSET RECORD', issuer: 'Issuer', network: 'Network', contract: 'Contract',
    inspect: 'Inspect asset file', scan: 'View contract on BscScan',
    buy: 'Buy', sell: 'Sell', sheetTitle: 'Trade', buyAmount: 'Amount to spend', sellAmount: 'Amount to sell',
    receive: 'Estimated receive', unavailable: 'Quote unavailable', balance: 'Wallet balance unavailable',
    sheetNote: 'Live quotes and order execution are not connected. No payment or trade will be submitted.',
    close: 'Close trade sheet', choose: 'Choose a tokenized equity',
  },
  zh: {
    label: 'FIRSTBELL / 交易', chart: '图表', market: '市场 / BNB 智能链',
    select: '选择资产', quote: '暂无实时报价', noData: '暂无代币价格历史',
    noDataBody: '接入经过核实的行情数据后，才能显示 K 线和价格。',
    source: '资产记录', issuer: '发行方', network: '网络', contract: '合约',
    inspect: '查看资产资料', scan: '在 BscScan 查看合约',
    buy: '买入', sell: '卖出', sheetTitle: '交易', buyAmount: '计划花费', sellAmount: '计划卖出',
    receive: '预计收到', unavailable: '暂无报价', balance: '暂无钱包余额',
    sheetNote: '实时报价与订单执行尚未接入。这里不会收款或提交交易。',
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
  const [side, setSide] = React.useState<Side | null>(null)
  const [amount, setAmount] = React.useState('')
  const sheetRef = React.useRef<HTMLElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement | null>(null)

  const openSheet = (nextSide: Side, event: React.MouseEvent<HTMLButtonElement>) => {
    triggerRef.current = event.currentTarget
    setAmount('')
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
        <AnimatePresence>{selectorOpen && <motion.div id="trade-asset-menu" role="listbox" aria-label={t.choose} className="trade-asset-menu" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .16 }}>
          {assets.map(candidate => <button type="button" role="option" aria-selected={asset.symbol === candidate.symbol} key={candidate.symbol} onClick={() => { onAssetChange(candidate); setSelectorOpen(false) }}><TokenMark asset={candidate} /><span><strong>{candidate.symbol}</strong><small>{candidate.company}</small></span>{candidate.symbol === asset.symbol && <Check size={17} />}</button>)}
        </motion.div>}</AnimatePresence>
      </div>
      <span className="trade-network"><i /> BNB SMART CHAIN</span>
    </div>

    <div className="trade-body">
      <div className="trade-market-panel">
        <div className="trade-tabs"><span className="active"><ChartCandlestick size={17} />{t.chart}</span><span>{t.market}</span></div>
        <div className="trade-quote"><span>{t.quote}</span><strong>—</strong></div>
        <div className="trade-chart" key={asset.symbol}>
          <MarketChart data={[]} symbol={asset.symbol} name={asset.company} status="empty" showRangeSelector={false} height={420} emptyTitle={t.noData} emptyDescription={t.noDataBody} />
        </div>
        <div className="trade-chart-foot"><span>OHLC / {asset.symbol}</span><span>DATA SOURCE / PENDING</span></div>
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

    <div className="trade-action-dock" aria-label={t.sheetTitle}>
      <div className="trade-dock-asset"><TokenMark asset={asset} /><span>{asset.symbol}<small>{t.quote}</small></span></div>
      <div className="trade-dock-buttons"><button type="button" onClick={event => openSheet('buy', event)}>{t.buy}</button><button type="button" onClick={event => openSheet('sell', event)}>{t.sell}</button></div>
    </div>

    <AnimatePresence>{side && <div className="trade-sheet-layer">
      <motion.button className="trade-sheet-scrim" type="button" aria-label={t.close} onClick={() => setSide(null)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <motion.section ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="trade-sheet-heading" className="trade-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 330, damping: 34 }}>
        <div className="trade-sheet-handle" aria-hidden="true" />
        <div className="trade-sheet-header"><div><span>{t.sheetTitle} / {asset.symbol}</span><h2 id="trade-sheet-heading">{side === 'buy' ? t.buy : t.sell} {asset.symbol}</h2></div><button type="button" onClick={() => setSide(null)} aria-label={t.close}><X size={22} /></button></div>
        <div className="trade-sheet-tabs" role="tablist" aria-label={t.sheetTitle}><button type="button" role="tab" aria-selected={side === 'buy'} className={side === 'buy' ? 'active' : ''} onClick={() => { setSide('buy'); setAmount('') }}>{t.buy}</button><button type="button" role="tab" aria-selected={side === 'sell'} className={side === 'sell' ? 'active' : ''} onClick={() => { setSide('sell'); setAmount('') }}>{t.sell}</button></div>
        <label className="trade-amount-label" htmlFor="trade-amount">{side === 'buy' ? t.buyAmount : t.sellAmount}</label>
        <div className="trade-amount-field"><input id="trade-amount" type="number" inputMode="decimal" min="0" step="any" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" /><span>{side === 'buy' ? 'USD' : asset.symbol}</span></div>
        <div className="trade-sheet-row"><span>{t.receive}</span><strong>— {side === 'buy' ? asset.symbol : 'USD'}</strong></div>
        {side === 'sell' && <div className="trade-sheet-row"><span>{t.balance}</span><strong>—</strong></div>}
        <div className="trade-sheet-status"><span>{t.unavailable}</span><span>BNB SMART CHAIN</span></div>
        <button type="button" className="trade-submit" disabled>{t.unavailable}</button>
        <p className="trade-sheet-note">{t.sheetNote}</p>
      </motion.section>
    </div>}</AnimatePresence>
  </section>
}
