import { createPublicClient, erc20Abi, formatUnits, http, isAddress, type Address } from 'viem'
import { bsc } from 'viem/chains'
import { BSC_USDT } from '../lib/funding.ts'
import { BSC_USDC } from '../lib/trade-assets.ts'

const client = createPublicClient({
  chain: bsc,
  transport: http('https://bsc-dataseed.bnbchain.org', { timeout: 12_000, retryCount: 2 }),
})

export type TokenPosition = { symbol: string; address: Address; quantity: string; raw: bigint }
export type WalletBalances = { bnb: string; usdt: string; usdc: string; tokens: TokenPosition[]; checkedAt: Date }

export async function readWalletBalances(walletAddress: string, tokens: { symbol: string; address: string }[]): Promise<WalletBalances> {
  if (!isAddress(walletAddress)) throw new Error('Invalid wallet address')
  if (tokens.some(token => !isAddress(token.address))) throw new Error('Invalid token contract')
  const owner = walletAddress as Address
  const contracts = [BSC_USDT, BSC_USDC, ...tokens].map(token => ({ address: token.address as Address,
    abi: erc20Abi, functionName: 'balanceOf' as const, args: [owner] as const }))
  const readBalances = async () => {
    const values: bigint[] = []
    // Bounded, sequential multicalls replace two RPCs for every catalog token.
    // A failed contract read remains an error, never a fabricated zero holding.
    for (let start = 0; start < contracts.length; start += 64) {
      values.push(...await client.multicall({ contracts: contracts.slice(start, start + 64), allowFailure: false, batchSize: 32_768 }))
    }
    return values
  }
  const [native, values] = await Promise.all([client.getBalance({ address: owner }), readBalances()])
  const held = tokens.filter((_, index) => values[index + 2] > 0n)
  const decimals = held.length ? await client.multicall({
    contracts: held.map(token => ({ address: token.address as Address, abi: erc20Abi, functionName: 'decimals' as const })),
    allowFailure: false, batchSize: 32_768,
  }) : []
  const units = new Map(held.map((token, index) => [token.address.toLowerCase(), decimals[index]]))
  const positions = tokens.map((token, index) => {
    const raw = values[index + 2]
    return { symbol: token.symbol, address: token.address as Address, raw,
      quantity: raw > 0n ? formatUnits(raw, units.get(token.address.toLowerCase())!) : '0' }
  })
  return { bnb: formatUnits(native, 18), usdt: formatUnits(values[0], BSC_USDT.decimals), usdc: formatUnits(values[1], BSC_USDC.decimals), tokens: positions, checkedAt: new Date() }
}

export function displayQuantity(value: string, places = 6) {
  const [whole, fraction = ''] = value.split('.')
  if (whole === '0' && fraction.slice(0, places).replace(/0/g, '') === '' && /[1-9]/.test(fraction.slice(places))) return `<0.${'0'.repeat(places - 1)}1`
  const trimmed = fraction.slice(0, places).replace(/0+$/, '')
  return `${whole}${trimmed ? `.${trimmed}` : ''}`
}
