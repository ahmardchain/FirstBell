import { BSC_USDT } from './funding.ts'

// Binance-Peg USDC on BSC, not Ethereum USDC or native Circle USDC.
// The trading server also checks the deployed decimals against this metadata.
export const BSC_USDC = { address: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', decimals: 18, chainId: 56, symbol: 'USDC' } as const
export type PaymentToken = 'USDT' | 'USDC'
export const isPaymentToken = (value: unknown): value is PaymentToken => value === 'USDT' || value === 'USDC'
export const tradeCash = (token: PaymentToken = 'USDT') => token === 'USDC' ? BSC_USDC : BSC_USDT
