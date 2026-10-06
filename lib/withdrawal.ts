import { encodeFunctionData, erc20Abi, formatUnits, getAddress, isAddress, parseUnits, zeroAddress, type Address, type Hex } from 'viem'
import { BSC_USDT } from './funding.ts'

export type WithdrawalInput = { walletAddress: string; recipient: string; amount: string }
export type WithdrawalPlan = WithdrawalInput & {
  id: string; chainId: 56; tokenAddress: Address; rawAmount: string; data: Hex;
  gas: string; gasPrice: string; nonce: number; sponsored: boolean; networkFeeBnb: string;
  expiresAt: string; planToken: string;
}
export type WithdrawalStatus = 'not_submitted' | 'pending' | 'confirming' | 'completed' | 'failed' | 'unknown'
export type WithdrawalResult = { hash: Hex; status: WithdrawalStatus }
export type WithdrawalAttempt = { plan: WithdrawalPlan; rawTransaction: Hex }
export const sameAddress = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()

export function withdrawalInput(value: WithdrawalInput): WithdrawalInput & { rawAmount: string; data: Hex } {
  if (typeof value.walletAddress !== 'string' || !isAddress(value.walletAddress)) throw new Error('invalid_wallet')
  if (typeof value.recipient !== 'string' || !isAddress(value.recipient.trim())) throw new Error('invalid_recipient')
  const walletAddress = getAddress(value.walletAddress), recipient = getAddress(value.recipient.trim())
  if ([zeroAddress, walletAddress, BSC_USDT.address].some(address => sameAddress(recipient, address))) throw new Error('invalid_recipient')
  if (typeof value.amount !== 'string' || !/^(?:0|[1-9]\d{0,17})(?:\.\d{1,18})?$/.test(value.amount)) throw new Error('invalid_amount')
  const raw = parseUnits(value.amount, BSC_USDT.decimals)
  if (raw <= 0n) throw new Error('invalid_amount')
  return { walletAddress, recipient, amount: formatUnits(raw, BSC_USDT.decimals), rawAmount: raw.toString(),
    data: encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [recipient, raw] }) }
}

export function validateWithdrawalPlan(value: unknown, input: WithdrawalInput): WithdrawalPlan {
  const expected = withdrawalInput(input), plan = value as WithdrawalPlan
  try {
    if (!plan || !/^[a-f0-9-]{36}$/.test(plan.id) || plan.chainId !== 56 || !sameAddress(plan.tokenAddress, BSC_USDT.address)
      || !sameAddress(plan.walletAddress, expected.walletAddress) || !sameAddress(plan.recipient, expected.recipient)
      || plan.amount !== expected.amount || plan.rawAmount !== expected.rawAmount || plan.data?.toLowerCase() !== expected.data.toLowerCase()
      || typeof plan.gas !== 'string' || !/^\d{1,6}$/.test(plan.gas) || BigInt(plan.gas) < 21_000n || BigInt(plan.gas) > 200_000n
      || typeof plan.gasPrice !== 'string' || !/^\d{1,12}$/.test(plan.gasPrice) || BigInt(plan.gasPrice) > 20_000_000_000n
      || !Number.isSafeInteger(plan.nonce) || plan.nonce < 0 || typeof plan.sponsored !== 'boolean'
      || (plan.sponsored ? plan.gasPrice !== '0' : BigInt(plan.gasPrice) === 0n)
      || plan.networkFeeBnb !== formatUnits(BigInt(plan.gas) * BigInt(plan.gasPrice), 18)
      || !Number.isFinite(Date.parse(plan.expiresAt)) || typeof plan.planToken !== 'string' || !plan.planToken || plan.planToken.length > 8_000) throw new Error('plan')
  } catch { throw new Error('invalid_withdrawal_plan') }
  return plan
}

export function validateWithdrawalResult(value: unknown, hash: Hex): WithdrawalResult {
  const result = value as WithdrawalResult
  if (!result || !sameAddress(result.hash, hash) || !['not_submitted', 'pending', 'confirming', 'completed', 'failed', 'unknown'].includes(result.status)) throw new Error('withdrawal_submission_unknown')
  return result
}
