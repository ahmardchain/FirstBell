import { createPublicClient, erc20Abi, formatUnits, http, isAddress, type Address } from 'viem'
import { bsc } from 'viem/chains'

const client = createPublicClient({
  chain: bsc,
  transport: http('https://bsc-dataseed.bnbchain.org', { timeout: 12_000, retryCount: 2 }),
})

export type TokenPosition = { symbol: string; address: Address; quantity: string; raw: bigint }
export type WalletBalances = { bnb: string; tokens: TokenPosition[]; checkedAt: Date }

export async function readWalletBalances(walletAddress: string, tokens: { symbol: string; address: string }[]): Promise<WalletBalances> {
  if (!isAddress(walletAddress)) throw new Error('Invalid wallet address')
  if (tokens.some(token => !isAddress(token.address))) throw new Error('Invalid token contract')
  const owner = walletAddress as Address
  const [native, ...tokenValues] = await Promise.all([
    client.getBalance({ address: owner }),
    ...tokens.map(async token => {
      const address = token.address as Address
      const [raw, decimals] = await Promise.all([
        client.readContract({ address, abi: erc20Abi, functionName: 'balanceOf', args: [owner] }),
        client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
      ])
      return { symbol: token.symbol, address, raw, quantity: formatUnits(raw, decimals) }
    }),
  ])
  return { bnb: formatUnits(native, 18), tokens: tokenValues, checkedAt: new Date() }
}

export function displayQuantity(value: string, places = 6) {
  const [whole, fraction = ''] = value.split('.')
  if (whole === '0' && fraction.slice(0, places).replace(/0/g, '') === '' && /[1-9]/.test(fraction.slice(places))) return `<0.${'0'.repeat(places - 1)}1`
  const trimmed = fraction.slice(0, places).replace(/0+$/, '')
  return `${whole}${trimmed ? `.${trimmed}` : ''}`
}
