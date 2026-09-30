// Verified against MoonPay's live /v3/currencies catalog on 2026-09-30.
export const BSC_USDT = {
  address: '0x55d398326f99059ff775485246999027b3197955',
  decimals: 18,
  chainId: 56,
  currencyCode: 'usdt_bsc',
} as const

export type FundingMode = 'sandbox' | 'live'
export type DepositStatus = 'awaiting_payment' | 'action_required' | 'processing' | 'confirming' | 'completed' | 'failed' | 'expired' | 'test_completed'
export type DepositSession = {
  id: string
  customerId: string
  walletAddress: string
  amount: string
  fiatCurrency: string
  mode: FundingMode
  status: DepositStatus
  createdAt: string
  checkedAt: string | null
  transactionId: string | null
  transactionHash: string | null
  receivedAmount: string | null
}
export type FiatOption = { code: string; name: string; min: number; max: number }
export type DepositConfig = {
  ready: boolean
  mode: FundingMode | null
  reason: string | null
  fiatCurrencies: FiatOption[]
}
export const isDepositTerminal = (status: DepositStatus) =>
  ['completed', 'failed', 'expired', 'test_completed'].includes(status)
