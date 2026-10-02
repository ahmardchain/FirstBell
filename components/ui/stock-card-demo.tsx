import * as React from 'react'
import { StockCard } from '@/components/ui/stock-card'

const stocks = [
  { ticker: 'AAPLon', name: 'Apple Inc.', mark: 'apple' },
  { ticker: 'TSLAon', name: 'Tesla, Inc.', mark: 'tesla' },
  { ticker: 'NVDAon', name: 'NVIDIA Corporation', mark: 'nvidia' },
  { ticker: 'MSFTon', name: 'Microsoft Corporation', mark: 'microsoft' },
  { ticker: 'AMZNon', name: 'Amazon.com, Inc.', mark: 'amazon' },
]

/** A standalone layout example. Home supplies verified prices from its market API. */
export default function StockCardDemo() {
  const [selected, setSelected] = React.useState<string | null>(null)
  return <div className="flex w-full flex-col items-center gap-4 bg-background p-4 sm:p-8">
    {stocks.map(stock => <StockCard key={stock.ticker} ticker={stock.ticker} name={stock.name}
      logoSrc={`/assets/marks/${stock.mark}.svg`} logoClassName={`brand-mark brand-mark--${stock.mark}`}
      price={null} change={null} onBuy={setSelected} />)}
    <p role="status" className="text-sm text-muted-foreground">{selected ? `Selected ${selected}` : 'Select a stock to preview the Buy callback.'}</p>
  </div>
}
