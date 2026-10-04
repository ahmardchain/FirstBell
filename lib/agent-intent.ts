import { assetCatalog, type CatalogAsset } from './asset-catalog.ts'

export type TradeIntent = { kind: 'trade'; symbol: string; side: 'buy' | 'sell'; amount: string | null; fraction: 'all' | 'half' | null; quoteOnly: boolean }
export type AgentIntent = TradeIntent | { kind: 'balance' | 'holdings' | 'cancel' | 'status' } | { kind: 'record'; symbol: string; field: 'issuer' | 'contract' | 'network' } | { kind: 'help'; reason: 'asset' | 'amount' | 'ambiguous' | 'unsupported' }

const escapes = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const contains = (text: string, value: string) => new RegExp(`(^|[^a-z0-9])${escapes(value)}([^a-z0-9]|$)`, 'i').test(text)
const aliases: Record<string, string[]> = { NVDAon: ['nvidia', '英伟达'], AAPLon: ['apple', '苹果'], TSLAon: ['tesla', '特斯拉'], MSFTon: ['microsoft', '微软'], AMZNon: ['amazon', '亚马逊'], GOOGLon: ['alphabet', 'google', '谷歌'], METAon: ['meta', 'facebook'], KOon: ['coca cola', 'coca-cola'] }

export function mentionedAssets(text: string, catalog: CatalogAsset[] = assetCatalog): CatalogAsset[] {
  return catalog.filter(asset => [asset.symbol, asset.symbol.replace(/on$/, ''), asset.company, ...(aliases[asset.symbol] ?? [])].some(alias => contains(text, alias)))
}

export function parseAgentIntent(prompt: string): AgentIntent {
  const text = prompt.trim().toLowerCase()
  if (!text || text.length > 500) return { kind: 'help', reason: 'unsupported' }
  if (/^(cancel|stop|never mind|nevermind|取消|停止)[.!。]*$/.test(text)) return { kind: 'cancel' }
  if (/^(check( my| the)? order( status)?|order status|did (my|the).*(go through|fill)|查询订单|订单状态)[?.!。]*$/.test(text)) return { kind: 'status' }
  if (/^(show |check |what('?s| is) |how much (money|usdt|bnb) (do i have)[? ]*|查看|显示)?(my |the |我的)?(wallet |钱包)?(balance|balances|余额)[?.!。]*$/.test(text)) return { kind: 'balance' }
  if (/^(show |check |查看|显示)?(my |我的)?(holdings|positions|portfolio|持仓)[?.!。]*$/.test(text)) return { kind: 'holdings' }
  const buying = /\b(buy|purchase)\b|买入|购买/.test(text)
  const selling = /\b(sell)\b|卖出|出售/.test(text)
  const candidates = mentionedAssets(text)
  if (buying || selling) {
    // Conditional, scheduled, multi-action, or hypothetical requests must not
    // become immediate orders. No arbitrary-address or transfer commands.
    if (buying === selling || /\b(if|when|every|daily|weekly|tomorrow|instead|or|not|don't|do not|should|would|could|transfer|send|then|limit|stop.loss)\b|如果|每天|明天|转账|不要|应该|0x[a-f0-9]{6}/.test(text)) return { kind: 'help', reason: 'unsupported' }
    if (candidates.length !== 1) return { kind: 'help', reason: candidates.length ? 'ambiguous' : 'asset' }
    const asset = candidates[0]
    const withoutAsset = [asset.symbol, asset.symbol.replace(/on$/, ''), asset.company, ...(aliases[asset.symbol] ?? [])]
      .sort((a, b) => b.length - a.length).reduce((value, alias) => value.replace(new RegExp(`(^|[^a-z0-9])${escapes(alias)}(?=[^a-z0-9]|$)`, 'gi'), '$1 '), text)
    const numbers = withoutAsset.match(/(?:\d[\d,]*(?:\.\d+)?|\.\d+)/g) ?? []
    if (numbers.length > 1 || /%|percent|shares|股票数量|股(?!票)/.test(withoutAsset)) return { kind: 'help', reason: 'ambiguous' }
    if (/[€£¥₦]|\b(usdc|dai|bnb|eth|ether|btc|bitcoin|eur|gbp|ngn|jpy|cny|cad|aud)\b|欧元|英镑|人民币/.test(withoutAsset)
      || (buying && /\b(tokens?|units?|coins?)\b|个|枚/.test(withoutAsset))) return { kind: 'help', reason: 'amount' }
    const fraction = /\bhalf\b|一半/.test(withoutAsset) ? 'half' : /\ball\b|全部/.test(withoutAsset) ? 'all' : null
    if (fraction && (buying || numbers.length)) return { kind: 'help', reason: 'amount' }
    if (selling && /\$|usd\b|usdt|dollars|美元/.test(withoutAsset.replace(/\b(for|to|into)\s+usdt\b/g, ''))) return { kind: 'help', reason: 'amount' }
    const number = numbers[0]
    if (number?.includes(',') && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(number)) return { kind: 'help', reason: 'amount' }
    let amount = number?.replaceAll(',', '') ?? null
    if (amount?.startsWith('.')) amount = `0${amount}`
    if (amount && (!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,18})?$/.test(amount) || !/[1-9]/.test(amount) || /[-+]\s*\d/.test(withoutAsset))) return { kind: 'help', reason: 'amount' }
    if (!amount && !fraction) return { kind: 'help', reason: 'amount' }
    return { kind: 'trade', symbol: asset.symbol, side: buying ? 'buy' : 'sell', amount, fraction, quoteOnly: /quote only|just (a )?quote|preview only|仅报价|只报价/.test(text) }
  }
  if (candidates.length !== 1) return { kind: 'help', reason: candidates.length ? 'ambiguous' : 'asset' }
  const field = /issuer|issue|ondo|发行|谁/.test(text) ? 'issuer' : /contract|address|合约|地址/.test(text) ? 'contract' : /network|chain|bsc|网络|链/.test(text) ? 'network' : null
  return field ? { kind: 'record', symbol: candidates[0].symbol, field } : { kind: 'help', reason: 'unsupported' }
}

export function fractionOfQuantity(quantity: string, fraction: 'all' | 'half'): string {
  if (!/^\d+(?:\.\d{1,36})?$/.test(quantity)) throw new Error('invalid_amount')
  if (!/[1-9]/.test(quantity)) throw new Error('insufficient_balance')
  if (fraction === 'all') return quantity
  const [whole, decimals = ''] = quantity.split('.')
  const raw = BigInt(whole + decimals) / 2n
  if (raw === 0n) throw new Error('insufficient_balance')
  const padded = raw.toString().padStart(decimals.length + 1, '0')
  return decimals.length ? `${padded.slice(0, -decimals.length)}.${padded.slice(-decimals.length)}`.replace(/\.?0+$/, '') : padded
}
