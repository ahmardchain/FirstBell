import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const usdt = '0x55d398326f99059ff775485246999027b3197955'
const transfer = '0xa9059cbb'
const zeroAddress = `0x${'00'.repeat(20)}`
const addressPattern = /^0x[0-9a-fA-F]{40}$/
const methodPattern = /^0x[0-9a-fA-F]{8}$/

function whitelistValues(result, pattern) {
  if (!Array.isArray(result) || result.length >= 1000) throw new Error('invalid_policy_response')
  return result.map(entry => {
    const values = typeof entry === 'string' ? [entry] : entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.values(entry).filter(value => typeof value === 'string' && pattern.test(value)) : []
    if (values.length !== 1 || !pattern.test(values[0])) throw new Error('invalid_policy_response')
    return values[0].toLowerCase()
  })
}

// Owner maintenance only. Never invoke this command from a withdrawal or build.
// An empty optional whitelist is unrestricted: adding to it would narrow policy.
export async function syncMegaFuelWithdrawalCoverage({ env = process.env, recipient, allUsers = false, apply = false, fetcher = globalThis.fetch } = {}) {
  if (typeof allUsers !== 'boolean' || (allUsers && recipient !== undefined)) throw new Error('invalid_withdrawal_scope')
  if (!allUsers) {
    const { isAddress } = await import('viem')
    if (typeof recipient !== 'string' || !isAddress(recipient) || [zeroAddress, usdt].includes(recipient.toLowerCase())) throw new Error('invalid_recipient')
  }
  recipient = recipient?.toLowerCase()
  const key = env.MEGAFUEL_API_KEY, policyUuid = env.MEGAFUEL_POLICY_UUID
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(key ?? '') || !/^[a-fA-F0-9-]{36}$/.test(policyUuid ?? '')) throw new Error('sponsorship_not_configured')
  async function rpc(method, params) {
    try {
      const response = await fetcher(`https://open-platform-ap.nodereal.io/${key}/megafuel`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MegaFuel-Policy-Uuid': policyUuid, 'User-Agent': 'FirstBell/0.1.0' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: Array.isArray(params) ? params : [{ policyUuid, ...params }] }), signal: AbortSignal.timeout(8_000),
      })
      if (!response.ok) throw new Error('rpc')
      const text = await response.text()
      if (text.length > 128_000) throw new Error('rpc')
      const body = JSON.parse(text)
      if (body.jsonrpc !== '2.0' || body.id !== 1 || body.error || !Object.hasOwn(body, 'result')) throw new Error('rpc')
      return body.result
    } catch { throw new Error('policy_request_failed') }
  }
  const read = async (whitelistType, pattern) => whitelistValues(await rpc('pm_getWhitelist', { whitelistType, offset: 0, limit: 1000 }), pattern)
  const [contracts, methods, receivers, senders, policy] = await Promise.all([
    read('ToAccountWhitelist', addressPattern), read('ContractMethodSigWhitelist', methodPattern), read('BEP20ReceiverWhiteList', addressPattern),
    allUsers ? read('FromAccountWhitelist', addressPattern) : Promise.resolve([]),
    allUsers ? rpc('pm_getPolicyByUuid', [policyUuid]) : Promise.resolve(null),
  ])
  // Require the existing FirstBell USDT policy; never broaden token recipients.
  if (!contracts.length || !contracts.includes(usdt)) throw new Error('usdt_policy_required')
  if (allUsers) {
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new Error('private_policy_required')
    const fields = Object.fromEntries(Object.entries(policy).map(([key, value]) => [key.toLowerCase(), value]))
    if (fields.type !== 1 || fields.network !== 56 || typeof fields.uuid !== 'string' || fields.uuid.toLowerCase() !== policyUuid.toLowerCase()) throw new Error('private_policy_required')
    const assets = JSON.parse(await readFile(new URL('../asset-sources.json', import.meta.url), 'utf8')).assets
    if (!Array.isArray(assets) || assets.some(asset => asset.chainId !== 56 || !addressPattern.test(asset.address))) throw new Error('invalid_stock_catalog')
    const allowed = new Set([usdt, ...assets.map(asset => asset.address.toLowerCase())])
    // Catalog-only recipients are required when broadening sender/destination
    // restrictions. If both lists are already unrestricted, retain existing
    // unrelated recipients and repair just the transfer method; the app still
    // signs/relays only its fixed, ownership-verified USDT withdrawals.
    if ((senders.length || receivers.length) && contracts.some(contract => !allowed.has(contract))) throw new Error('unsupported_policy_contract')
  }
  const changes = []
  if (methods.length && !methods.includes(transfer)) changes.push({ type: 'ContractMethodSigWhitelist', value: transfer, pattern: methodPattern, clear: false })
  if (allUsers) {
    // Only the private backend can invoke this policy. Application authentication,
    // wallet ownership, exact USDT calldata and per-account caps still apply.
    if (senders.length) changes.push({ type: 'FromAccountWhitelist', pattern: addressPattern, clear: true })
    if (receivers.length) changes.push({ type: 'BEP20ReceiverWhiteList', pattern: addressPattern, clear: true })
  } else if (receivers.length && !receivers.includes(recipient)) changes.push({ type: 'BEP20ReceiverWhiteList', value: recipient, pattern: addressPattern, clear: false })
  // Check every addition before any write. A full page cannot prove complete
  // coverage, so retain one slot rather than partially repair an over-limit list.
  if (apply && changes.some(change => !change.clear && (change.type === 'ContractMethodSigWhitelist' ? methods.length : receivers.length) + 1 >= 1000)) throw new Error('policy_whitelist_limit')
  if (apply) for (const change of changes) {
    const accepted = await rpc(change.clear ? 'pm_emptyWhitelist' : 'pm_addToWhitelist', {
      whitelistType: change.type, ...(!change.clear ? { values: [change.value] } : {}),
    })
    if (accepted !== true) throw new Error('policy_update_not_confirmed')
    const verified = await read(change.type, change.pattern)
    if (change.clear ? verified.length !== 0 : !verified.includes(change.value)) throw new Error('policy_update_not_confirmed')
  }
  if (apply) {
    const verified = await read('ToAccountWhitelist', addressPattern)
    if (verified.length !== contracts.length || contracts.some(contract => !verified.includes(contract))) throw new Error('policy_update_not_confirmed')
  }
  const missingMethod = changes.some(change => change.type === 'ContractMethodSigWhitelist')
  const missingRecipient = changes.some(change => change.type === 'BEP20ReceiverWhiteList')
  // Rule coverage alone is not transaction eligibility, funding or completion.
  // Never report credentials, policy identifiers, addresses or raw provider data.
  return { status: !apply && changes.length ? 'needs_withdrawal_rules' : 'rules_covered', cashContractCovered: true,
    transferMethodCovered: apply || !missingMethod, recipientCovered: apply || !missingRecipient,
    addedTransferMethod: apply && missingMethod, addedRecipient: apply && missingRecipient && !allUsers,
    ...(allUsers ? { allUsersCovered: apply || senders.length === 0, allRecipientsCovered: apply || receivers.length === 0,
      removedSenderRestriction: apply && senders.length > 0, removedRecipientRestriction: apply && receivers.length > 0 } : {}) }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = process.argv.slice(2), apply = flags.includes('--cover-withdrawals')
  const args = flags.filter(flag => flag !== '--cover-withdrawals'), allUsers = args.length === 1 && args[0] === '--all-users'
  if ((!allUsers && (args.length !== 2 || args[0] !== '--recipient')) || flags.filter(flag => flag === '--cover-withdrawals').length > 1) {
    console.error('Usage: node scripts/megafuel-withdrawals.mjs [--all-users | --recipient <BSC-address>] [--cover-withdrawals]')
    process.exitCode = 1
  } else {
    syncMegaFuelWithdrawalCoverage({ recipient: allUsers ? undefined : args[1], allUsers, apply }).then(report => {
      console.log(JSON.stringify(report)); process.exitCode = report.status === 'rules_covered' ? 0 : 1
    }, error => { console.error(error.message); process.exitCode = 1 })
  }
}
