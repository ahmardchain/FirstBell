import { createPublicClient, decodeEventLog, erc20Abi, formatUnits, http, parseUnits } from 'viem'
import { bsc } from 'viem/chains'
const client = createPublicClient({ chain: bsc, transport: http('https://bsc-dataseed.bnbchain.org', { timeout: 10_000, retryCount: 0 }) })
export async function verifyBinanceSettlement(row, hash, rpc = client) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash ?? '')) return null
  const [chain, receipt, tip] = await Promise.all([rpc.getChainId(), rpc.getTransactionReceipt({ hash }), rpc.getBlockNumber({ cacheTime: 0 })])
  if (chain !== 56 || receipt.status !== 'success' || receipt.transactionHash.toLowerCase() !== hash.toLowerCase() || tip < receipt.blockNumber + 1n) return null
  const same = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()
  let spent = 0n, received = 0n
  for (const log of receipt.logs) {
    if (!same(log.address, row.fromToken) && !same(log.address, row.toToken)) continue
    try {
      const transfer = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics, eventName: 'Transfer' })
      if (same(log.address, row.fromToken) && same(transfer.args.from, row.wallet)) spent += transfer.args.value
      if (same(log.address, row.toToken) && same(transfer.args.to, row.wallet)) received += transfer.args.value
    } catch { /* Unrelated logs cannot establish settlement. */ }
  }
  if (spent <= 0n || received <= 0n) return null
  const [inputDecimals, outputDecimals] = await Promise.all([rpc.readContract({ address: row.fromToken, abi: erc20Abi, functionName: 'decimals' }), rpc.readContract({ address: row.toToken, abi: erc20Abi, functionName: 'decimals' })])
  if (inputDecimals > 36 || outputDecimals > 36) return null
  const inputAmount = formatUnits(spent, inputDecimals), outputAmount = formatUnits(received, outputDecimals)
  if (spent > parseUnits(row.amount, inputDecimals)) return null
  return { inputAmount, outputAmount, txHash: hash }
}
