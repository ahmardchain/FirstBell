import assert from 'node:assert/strict'
import { test } from 'node:test'
import { syncMegaFuelWithdrawalCoverage } from '../scripts/megafuel-withdrawals.mjs'

// Provider fixtures only: no private policy, wallet signing or broadcast.
const env = { MEGAFUEL_API_KEY: 'fixture-private-key', MEGAFUEL_POLICY_UUID: '11111111-1111-1111-1111-111111111111' }
const usdt = '0x55d398326f99059ff775485246999027b3197955'
const recipient = `0x${'22'.repeat(20)}`, other = `0x${'33'.repeat(20)}`
const approve = '0x095ea7b3', transfer = '0xa9059cbb'
function fixture({ contracts = [usdt, other], methods = [approve], receivers = [other] } = {}) {
  const lists = { ToAccountWhitelist: [...contracts], ContractMethodSigWhitelist: [...methods], BEP20ReceiverWhiteList: [...receivers] }, calls = []
  const fetcher = async (url, init) => {
    assert.equal(new URL(url).pathname, `/${env.MEGAFUEL_API_KEY}/megafuel`)
    assert.equal(init.headers['X-MegaFuel-Policy-Uuid'], env.MEGAFUEL_POLICY_UUID)
    const body = JSON.parse(init.body), params = body.params[0]; calls.push(body)
    assert.equal(params.policyUuid, env.MEGAFUEL_POLICY_UUID)
    let result
    if (body.method === 'pm_getWhitelist') {
      assert.equal(params.offset, 0); assert.equal(params.limit, 1000)
      result = lists[params.whitelistType].map(Value => ({ Value, metadata: 'private provider metadata' }))
    } else {
      assert.equal(body.method, 'pm_addToWhitelist')
      lists[params.whitelistType].push(...params.values); result = true
    }
    return Response.json({ jsonrpc: '2.0', id: 1, result })
  }
  return { lists, calls, fetcher }
}

test('read-only check identifies an approve-only policy and a restricted destination without mutation', async () => {
  const s = fixture(), report = await syncMegaFuelWithdrawalCoverage({ env, recipient, fetcher: s.fetcher })
  assert.deepEqual(report, { status: 'needs_withdrawal_rules', cashContractCovered: true, transferMethodCovered: false, recipientCovered: false, addedTransferMethod: false, addedRecipient: false })
  assert.ok(s.calls.every(call => call.method === 'pm_getWhitelist'))
  for (const value of [env.MEGAFUEL_API_KEY, env.MEGAFUEL_POLICY_UUID, usdt, recipient, other, 'private provider metadata']) assert.equal(JSON.stringify(report).includes(value), false)
})

test('repair preserves approvals and existing destinations, adds only the fixed transfer selector and one destination, and is idempotent', async () => {
  const s = fixture(), report = await syncMegaFuelWithdrawalCoverage({ env, recipient, apply: true, fetcher: s.fetcher })
  assert.equal(report.status, 'rules_covered'); assert.equal(report.addedTransferMethod, true); assert.equal(report.addedRecipient, true)
  const writes = s.calls.filter(call => call.method === 'pm_addToWhitelist').map(call => call.params[0])
  assert.deepEqual(writes, [ { policyUuid: env.MEGAFUEL_POLICY_UUID, whitelistType: 'ContractMethodSigWhitelist', values: [transfer] },
    { policyUuid: env.MEGAFUEL_POLICY_UUID, whitelistType: 'BEP20ReceiverWhiteList', values: [recipient] } ])
  assert.deepEqual(s.lists.ToAccountWhitelist, [usdt, other]); assert.deepEqual(s.lists.ContractMethodSigWhitelist, [approve, transfer])
  assert.deepEqual(s.lists.BEP20ReceiverWhiteList, [other, recipient])
  const again = await syncMegaFuelWithdrawalCoverage({ env, recipient, apply: true, fetcher: s.fetcher })
  assert.equal(again.addedTransferMethod, false); assert.equal(again.addedRecipient, false)
  assert.equal(s.calls.filter(call => call.method === 'pm_addToWhitelist').length, 2)
})

test('empty optional lists remain unrestricted and an unrestricted token list never gets narrowed', async () => {
  const s = fixture({ methods: [], receivers: [] })
  const report = await syncMegaFuelWithdrawalCoverage({ env, recipient, apply: true, fetcher: s.fetcher })
  assert.equal(report.status, 'rules_covered'); assert.ok(s.calls.every(call => call.method === 'pm_getWhitelist'))
  assert.deepEqual(s.lists.ContractMethodSigWhitelist, []); assert.deepEqual(s.lists.BEP20ReceiverWhiteList, [])
  const unrestricted = fixture({ contracts: [] })
  await assert.rejects(() => syncMegaFuelWithdrawalCoverage({ env, recipient, apply: true, fetcher: unrestricted.fetcher }), /usdt_policy_required/)
  assert.ok(unrestricted.calls.every(call => call.method === 'pm_getWhitelist'))
})

test('invalid destinations, unknown whitelist shapes, wrong contracts and full lists fail before a write', async () => {
  for (const invalid of ['', 'bad', `0x${'00'.repeat(20)}`, usdt]) {
    const s = fixture()
    await assert.rejects(() => syncMegaFuelWithdrawalCoverage({ env, recipient: invalid, apply: true, fetcher: s.fetcher }), /invalid_recipient/)
    assert.equal(s.calls.length, 0)
  }
  for (const options of [{ contracts: [other] }, { methods: ['invalid'] }, { receivers: Array(1000).fill(other) }]) {
    const s = fixture(options)
    await assert.rejects(() => syncMegaFuelWithdrawalCoverage({ env, recipient, apply: true, fetcher: s.fetcher }))
    assert.ok(s.calls.every(call => call.method === 'pm_getWhitelist'))
  }
})

test('a successful acknowledgement without verified rule coverage cannot report success', async () => {
  const s = fixture(), fetcher = async (url, init) => JSON.parse(init.body).method === 'pm_addToWhitelist'
    ? Response.json({ jsonrpc: '2.0', id: 1, result: true }) : s.fetcher(url, init)
  await assert.rejects(() => syncMegaFuelWithdrawalCoverage({ env, recipient, apply: true, fetcher }), /policy_update_not_confirmed/)
})

test('a nearly full destination list stops before a preceding method repair can partially apply', async () => {
  const s = fixture({ receivers: Array(999).fill(other) })
  await assert.rejects(() => syncMegaFuelWithdrawalCoverage({ env, recipient, apply: true, fetcher: s.fetcher }), /policy_whitelist_limit/)
  assert.ok(s.calls.every(call => call.method === 'pm_getWhitelist'))
  assert.deepEqual(s.lists.ContractMethodSigWhitelist, [approve])
})

test('provider exceptions and JSON-RPC errors never expose sensitive text', async () => {
  for (const fetcher of [async () => { throw new Error(`provider ${env.MEGAFUEL_API_KEY} ${env.MEGAFUEL_POLICY_UUID}`) },
    async () => Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: env.MEGAFUEL_API_KEY } })]) {
    await assert.rejects(() => syncMegaFuelWithdrawalCoverage({ env, recipient, apply: true, fetcher }), error => error.message === 'policy_request_failed')
  }
})
