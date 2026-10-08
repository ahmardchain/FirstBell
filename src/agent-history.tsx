import * as React from 'react'
import { ExternalLink, Trash2 } from 'lucide-react'
import { agentHistoryCopy } from '../lib/agent-history-copy'
import type { AgentHistory } from '../lib/agent-history'
import type { AgentOrder } from '../lib/agent-trading'
import { orderAmounts } from '../lib/portfolio-performance'
import { localeFor, type Language } from '../lib/i18n'
import { displayQuantity } from './wallet-balances'

export function AgentHistoryPanel({ history, orders, language, locked, failed, onSelect, onDelete }: {
  history: AgentHistory; orders: AgentOrder[]; language: Language; locked: boolean; failed: boolean; onSelect: (id: string) => void; onDelete: (id: string) => void
}) {
  const t = agentHistoryCopy[language], locale = localeFor(language)
  const [tab, setTab] = React.useState<'conversations' | 'orders'>('conversations')
  const conversations = [...history.conversations].filter(c => c.messages.length).reverse()
  const state = (s: AgentOrder['status']) => s === 'FILLED' ? t.filled : s === 'FAILED' ? t.failed : s === 'EXPIRED' ? t.expired : s === 'CANCELLED' ? t.cancelled : s === 'CONFIRMING' ? t.confirming : t.pending
  const choose = (next: typeof tab) => { setTab(next); document.getElementById(`agent-history-${next}`)?.focus() }
  return <section id="agent-history-panel" className="agent-history-panel" aria-label={t.history}>
    <div className="agent-history-tabs" role="tablist" aria-label={t.history} onKeyDown={event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); choose(event.key === 'Home' ? 'conversations' : event.key === 'End' ? 'orders' : tab === 'orders' ? 'conversations' : 'orders') }
    }}>{(['conversations', 'orders'] as const).map(value => <button key={value} id={`agent-history-${value}`} type="button" role="tab" aria-selected={tab === value} aria-controls="agent-history-list" tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)}>{t[value]}</button>)}</div>
    <div id="agent-history-list" className="agent-history-list" role="tabpanel" aria-labelledby={`agent-history-${tab}`} tabIndex={0}>
      {tab === 'conversations' ? conversations.length ? conversations.map(c => {
        const title = c.messages.find(m => m.role === 'user')?.text ?? c.messages[0].text
        return <div className="agent-history-conversation" key={c.id} data-current={c.id === history.activeId}>
          <button type="button" disabled={locked} onClick={() => onSelect(c.id)} aria-current={c.id === history.activeId ? 'true' : undefined} title={title}><strong>{title}</strong><time dateTime={c.updatedAt}>{new Date(c.updatedAt).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></button>
          <button type="button" className="agent-history-delete" disabled={locked} onClick={() => onDelete(c.id)} aria-label={`${t.remove}: ${title}`} title={t.remove}><Trash2 size={16} /></button>
        </div>
      }) : <p>{t.empty}</p> : orders.length ? [...orders].reverse().map(order => {
        const amounts = orderAmounts(order)
        return <article className="agent-history-order" key={order.orderId}>
          <div><strong>{order.trade ? `${order.trade.side === 'buy' ? t.buy : t.sell} ${order.trade.symbol}` : order.orderId.slice(0, 12)}</strong><span data-status={order.status}>{state(order.status)}</span></div>
          {order.trade && <p>{displayQuantity(order.inputAmount ?? order.trade.amount, 8, locale)} {order.trade.inputSymbol}</p>}
          {amounts && <small>{amounts.estimated ? t.estimated : t.received} · {amounts.output ? `${displayQuantity(amounts.output, 8, locale)} ${amounts.outputSymbol}` : t.missing}</small>}
          {order.txHash && <a href={`https://bscscan.com/tx/${order.txHash}`} target="_blank" rel="noreferrer">BscScan<ExternalLink size={13} /></a>}
        </article>
      }) : <p>{t.noOrders}</p>}
    </div>
    <p className="agent-history-note" role={failed ? 'status' : undefined}>{failed ? t.unsaved : t.saved}</p>
  </section>
}
