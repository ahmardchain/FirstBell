import { BSC_USDT } from './funding.ts'

export type PaymentToken = 'USDT'
export const isPaymentToken = (value: unknown): value is PaymentToken => value === 'USDT'
export const tradeCash = (_token: PaymentToken = 'USDT') => BSC_USDT
