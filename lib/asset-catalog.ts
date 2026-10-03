import manifest from '../asset-sources.json' with { type: 'json' }
import { getAddress } from 'viem'

export const markBySymbol: Record<string, string> = {
  AAPLon: 'apple', TSLAon: 'tesla', NVDAon: 'nvidia', MSFTon: 'microsoft', AMZNon: 'amazon',
  GOOGLon: 'google', GOOGon: 'google', METAon: 'meta', COINon: 'coinbase', HOODon: 'robinhood',
  NFLXon: 'netflix', UBERon: 'uber', INTCon: 'intel', KOon: 'cocacola',
}

// One issuer-published BSC catalog is shared by the UI and API allowlist.
export const assetCatalog = manifest.assets.map(asset => ({
  ...asset,
  // Some issuer entries use mixed case without a valid EIP-55 checksum.
  // Normalize casing without changing any address bytes.
  address: getAddress(asset.address),
  company: asset.name.replace(/ \(Ondo Tokenized\)$/, ''),
  mark: markBySymbol[asset.symbol] ?? '',
}))
export type CatalogAsset = (typeof assetCatalog)[number]
export const assetLogo = (asset: { symbol: string; source: string }) =>
  markBySymbol[asset.symbol] ? `/assets/marks/${markBySymbol[asset.symbol]}.svg` : asset.source

// An unavailable issuer image gets a neutral asset icon, never a made-up logo.
export function tokenLogoError(event: { currentTarget: HTMLImageElement }) {
  if (event.currentTarget.src.endsWith('/assets/token-placeholder.svg')) return
  event.currentTarget.src = '/assets/token-placeholder.svg'
  event.currentTarget.alt = ''
}

export const tokenAddresses = Object.fromEntries(assetCatalog.map(asset => [asset.symbol, asset.address])) as Record<string, `0x${string}`>
export const isCatalogSymbol = (value: string) => Object.hasOwn(tokenAddresses, value)
