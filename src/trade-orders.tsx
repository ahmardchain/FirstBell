import * as React from 'react'
import { ExternalLink, LoaderCircle, X } from 'lucide-react'
import { openOrder, terminalOrder, type AgentOrder } from '../lib/agent-trading'
import type { SignedTradeAttempt } from '../lib/trade-execution'
import { orderAmounts } from '../lib/portfolio-performance'
import { displayQuantity } from './wallet-balances'

const words = {
  en: { orders: 'Orders', open: 'Open orders', history: 'Order history', noOpen: 'No open orders.', noHistory: 'No completed orders on this device yet.',
    saved: 'History saved on this device.', buy: 'Buy', sell: 'Sell', pending: 'Open · awaiting fill', settling: 'Settling', filled: 'Filled', failed: 'Failed', expired: 'Expired', cancelled: 'Cancelled',
    unknown: 'Checking order outcome', approval: 'Token permission is unconfirmed.', resume: 'Resume order', retryApproval: 'Check token permission', tx: 'View transaction',
    cancel: 'Cancel order', keep: 'Keep order', close: 'Close confirmation', confirmCancel: 'Confirm cancellation', cancelling: 'Cancelling…', requested: 'Cancellation requested · checking',
    unavailable: 'Cancellation unavailable on this route.', race: 'A settlement already underway can still fill.', note: 'Sign with your wallet to request cancellation. A settlement already underway can still fill. A filled order cannot be undone.',
    input: 'Order amount', received: 'Received', expected: 'Estimated receive', unavailableAmount: 'Amount unavailable', attention: 'Needs attention', id: 'Order ID' },
  zh: { orders: '订单', open: '当前订单', history: '订单历史', noOpen: '暂无当前订单。', noHistory: '此设备暂无已完成订单。',
    saved: '历史记录保存在此设备。', buy: '买入', sell: '卖出', pending: '等待成交', settling: '结算中', filled: '已成交', failed: '失败', expired: '已过期', cancelled: '已取消',
    unknown: '正在核实订单结果', approval: '代币授权尚未确认。', resume: '恢复订单', retryApproval: '查询代币授权', tx: '查看交易',
    cancel: '取消订单', keep: '保留订单', close: '关闭确认', confirmCancel: '确认取消', cancelling: '正在取消…', requested: '已请求取消 · 正在查询',
    unavailable: '此路线暂不支持取消。', race: '已开始结算的订单仍可能成交。', note: '在钱包中签名以请求取消。已开始结算的订单仍可能成交，已成交的订单无法撤销。',
    input: '订单数量', received: '已收到', expected: '预计收到', unavailableAmount: '数量暂不可用', attention: '需要处理', id: '订单编号' },
}

export function TradeOrders({ orders, attempts, approvalHash, language, busy, locked, cancelId, cancelFailure, error, onRecover, onCancel }: {
  orders: AgentOrder[]; attempts: SignedTradeAttempt[]; approvalHash?: string; language: 'en' | 'zh'; busy: boolean; locked: boolean; cancelId: string | null; error: string;
  onRecover: (attempt?: SignedTradeAttempt) => void; onCancel: (order: AgentOrder) => void
  cancelFailure: { orderId: string; message: string } | null
}) {
  const t = words[language]
  const [tab, setTab] = React.useState<'open' | 'history'>('open')
  const [review, setReview] = React.useState<AgentOrder | null>(null)
  const dialog = React.useRef<HTMLDialogElement>(null)
  const cancelTrigger = React.useRef<HTMLButtonElement | null>(null)
  const open = orders.filter(openOrder)
  const history = orders.filter(order => !openOrder(order))
  const recoveries = attempts.filter(attempt => !orders.some(order => order.trade?.requestId === attempt.plan.requestId))
  const listed = tab === 'open' ? open : history
  const count = open.length
  React.useEffect(() => {
    const element = dialog.current
    if (!review || !element) return
    element.showModal()
    element.querySelector<HTMLButtonElement>('.trade-cancel')?.focus()
    return () => {
      element.close()
      if (cancelTrigger.current?.isConnected && !cancelTrigger.current.disabled) cancelTrigger.current.focus({ preventScroll: true })
      else document.getElementById(`orders-${tab}-tab`)?.focus({ preventScroll: true })
    }
  }, [review, tab])
  React.useEffect(() => {
    if (review && (locked || !orders.some(order => order.orderId === review.orderId && order.canCancel && !terminalOrder(order.status)))) setReview(null)
  }, [orders, review, locked])
  const status = (order: AgentOrder) => order.status === 'FILLED' ? t.filled : order.status === 'FAILED' ? t.failed : order.status === 'EXPIRED' ? t.expired
    : order.status === 'CANCELLED' ? t.cancelled : order.cancellationRequested ? t.requested : order.status === 'PENDING_VENDOR' ? t.pending : t.settling
  const title = (order: AgentOrder) => order.trade ? `${order.trade.side === 'buy' ? t.buy : t.sell} ${order.trade.symbol}` : `${t.id} · ${order.orderId.slice(0, 10)}…${order.orderId.slice(-4)}`
  const chooseTab = (value: 'open' | 'history') => { setTab(value); document.getElementById(`orders-${value}-tab`)?.focus() }

  return <section className="trade-progress trade-orders" aria-label={t.orders}>
    <div className="trade-progress-heading"><h3>{t.orders}</h3>{busy && <LoaderCircle size={14} className="trade-spinner" aria-hidden="true" />}</div>
    <div className="trade-order-tabs" role="tablist" aria-label={t.orders} onKeyDown={event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); chooseTab(event.key === 'Home' ? 'open' : event.key === 'End' ? 'history' : tab === 'open' ? 'history' : 'open') }
    }}>
      <button id="orders-open-tab" type="button" role="tab" aria-selected={tab === 'open'} aria-controls="orders-panel" tabIndex={tab === 'open' ? 0 : -1} onClick={() => setTab('open')}>{t.open}<span>{count}</span></button>
      <button id="orders-history-tab" type="button" role="tab" aria-selected={tab === 'history'} aria-controls="orders-panel" tabIndex={tab === 'history' ? 0 : -1} onClick={() => setTab('history')}>{t.history}<span>{history.length}</span></button>
    </div>
    <div id="orders-panel" role="tabpanel" aria-labelledby={`orders-${tab}-tab`} tabIndex={0}>
      {[...listed].reverse().map(order => { const amounts = orderAmounts(order); return <article className="trade-progress-record trade-order-record" key={order.orderId} aria-label={title(order)}>
        <div className="trade-order-title"><strong>{title(order)}</strong><span className="trade-order-status" data-status={order.status}>{cancelId === order.orderId ? t.cancelling : status(order)}</span></div>
        {order.trade && <p className="trade-order-amount" title={`${order.inputAmount ?? order.trade.amount} ${order.trade.inputSymbol}`}>{displayQuantity(order.inputAmount ?? order.trade.amount, 8)} {order.trade.inputSymbol}</p>}
        {order.trade && <p className="trade-order-id" title={order.orderId}>{t.id} · {order.orderId.slice(0, 10)}…{order.orderId.slice(-4)}</p>}
        {amounts && <p className="trade-order-output">{amounts.estimated ? t.expected : t.received} · {amounts.output ? `${displayQuantity(amounts.output, 8)} ${amounts.outputSymbol}` : t.unavailableAmount}</p>}
        {order.status === 'CANCELLED' && order.trade?.source === 'cow-protocol' && <p className="trade-order-note">{t.race}</p>}
        <div className="trade-order-actions">
          {order.canCancel && order.status === 'PENDING_VENDOR' && order.trade?.source === 'cow-protocol' && <button type="button" className="trade-order-cancel" disabled={busy || locked || Boolean(approvalHash)} onClick={event => { cancelTrigger.current = event.currentTarget; setReview(order) }}>{t.cancel}</button>}
          {order.txHash && <a href={`https://bscscan.com/tx/${order.txHash}`} target="_blank" rel="noreferrer">{t.tx}<ExternalLink size={13} /></a>}
        </div>
        {!terminalOrder(order.status) && order.trade?.source === 'binance-web3' && <p className="trade-order-note">{t.unavailable}</p>}
        {cancelFailure?.orderId === order.orderId && <p className="trade-sheet-error" role="alert">{cancelFailure.message}</p>}
      </article>})}
      {(tab === 'open' ? count === 0 : history.length === 0) && <p className="trade-order-empty">{tab === 'open' ? t.noOpen : t.noHistory}</p>}
      {tab === 'history' && history.length > 0 && <p className="trade-order-note">{t.saved}</p>}
    </div>
    {(recoveries.length > 0 || approvalHash) && <div className="trade-order-recovery" aria-label={t.attention}>
      <p className="trade-order-note">{t.attention}</p>
      {recoveries.map(attempt => <article className="trade-progress-record trade-order-record" key={attempt.plan.requestId}>
        <div className="trade-order-title"><strong>{attempt.plan.route.side === 'buy' ? t.buy : t.sell} {attempt.plan.route.symbol}</strong><span className="trade-order-status">{t.unknown}</span></div>
        <p className="trade-order-amount">{displayQuantity(attempt.plan.route.inputAmount, 8)} {attempt.plan.route.inputSymbol}</p>
        <p className="trade-order-output">{t.expected} · {displayQuantity(attempt.plan.route.outputAmount, 8)} {attempt.plan.route.outputSymbol}</p>
        <button type="button" className="trade-progress-action" disabled={busy || locked || Boolean(approvalHash)} onClick={() => onRecover(attempt)}>{t.resume}</button>
      </article>)}
      {approvalHash && <div className="trade-progress-record"><p>{t.approval}</p><button type="button" className="trade-progress-action" disabled={busy || locked} onClick={() => onRecover()}>{t.retryApproval}</button><a href={`https://bscscan.com/tx/${approvalHash}`} target="_blank" rel="noreferrer">{t.tx}<ExternalLink size={14} /></a></div>}
    </div>}
    {error && <p className="trade-sheet-error" role="alert">{error}</p>}
    {review && <dialog ref={dialog} className="trade-confirm-popup trade-cancel-dialog" aria-labelledby="cancel-order-heading" aria-describedby="cancel-order-note" onCancel={() => setReview(null)} onClose={() => setReview(null)}>
      <div className="trade-sheet-header"><h2 id="cancel-order-heading">{t.cancel}</h2><button type="button" aria-label={t.close} onClick={() => setReview(null)}><X size={20} /></button></div>
      <strong>{title(review)}</strong>
      <p className="trade-order-id" title={review.orderId}>{t.id} · {review.orderId.slice(0, 10)}…{review.orderId.slice(-4)}</p>
      {review.trade && <div className="trade-sheet-row"><span>{t.input}</span><strong>{review.trade.amount} {review.trade.inputSymbol}</strong></div>}
      <p id="cancel-order-note" className="trade-confirm-note">{t.note}</p>
      <div className="trade-confirm-actions"><button type="button" className="trade-cancel" onClick={() => setReview(null)}>{t.keep}</button><button type="button" className="trade-submit trade-sell" onClick={() => { setReview(null); onCancel(review) }}>{t.confirmCancel}</button></div>
    </dialog>}
  </section>
}
