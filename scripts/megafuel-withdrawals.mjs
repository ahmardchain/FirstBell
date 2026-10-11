import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAddress, zeroAddress } from 'viem'

const usdt = '0x55d398326f99059ff775485246999027b3197955'
const transfer = '0xa9059cbb'
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
export async function syncMegaFuelWithdrawalCoverage({ env = process.env, recipient, apply = false, fetcher = globalThis.fetch } = {}) {
  if (typeof recipient !== 'string' || !isAddress(recipient) || [zeroAddress, usdt].includes(recipient.toLowerCase())) throw new Error('invalid_recipient')
  recipient = recipient.toLowerCase()
  const key = env.MEGAFUEL_API_KEY, policyUuid = env.MEGAFUEL_POLICY_UUID
  if (!/^[A-Za-z0-9_-]{8,256}$/.test(key ?? '') || !/^[a-fA-F0-9-]{36}$/.test(policyUuid ?? '')) throw new Error('sponsorship_not_configured')
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
  const read = async (whitelistType, pattern) => whitelistValues(await rpc('pm_getWhitelist', { whitelistType, offset: 0, limit: 1000 }), pattern)
  const [contracts, methods, receivers] = await Promise.all([
    read('ToAccountWhitelist', addressPattern), read('ContractMethodSigWhitelist', methodPattern), read('BEP20ReceiverWhiteList', addressPattern),
  ])
  // Require the existing FirstBell USDT policy; never broaden token recipients.
  if (!contracts.length || !contracts.includes(usdt)) throw new Error('usdt_policy_required')
  const changes = []
  if (methods.length && !methods.includes(transfer)) changes.push({ type: 'ContractMethodSigWhitelist', value: transfer, pattern: methodPattern })
  if (receivers.length && !receivers.includes(recipient)) changes.push({ type: 'BEP20ReceiverWhiteList', value: recipient, pattern: addressPattern })
  // Check every addition before any write. A full page cannot prove complete
  // coverage, so retain one slot rather than partially repair an over-limit list.
  if (apply && changes.some(change => (change.type === 'ContractMethodSigWhitelist' ? methods.length : receivers.length) + 1 >= 1000)) throw new Error('policy_whitelist_limit')
  if (apply) for (const change of changes) {
    const accepted = await rpc('pm_addToWhitelist', { whitelistType: change.type, values: [change.value] })
    if (accepted !== true || !(await read(change.type, change.pattern)).includes(change.value)) throw new Error('policy_update_not_confirmed')
  }
  if (apply && !(await read('ToAccountWhitelist', addressPattern)).includes(usdt)) throw new Error('policy_update_not_confirmed')
  const missingMethod = changes.some(change => change.type === 'ContractMethodSigWhitelist')
  const missingRecipient = changes.some(change => change.type === 'BEP20ReceiverWhiteList')
  // Rule coverage alone is not transaction eligibility, funding or completion.
  // Never report credentials, policy identifiers, addresses or raw provider data.
  return { status: !apply && changes.length ? 'needs_withdrawal_rules' : 'rules_covered', cashContractCovered: true,
    transferMethodCovered: apply || !missingMethod, recipientCovered: apply || !missingRecipient,
    addedTransferMethod: apply && missingMethod, addedRecipient: apply && missingRecipient }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = process.argv.slice(2), apply = flags.includes('--cover-withdrawals')
  const args = flags.filter(flag => flag !== '--cover-withdrawals')
  if (args.length !== 2 || args[0] !== '--recipient' || flags.filter(flag => flag === '--cover-withdrawals').length > 1) {
    console.error('Usage: node scripts/megafuel-withdrawals.mjs --recipient <BSC-address> [--cover-withdrawals]')
    process.exitCode = 1
  } else {
    syncMegaFuelWithdrawalCoverage({ recipient: args[1], apply }).then(report => {
      console.log(JSON.stringify(report)); process.exitCode = report.status === 'rules_covered' ? 0 : 1
    }, error => { console.error(error.message); process.exitCode = 1 })
  }
}
