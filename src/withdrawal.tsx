import { amountForInput, amountFromInput, localeFor, localized, text, type Language } from '../lib/i18n'
import * as React from 'react'
import { ArrowLeft, ArrowUpRight, Check, LoaderCircle } from 'lucide-react'
import { parseUnits } from 'viem'
import { withdrawalInput } from '../lib/withdrawal.ts'
import { displayQuantity } from './wallet-balances'
import type { WithdrawalController } from './withdrawals-api'
import './withdrawal.css'

const copy = {
  en: {
    title: 'Withdraw', back: 'Back', amount: 'Amount', available: 'Available', max: 'Max', recipient: 'Receiving address',
    addressHint: 'Enter the wallet or exchange address that receives USDT on BNB Smart Chain (BEP20).',
    network: 'Network', fee: 'Network fee', sponsored: 'Sponsored', estimated: 'estimated', review: 'Review withdrawal',
    reviewTitle: 'Review withdrawal', confirm: 'Confirm withdrawal', cancel: 'Cancel', edit: 'Edit details',
    processing: 'Processing', processingNote: 'Waiting for your USDT transfer to be confirmed.', signing: 'Confirming withdrawal…', preparing: 'Checking withdrawal…',
    completed: 'Withdrawn', completedNote: 'Your USDT transfer is confirmed on BNB Smart Chain.',
    failed: 'Withdrawal failed', failedNote: 'The transaction reverted. Your USDT was not transferred.',
    unknown: 'Confirmation pending', unknownNote: 'Check this transaction before starting another withdrawal.',
    tx: 'View transaction', check: 'Check transaction', retry: 'Retry same withdrawal', done: 'Done', fresh: 'New withdrawal',
    expires: 'Review expired. Check the details again.', cash: 'Withdrawals use your available USDT. Sell stock holdings to USDT first if needed.',
    errors: {
      invalid_recipient: 'Enter a valid receiving address on BNB Smart Chain.', invalid_amount: 'Enter a positive USDT amount with up to 18 decimal places.',
      insufficient_balance: 'There is not enough USDT in your wallet.', insufficient_gas: 'There is not enough BNB for this network fee.',
      sponsorship_not_configured: 'Network fee coverage is not available. No withdrawal was sent.', sponsorship_rejected: 'Network fee coverage was declined. No withdrawal was sent.',
      sponsorship_unavailable: 'Network fee coverage is temporarily unavailable. Retry the review.', withdrawal_expired: 'This review expired. Review the withdrawal again.',
      withdrawal_nonce_changed: 'Wallet activity changed. Review the withdrawal again.', wallet_rejected: 'Confirmation cancelled. No withdrawal was sent.',
      withdrawal_not_configured: 'Withdrawals need server configuration.', unauthorized: 'Sign in again to continue.',
      wallet_not_verified: 'Your wallet could not be verified. Sign in again.', wallet_verification_not_configured: 'Wallet verification needs server configuration.',
      wallet_verification_unavailable: 'Wallet verification is temporarily unavailable.', rate_limited: 'Please wait a minute and try again.',
      withdrawal_simulation_failed: 'This USDT transfer could not be verified. No withdrawal was sent.',
      withdrawal_timeout: 'Confirmation is taking longer. Check this same transaction.', withdrawal_submission_unknown: 'The transfer is not confirmed yet. Check this same transaction.',
      withdrawal_recovery_unavailable: 'The saved withdrawal could not be read. Check your wallet transactions before withdrawing again.',
      withdrawal_attempt_mismatch: 'This withdrawal conflicts with a saved transaction. Check the saved transaction.',
    }, fallback: 'Could not complete this request. Please try again.',
  },
  zh: {
    title: '提现', back: '返回', amount: '金额', available: '可用', max: '全部', recipient: '接收地址', addressHint: '请输入支持 BNB 智能链（BEP20）USDT 的钱包或交易所地址。',
    network: '网络', fee: '网络费', sponsored: '已赞助', estimated: '预计', review: '审核提现', reviewTitle: '审核提现', confirm: '确认提现', cancel: '取消', edit: '修改详情',
    processing: '处理中', processingNote: '正在等待 USDT 转账确认。', signing: '正在确认提现…', preparing: '正在检查提现…',
    completed: '已提现', completedNote: 'USDT 转账已在 BNB 智能链上确认。', failed: '提现失败', failedNote: '交易已回退，USDT 未转出。',
    unknown: '等待确认', unknownNote: '开始新提现前，请查询这笔交易。', tx: '查看交易', check: '查询交易', retry: '重试同一笔提现', done: '完成', fresh: '新提现',
    expires: '审核已过期，请重新检查详情。', cash: '提现使用可用 USDT。如需提取股票资产，请先卖出为 USDT。',
    errors: {
      invalid_recipient: '请输入有效的 BNB 智能链接收地址。', invalid_amount: '请输入大于零、最多 18 位小数的 USDT 金额。', insufficient_balance: '钱包中的 USDT 不足。',
      insufficient_gas: '钱包中的 BNB 不足以支付网络费。', sponsorship_not_configured: '网络费代付尚不可用，未发送提现。', sponsorship_rejected: '网络费代付被拒绝，未发送提现。',
      sponsorship_unavailable: '网络费代付暂不可用，请重新审核。', withdrawal_expired: '审核已过期，请重新审核提现。', withdrawal_nonce_changed: '钱包活动已改变，请重新审核提现。',
      wallet_rejected: '已取消确认，未发送提现。', withdrawal_not_configured: '提现需要服务器配置。', unauthorized: '请重新登录。', wallet_not_verified: '无法验证钱包，请重新登录。',
      wallet_verification_not_configured: '钱包验证需要服务器配置。', wallet_verification_unavailable: '钱包验证暂不可用。', rate_limited: '请等待一分钟后重试。',
      withdrawal_simulation_failed: '无法核实此 USDT 转账，未发送提现。',
      withdrawal_timeout: '确认较慢，请查询同一笔交易。', withdrawal_submission_unknown: '转账尚未确认，请查询同一笔交易。',
      withdrawal_recovery_unavailable: '无法读取已保存的提现，请先查询钱包交易记录。', withdrawal_attempt_mismatch: '提现与已保存的交易冲突，请查询原交易。',
    }, fallback: '无法完成请求，请重试。',
  },
}

export function WithdrawalPage({ address, balance, language, controller, onBack }: {
  address: string; balance: string | null; language: Language; controller: WithdrawalController; onBack: () => void
}) {
  const t = localized(copy, language), { phase, plan, result, error, busy, locked, expired } = controller
  const [amount, setAmount] = React.useState(''), [recipient, setRecipient] = React.useState('')
  const titleRef = React.useRef<HTMLHeadingElement>(null)
  React.useEffect(() => { titleRef.current?.focus() }, [phase])
  let valid = false, tooMuch = false
  try {
    const input = withdrawalInput({ walletAddress: address, recipient, amount })
    tooMuch = balance !== null && BigInt(input.rawAmount) > parseUnits(balance, 18)
    valid = balance !== null && !tooMuch
  } catch { /* Keep the form editable until the address and amount are complete. */ }
  const message = t.errors[error as keyof typeof t.errors] ?? t.fallback
  const editing = phase === 'edit' || phase === 'preparing'
  const reviewing = phase === 'review'
  const terminal = phase === 'completed' || phase === 'failed'
  const back = () => { if (locked || terminal) onBack(); else { controller.reset(); onBack() } }
  return <div className="funding-page withdrawal-page">
    <div className="funding-page-head"><button type="button" aria-label={t.back} disabled={phase === 'signing'} onClick={back}><ArrowLeft size={21} /></button><h1 ref={titleRef} tabIndex={-1}>{reviewing ? t.reviewTitle : t.title}</h1></div>
    <div className="withdrawal-content">
      <div className="withdrawal-asset"><img src="/assets/funding/usdt.svg" alt="" /><span><strong>USDT</strong><small>BNB Smart Chain · BEP20</small></span></div>
      {editing ? <form onSubmit={event => { event.preventDefault(); if (valid && !busy) void controller.review(recipient, amount) }}>
        <label className="withdrawal-field"><span>{t.amount}</span><div className="withdrawal-amount"><input aria-label={t.amount} type="text" inputMode="decimal" autoComplete="off" value={amountForInput(amount, language)} disabled={busy} onChange={event => setAmount(amountFromInput(event.target.value, language))} placeholder={amountForInput("0.00", language)} /><span>USDT</span><button type="button" disabled={busy || balance === null || balance === '0'} onClick={() => setAmount(balance ?? '')}>{t.max}</button></div></label>
        <p className="withdrawal-available">{t.available}: {balance === null ? '…' : displayQuantity(balance, 8, localeFor(language))} USDT</p>
        <label className="withdrawal-field"><span>{t.recipient}</span><input className="withdrawal-address-input" aria-describedby="withdrawal-address-hint" placeholder={text(language, "0x…")} value={recipient} disabled={busy} autoComplete="off" autoCapitalize="off" spellCheck={false} onChange={event => setRecipient(event.target.value)} /></label>
        <p id="withdrawal-address-hint" className="withdrawal-note">{t.addressHint}</p>
        {tooMuch && <p className="deposit-error" role="alert">{t.errors.insufficient_balance}</p>}
        {error && <p className="deposit-error" role="alert">{message}</p>}
        <button type="submit" className="deposit-primary" disabled={!valid || busy}>{busy && <LoaderCircle size={18} className="deposit-spinner" />}{busy ? t.preparing : t.review}</button>
        <p className="withdrawal-note">{t.cash}</p>
      </form> : <>
        {!reviewing && <div className="withdrawal-state" role="status">
          <span className="withdrawal-state-icon">{phase === 'completed' ? <Check size={27} /> : phase === 'uncertain' || phase === 'failed' ? <ArrowUpRight size={27} /> : <LoaderCircle size={27} className="deposit-spinner" />}</span>
          <h2>{phase === 'completed' ? t.completed : phase === 'failed' ? t.failed : phase === 'uncertain' ? t.unknown : phase === 'signing' ? t.signing : t.processing}</h2>
          <p>{phase === 'completed' ? t.completedNote : phase === 'failed' ? t.failedNote : phase === 'uncertain' ? t.unknownNote : t.processingNote}</p>
        </div>}
        {plan && <dl className="withdrawal-review"><div><dt>{t.amount}</dt><dd>{amountForInput(plan.amount, language)} USDT</dd></div><div><dt>{t.recipient}</dt><dd className="withdrawal-destination">{plan.recipient}</dd></div><div><dt>{t.network}</dt><dd>BNB Smart Chain (BEP20)</dd></div><div><dt>{t.fee}</dt><dd>{plan.sponsored ? t.sponsored : `${amountForInput(plan.networkFeeBnb, language)} BNB · ${t.estimated}`}</dd></div></dl>}
        {error && <p className="deposit-error" role="alert">{message}</p>}
        {reviewing && <>
          {expired && <p className="deposit-error" role="alert">{t.expires}</p>}
          <button type="button" className="deposit-primary" disabled={expired || busy} onClick={() => void controller.confirm()}>{t.confirm}</button>
          <button type="button" className="deposit-secondary" onClick={controller.reset}>{expired ? t.edit : t.cancel}</button>
        </>}
        {result?.hash && <a className="deposit-receipt" href={`https://bscscan.com/tx/${result.hash}`} target="_blank" rel="noopener noreferrer">{t.tx}<ArrowUpRight size={15} /></a>}
        {phase === 'uncertain' && <><button type="button" className="deposit-primary" disabled={busy || !controller.canRecover} onClick={() => void controller.recover()}>{busy && <LoaderCircle size={18} className="deposit-spinner" />}{t.check}</button><button type="button" className="deposit-secondary" disabled={busy || !controller.canRecover} onClick={() => void controller.recover(true)}>{t.retry}</button>{!controller.canRecover && <a className="deposit-receipt" href={`https://bscscan.com/address/${address}`} target="_blank" rel="noopener noreferrer">{t.tx}<ArrowUpRight size={15} /></a>}</>}
        {terminal && <><button type="button" className="deposit-primary" onClick={back}>{t.done}</button><button type="button" className="deposit-secondary" onClick={controller.reset}>{t.fresh}</button></>}
      </>}
    </div>
  </div>
}
