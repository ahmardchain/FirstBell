import type { WithdrawalPlan, WithdrawalResult } from './withdrawal.ts'
import { notifyWalletActivity } from './trade-storage.ts'

type Store = Pick<Storage, 'getItem' | 'setItem'>
export type WithdrawalRecord = { hash: string; amount: string; recipient: string; status: WithdrawalResult['status']; recordedAt: string }
const key = (owner: string) => `firstbell-withdrawal-history:v1:${owner.toLowerCase()}`
export function readWithdrawalHistory(storage: Store, owner: string): WithdrawalRecord[] {
  try {
    const raw: unknown = JSON.parse(storage.getItem(key(owner)) ?? '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((item): item is WithdrawalRecord => item && /^0x[a-fA-F0-9]{64}$/.test(item.hash)
      && /^\d+(?:\.\d+)?$/.test(item.amount) && /^0x[a-fA-F0-9]{40}$/.test(item.recipient)
      && ['not_submitted', 'pending', 'confirming', 'completed', 'failed', 'unknown'].includes(item.status)
      && Number.isFinite(Date.parse(item.recordedAt))).slice(-100)
  } catch { return [] }
}
export function storeWithdrawalHistory(storage: Store, plan: WithdrawalPlan, result: WithdrawalResult) {
  const records = readWithdrawalHistory(storage, plan.walletAddress)
  const previous = records.find(item => item.hash.toLowerCase() === result.hash.toLowerCase())
  const next: WithdrawalRecord = { hash: result.hash, amount: plan.amount, recipient: plan.recipient,
    status: previous?.status === 'completed' ? 'completed' : result.status, recordedAt: previous?.recordedAt ?? new Date().toISOString() }
  storage.setItem(key(plan.walletAddress), JSON.stringify([...records.filter(item => item.hash.toLowerCase() !== next.hash.toLowerCase()), next].slice(-100)))
  notifyWalletActivity(plan.walletAddress)
}
