// Verified against MoonPay's live /v3/currencies catalog on 2026-09-30.
export const BSC_USDT = {
  address: '0x55d398326f99059ff775485246999027b3197955',
  decimals: 18,
  chainId: 56,
  currencyCode: 'usdt_bsc',
  symbol: 'USDT',
  network: 'BNB Smart Chain',
  explorer: 'https://bscscan.com',
} as const

// MoonPay's `eth` currency uses Ethereum metadata in its catalog, but test
// purchases deliver native ETH on Sepolia. It never funds BSC mainnet.
export const SANDBOX_ETH = {
  currencyCode: 'eth',
  decimals: 18,
  chainId: 11155111,
  symbol: 'ETH',
  network: 'Ethereum Sepolia',
  explorer: 'https://sepolia.etherscan.io',
} as const

export type FundingMode = 'sandbox' | 'live'
export type FundingProvider = 'moonpay' | 'onramper'
export type CheckoutCurrency = typeof BSC_USDT.currencyCode | typeof SANDBOX_ETH.currencyCode
export const checkoutAsset = (mode: FundingMode | null | undefined, provider?: FundingProvider) => mode === 'sandbox' && provider !== 'onramper' ? SANDBOX_ETH : BSC_USDT
export type DepositStatus = 'awaiting_payment' | 'action_required' | 'processing' | 'confirming' | 'completed' | 'failed' | 'expired' | 'test_completed'
export type DepositSession = {
  id: string
  customerId: string
  walletAddress: string
  amount: string
  fiatCurrency: string
  // Native checkout chooses its amount and fiat in the provider. Empty until the
  // first correlated provider order; legacy fixed-amount sessions omit this.
  amountSelection?: FundingProvider
  // Missing provider identifies records created before the Onramper migration.
  provider?: FundingProvider
  providerCryptoId?: string
  partnerContext?: string
  providerStatusDate?: string
  expectedAmount?: string | null
  mode: FundingMode
  // Records created before the sandbox extension are BSC USDT sessions.
  currencyCode?: CheckoutCurrency
  status: DepositStatus
  createdAt: string
  checkedAt: string | null
  transactionId: string | null
  transactionHash: string | null
  receivedAmount: string | null
}
export const sessionAsset = (session: DepositSession) => session.currencyCode === 'eth' ? SANDBOX_ETH : BSC_USDT
export type FiatOption = { code: string; name: string; min: number; max: number }
export type DepositConfig = {
  provider?: FundingProvider
  ready: boolean
  mode: FundingMode | null
  reason: string | null
  fiatCurrencies: FiatOption[]
}
export const depositProvider = (session: Pick<DepositSession, 'provider'>): FundingProvider => session.provider ?? 'moonpay'
export function isCheckoutUrl(value: string, session: DepositSession): boolean {
  try {
    const url = new URL(value)
    const host = depositProvider(session) === 'onramper'
      ? session.mode === 'live' ? 'buy.onramper.com' : 'buy.onramper.dev'
      : session.mode === 'live' ? 'buy.moonpay.com' : 'buy-sandbox.moonpay.com'
    return url.protocol === 'https:' && url.hostname === host && !url.username && !url.password && !url.port && url.pathname === '/'
  } catch { return false }
}
export const isDepositTerminal = (status: DepositStatus) =>
  ['completed', 'failed', 'expired', 'test_completed'].includes(status)
