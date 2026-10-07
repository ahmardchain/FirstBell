import { ArrowDownLeft, ArrowRightLeft, ArrowUpRight, RefreshCw } from 'lucide-react'
import type { AgentOrder } from '../lib/agent-trading'
import { orderAmounts, type CashTransfer } from '../lib/portfolio-performance'
import type { WithdrawalRecord } from '../lib/withdrawal-history'
import { DepositHistory } from './deposit'
import type { DepositController } from './deposits-api'
import type { CashActivityController } from './portfolio-data'
import { displayQuantity } from './wallet-balances'

export function PortfolioActivity({ orders, withdrawals, cash, deposits, language, search, hidden, orderError, onDeposit, onWithdraw }: {
  orders: AgentOrder[]; withdrawals: WithdrawalRecord[]; cash?: CashActivityController; deposits?: DepositController;
  language: 'en' | 'zh'; search: string; hidden: boolean; orderError?: boolean; onDeposit: (id: string) => void; onWithdraw: () => void
}) {
  const zh = language === 'zh', query = search.trim().toLowerCase()
  const t = zh ? { deposit: '充值', withdrawal: '提现', buy: '买入', sell: '卖出', trade: '交易', filled: '已成交', pending: '等待确认', settling: '结算中',
    cancelled: '已取消', failed: '失败', expired: '已过期', unknown: '正在核实', confirmed: '已确认', notSent: '未发送',
    received: '收到', expected: '预计收到', receipt: '查看交易', date: '时间未记录', empty: '暂无活动',
    unavailable: '部分活动暂不可用，已保存的记录仍在显示。', retry: '重试', more: '加载更多', checking: '查询中…', note: '链上转账来自最近六个月的记录；订单和提现保存在此设备。' }
    : { deposit: 'Deposit', withdrawal: 'Withdrawal', buy: 'Buy', sell: 'Sell', trade: 'Trade', filled: 'Filled', pending: 'Pending', settling: 'Settling',
      cancelled: 'Cancelled', failed: 'Failed', expired: 'Expired', unknown: 'Checking outcome', confirmed: 'Confirmed', notSent: 'Not sent',
      received: 'Received', expected: 'Estimated receive', receipt: 'View transaction', date: 'Time not recorded', empty: 'No activity yet',
      unavailable: 'Some activity is unavailable. Saved records are still shown.', retry: 'Retry', more: 'Load more', checking: 'Checking…', note: 'On-chain transfers cover the last 6 months; orders and withdrawals are saved on this device.' }
  const date = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString(zh ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : t.date
  const quantity = (value: string, symbol = 'USDT') => hidden ? '••••••' : `${displayQuantity(value, 8)} ${symbol}`
  const orderStatus = (status: AgentOrder['status']) => status === 'FILLED' ? t.filled : status === 'CONFIRMING' ? t.settling : status === 'CANCELLED' ? t.cancelled
    : status === 'FAILED' ? t.failed : status === 'EXPIRED' ? t.expired : t.pending
  const withdrawalStatus = (status: WithdrawalRecord['status']) => status === 'completed' ? t.confirmed : status === 'failed' ? t.failed
    : status === 'not_submitted' ? t.notSent : status === 'unknown' ? t.unknown : t.pending
  const knownHashes = new Set([...orders.map(order => order.txHash), ...withdrawals.map(item => item.hash)].filter(Boolean).map(hash => hash!.toLowerCase()))
  const sessions = deposits?.sessions ?? []
  const cardHashes = new Set(sessions.filter(session => session.mode === 'live').map(session => session.transactionHash?.toLowerCase()).filter(Boolean))
  const transfers = (cash?.transfers ?? []).filter(item => !knownHashes.has(item.hash.toLowerCase()) && !cardHashes.has(item.hash.toLowerCase()))
  type Entry = { id: string; at?: string; type: 'order'; order: AgentOrder }
    | { id: string; at: string; type: 'withdrawal'; withdrawal: WithdrawalRecord }
    | { id: string; at: string; type: 'transfer'; transfer: CashTransfer }
    | { id: string; at: string; type: 'card'; session: typeof sessions[number] }
  const entries: Entry[] = [
    ...orders.map(order => ({ id: `order:${order.orderId}`, at: order.createdAt ?? order.recordedAt, type: 'order' as const, order })),
    ...withdrawals.map(withdrawal => ({ id: `withdrawal:${withdrawal.hash}`, at: withdrawal.recordedAt, type: 'withdrawal' as const, withdrawal })),
    ...transfers.map(transfer => ({ id: `transfer:${transfer.id}`, at: transfer.createdAt, type: 'transfer' as const, transfer })),
    ...sessions.map(session => ({ id: `card:${session.id}`, at: session.createdAt, type: 'card' as const, session })),
  ].filter(entry => {
    const text = entry.type === 'order' ? `${t.trade} ${entry.order.trade?.side === 'buy' ? `${t.buy} buy` : `${t.sell} sell`} ${entry.order.trade?.symbol} ${entry.order.trade?.amount} ${orderStatus(entry.order.status)}`
      : entry.type === 'withdrawal' ? `${t.withdrawal} withdrawal USDT ${entry.withdrawal.amount} ${entry.withdrawal.recipient} ${withdrawalStatus(entry.withdrawal.status)}`
      : entry.type === 'transfer' ? `${entry.transfer.kind === 'deposit' ? t.deposit : t.withdrawal} ${entry.transfer.kind} USDT ${entry.transfer.amount} ${entry.transfer.status}`
      : `${t.deposit} deposit ${entry.session.provider ?? 'moonpay'} ${entry.session.amount} ${entry.session.fiatCurrency} ${entry.session.receivedAmount ?? ''} USDT ${entry.session.status}`
    return text.toLowerCase().includes(query)
  }).sort((a, b) => (b.at ? Date.parse(b.at) : 0) - (a.at ? Date.parse(a.at) : 0))
  const hasError = cash?.error || orderError || deposits?.error
  return <div className="portfolio-activity" aria-live="polite">
    {hasError && <div className="portfolio-activity-error" role="status"><p>{t.unavailable}</p>{cash?.error && <button type="button" disabled={cash.loading} onClick={() => void cash.refresh()}><RefreshCw size={15} />{t.retry}</button>}</div>}
    {entries.map(entry => {
      if (entry.type === 'card') return <DepositHistory key={entry.id} controller={deposits!} language={language} onOpen={onDeposit} sessions={[entry.session]} hidden={hidden} />
      let title: string, amount: string, detail: string, status: string, hash: string | null | undefined
      if (entry.type === 'order') {
        const order = entry.order, values = orderAmounts(order)
        title = `${t.trade} · ${order.trade?.side === 'sell' ? t.sell : t.buy} ${order.trade?.symbol ?? ''}`
        amount = values?.input ? quantity(values.input, values.inputSymbol) : '—'
        detail = values ? `${values.estimated ? t.expected : t.received} · ${values.output ? quantity(values.output, values.outputSymbol) : '—'}` : order.orderId
        status = orderStatus(order.status); hash = order.txHash
      } else if (entry.type === 'withdrawal') {
        title = t.withdrawal; amount = quantity(entry.withdrawal.amount); status = withdrawalStatus(entry.withdrawal.status); hash = entry.withdrawal.hash
        detail = `${entry.withdrawal.recipient.slice(0, 6)}…${entry.withdrawal.recipient.slice(-4)}`
      } else {
        title = entry.transfer.kind === 'deposit' ? t.deposit : t.withdrawal; amount = quantity(entry.transfer.amount)
        detail = `${entry.transfer.counterparty.slice(0, 6)}…${entry.transfer.counterparty.slice(-4)}`
        status = entry.transfer.status === 'success' ? t.confirmed : entry.transfer.status === 'fail' ? t.failed : t.pending; hash = entry.transfer.hash
      }
      const Icon = entry.type === 'order' ? ArrowRightLeft : entry.type === 'transfer' && entry.transfer.kind === 'deposit' ? ArrowDownLeft : ArrowUpRight
      return <article className="portfolio-activity-row" key={entry.id} aria-label={title}>
        <span className="portfolio-activity-icon"><Icon size={19} aria-hidden="true" /></span>
        <div className="portfolio-activity-main"><strong>{title}</strong><span title={hidden ? undefined : amount}>{amount}</span><small>{detail}</small></div>
        <div className="portfolio-activity-meta"><span>{status}</span><time dateTime={entry.at}>{date(entry.at)}</time></div>
        <div className="portfolio-activity-actions">
          {entry.type === 'withdrawal' && ['unknown', 'pending', 'confirming'].includes(entry.withdrawal.status) && <button type="button" onClick={onWithdraw}>{zh ? '查询提现' : 'Check withdrawal'}</button>}
          {hash && <a href={`https://bscscan.com/tx/${hash}`} target="_blank" rel="noreferrer">{t.receipt}<ArrowUpRight size={13} /></a>}
        </div>
      </article>
    })}
    {!entries.length && <div className="portfolio-content-empty" role="status">{cash?.loading || deposits?.loading ? zh ? '加载中…' : 'Loading…' : hasError ? t.unavailable : t.empty}</div>}
    {cash?.cursor && <button className="portfolio-activity-more" type="button" disabled={cash.loading} onClick={() => void cash.more()}>{cash.loading ? t.checking : t.more}</button>}
    {entries.length > 0 && <p className="portfolio-activity-note">{t.note}</p>}
  </div>
}
