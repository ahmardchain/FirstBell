export type TradingRoute = {
  source: 'binance-web3' | 'cow-protocol'
  chainId: 56
  symbol: string
  side: 'buy' | 'sell'
  walletAddress: string
  inputAmount: string
  inputSymbol: string
  outputAmount: string
  outputSymbol: string
  vendor: string
  executionMode: 'RFQ'
  checkedAt: string
  refreshAt: string
  executable: false
}
