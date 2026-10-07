import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { encodeFunctionData, erc20Abi } from 'viem'
import { COW_RELAYER } from '../lib/agent-trading.ts'
import { BSC_USDT } from '../lib/funding.ts'
import { sponsorApproval } from '../worker/megafuel.ts'

// No live policy, signing or broadcast. The lowercase shape was observed in a
// read-only MegaFuel response; eligible responses below remain mocked fixtures.
const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
const env = { MEGAFUEL_API_KEY: 'fixture-megafuel-key', MEGAFUEL_POLICY_UUID: '11111111-1111-1111-1111-111111111111' }
const owner = '0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A'
const amount = 5_000_000_000_000_000_000n
const approval = { chainId: 56, to: BSC_USDT.address, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [COW_RELAYER, amount] }),
  value: '0', amount: amount.toString(), spender: COW_RELAYER, reset: false, gasFeeBnb: '0', simulated: true }

async function prepare(result, error) {
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).hostname, 'open-platform-ap.nodereal.io')
    assert.equal(init.headers['X-MegaFuel-Policy-Uuid'], env.MEGAFUEL_POLICY_UUID)
    const { id, method, params } = JSON.parse(init.body)
    assert.ok(['pm_isSponsorable', 'eth_getTransactionCount'].includes(method), 'review must never broadcast')
    if (method === 'eth_getTransactionCount') return Response.json({ jsonrpc: '2.0', id, result: '0x2' })
    assert.equal(params[0].to, approval.to)
    assert.equal(params[0].data, approval.data)
    return Response.json(error ? { jsonrpc: '2.0', id, error } : { jsonrpc: '2.0', id, result })
  }
  return sponsorApproval(approval, owner, 100_000n, env)
}

test('fixture: lowercase and documented legacy approval responses can prepare zero-fee permissions', async () => {
  for (const result of [{ sponsorable: true }, { Sponsorable: true }, { sponsorable: true, Sponsorable: true }]) {
    const prepared = await prepare(result)
    assert.equal(prepared.gasFeeBnb, '0')
    assert.deepEqual(prepared.sponsorship, { provider: 'megafuel', gas: '120000', nonce: 2 })
    assert.equal(JSON.stringify(prepared).includes(env.MEGAFUEL_API_KEY), false)
    assert.equal(JSON.stringify(prepared).includes(env.MEGAFUEL_POLICY_UUID), false)
  }
})

test('the observed lowercase denial is a policy rejection, not an unavailable provider', async () => {
  for (const result of [{ sponsorable: false }, { Sponsorable: false }, { sponsorable: false, Sponsorable: false }]) {
    await assert.rejects(() => prepare(result), error => error.reason === 'sponsorship_rejected' && error.status === 409)
  }
})

test('missing, non-boolean and conflicting decisions cannot enable fee sponsorship', async () => {
  for (const result of [null, {}, true, [], { sponsorable: 'true' }, { Sponsorable: 1 },
    { sponsorable: true, Sponsorable: false }, { sponsorable: false, Sponsorable: true },
    { sponsorable: true, Sponsorable: 'true' }, { sponsorable: null, Sponsorable: true }]) {
    await assert.rejects(() => prepare(result), error => error.reason === 'sponsorship_unavailable')
  }
})

test('provider error text and credentials never escape a failed policy check', async () => {
  await assert.rejects(() => prepare(null, { code: -32000, message: `upstream ${env.MEGAFUEL_API_KEY} ${env.MEGAFUEL_POLICY_UUID}` }),
    error => error.reason === 'sponsorship_unavailable' && !error.message.includes(env.MEGAFUEL_API_KEY) && !error.message.includes(env.MEGAFUEL_POLICY_UUID))
})
