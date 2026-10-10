import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const usdt = '0x55d398326f99059ff775485246999027b3197955'
const address = value => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)

// The live API returns whitelist records; the older SDK describes strings.
// Accept one address per record, never interpret an unknown/empty shape as coverage.
function whitelistAddresses(result) {
  if (!Array.isArray(result) || result.length >= 1000) throw new Error('invalid_policy_response')
  return result.map(entry => {
    const candidates = typeof entry === 'string' ? [entry] : entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.values(entry).filter(address) : []
    if (candidates.length !== 1 || !address(candidates[0])) throw new Error('invalid_policy_response')
    return candidates[0].toLowerCase()
  })
}

export async function syncMegaFuelSellCoverage({ env = process.env, catalog, apply = false, symbols, allStocks = false, fetcher = globalThis.fetch } = {}) {
  const key = env.MEGAFUEL_API_KEY, policyUuid = env.MEGAFUEL_POLICY_UUID
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(key ?? '') || !/^[a-fA-F0-9-]{36}$/.test(policyUuid ?? '')) throw new Error('sponsorship_not_configured')
  const assets = catalog ?? JSON.parse(await readFile(new URL('../asset-sources.json', import.meta.url), 'utf8')).assets
  if (!Array.isArray(assets) || !assets.length || assets.some(asset => asset.chainId !== 56 || !address(asset.address))) throw new Error('invalid_stock_catalog')
  const contracts = [...new Set(assets.map(asset => asset.address.toLowerCase()))]
  if (contracts.includes(usdt) || contracts.length >= 1000) throw new Error('invalid_stock_catalog')
  if (symbols && (!Array.isArray(symbols) || !symbols.length || symbols.some(symbol => !assets.some(asset => asset.symbol === symbol)))) throw new Error('invalid_stock_selection')
  if (symbols && allStocks) throw new Error('invalid_stock_selection')
  if (apply && !symbols && !allStocks) throw new Error('stock_selection_required')
  const selected = symbols ? [...new Set(assets.filter(asset => symbols.includes(asset.symbol)).map(asset => asset.address.toLowerCase()))] : contracts

  async function rpc(method, params) {
    try {
      const response = await fetcher(`https://open-platform-ap.nodereal.io/${key}/megafuel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MegaFuel-Policy-Uuid': policyUuid, 'User-Agent': 'FirstBell/0.1.0' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [{ policyUuid, ...params }] }), signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) throw new Error('rpc')
      const text = await response.text()
      if (text.length > 128_000) throw new Error('rpc')
      const body = JSON.parse(text)
      if (body.jsonrpc !== '2.0' || body.id !== 1 || body.error || !Object.hasOwn(body, 'result')) throw new Error('rpc')
      return body.result
    } catch { throw new Error('policy_request_failed') }
  }
  const read = async () => whitelistAddresses(await rpc('pm_getWhitelist', { whitelistType: 'ToAccountWhitelist', offset: 0, limit: 1000 }))
  let listed = await read()
  // An empty whitelist may mean unrestricted coverage. Do not change its meaning,
  // or turn a stock-only policy into FirstBell's buy/withdraw policy implicitly.
  if (!listed.length || !listed.includes(usdt)) throw new Error('usdt_policy_required')
  const missing = selected.filter(contract => !listed.includes(contract))
  if (listed.length + missing.length >= 1000) throw new Error('policy_whitelist_limit')
  if (apply && missing.length) {
    const accepted = await rpc('pm_addToWhitelist', { whitelistType: 'ToAccountWhitelist', values: missing })
    if (accepted !== true) throw new Error('policy_update_not_confirmed')
    listed = await read()
    if (!listed.includes(usdt) || selected.some(contract => !listed.includes(contract))) throw new Error('policy_update_not_confirmed')
  }
  const missingStocks = selected.filter(contract => !listed.includes(contract)).length
  // No credentials, policy identifiers, addresses or raw provider data in reports.
  return { status: missingStocks ? 'needs_stock_contracts' : 'ready', cashCovered: true, supportedStocks: selected.length,
    missingStocks, addedStocks: apply ? missing.length : 0, whitelistEntries: listed.length }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = process.argv.slice(2)
  const symbolIndex = flags.indexOf('--symbol')
  const symbols = symbolIndex >= 0 ? [flags[symbolIndex + 1]] : undefined
  const known = flags.filter((_, index) => index !== symbolIndex + 1 || symbolIndex < 0)
  if (known.some(flag => !['--cover-sells', '--symbol', '--all-stocks'].includes(flag)) || new Set(known).size !== known.length
    || (symbols && (!symbols[0] || symbols[0].startsWith('--')))) {
    console.error('Usage: node scripts/megafuel-policy.mjs [--symbol NVDAon | --all-stocks] [--cover-sells]')
    process.exitCode = 1
  } else {
    syncMegaFuelSellCoverage({ apply: flags.includes('--cover-sells'), symbols, allStocks: flags.includes('--all-stocks') }).then(report => {
      console.log(JSON.stringify(report))
      process.exitCode = report.status === 'ready' ? 0 : 1
    }, error => {
      // Only our fixed error strings reach the terminal, never an upstream exception.
      console.error(error.message)
      process.exitCode = 1
    })
  }
}
