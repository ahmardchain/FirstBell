import assert from 'node:assert/strict'
import { test } from 'node:test'
import { syncMegaFuelSellCoverage } from '../scripts/megafuel-policy.mjs'

const env = { MEGAFUEL_API_KEY: 'fixture-private-key', MEGAFUEL_POLICY_UUID: '11111111-1111-1111-1111-111111111111' }
const usdt = '0x55d398326f99059ff775485246999027b3197955'
const stock = '0xA9eE28C80f960B889dFbd1902055218cBa016F75'
const other = `0x${'22'.repeat(20)}`
const catalog = [{ chainId: 56, symbol: 'NVDAon', address: stock }]
function fixture(initial = [usdt, other]) {
  let listed = [...initial]
  const calls = []
  const fetcher = async (url, init) => {
    assert.equal(new URL(url).pathname, `/${env.MEGAFUEL_API_KEY}/megafuel`)
    assert.equal(init.headers['X-MegaFuel-Policy-Uuid'], env.MEGAFUEL_POLICY_UUID)
    const body = JSON.parse(init.body), params = body.params[0]
    calls.push(body)
    assert.equal(params.policyUuid, env.MEGAFUEL_POLICY_UUID)
    assert.equal(params.whitelistType, 'ToAccountWhitelist')
    let result
    if (body.method === 'pm_getWhitelist') {
      assert.equal(typeof params.offset, 'number'); assert.equal(typeof params.limit, 'number')
      result = listed.map(value => ({ Value: value, unrelatedMetadata: 'private provider metadata' }))
    } else {
      assert.equal(body.method, 'pm_addToWhitelist')
      listed.push(...params.values); result = true
    }
    return Response.json({ jsonrpc: '2.0', id: 1, result })
  }
  return { calls, fetcher }
}

test('an existing USDT-only policy is inspected without changing or exposing it', async () => {
  const s = fixture(), report = await syncMegaFuelSellCoverage({ env, catalog, fetcher: s.fetcher })
  assert.deepEqual(report, { status: 'needs_stock_contracts', cashCovered: true, supportedStocks: 1, missingStocks: 1, addedStocks: 0, whitelistEntries: 2 })
  assert.deepEqual(s.calls.map(call => call.method), ['pm_getWhitelist'])
  for (const value of [env.MEGAFUEL_API_KEY, env.MEGAFUEL_POLICY_UUID, usdt, stock, other, 'private provider metadata']) assert.equal(JSON.stringify(report).includes(value), false)
})

test('explicit repair adds only missing stock contracts and reads coverage back', async () => {
  const s = fixture(), report = await syncMegaFuelSellCoverage({ env, catalog: [...catalog, ...catalog], apply: true, symbols: ['NVDAon'], fetcher: s.fetcher })
  assert.equal(report.status, 'ready'); assert.equal(report.addedStocks, 1); assert.equal(report.whitelistEntries, 3)
  const write = s.calls.find(call => call.method === 'pm_addToWhitelist')
  assert.deepEqual(write.params[0].values, [stock.toLowerCase()])
  assert.deepEqual(Object.keys(write.params[0]).sort(), ['policyUuid', 'values', 'whitelistType'])
  const again = await syncMegaFuelSellCoverage({ env, catalog, apply: true, symbols: ['NVDAon'], fetcher: s.fetcher })
  assert.equal(again.addedStocks, 0); assert.equal(s.calls.filter(call => call.method === 'pm_addToWhitelist').length, 1)
})

test('unknown, unrestricted and unrelated policies stop before any write', async () => {
  for (const initial of [[], [other], [{ unexpected: true }]]) {
    const s = fixture(initial)
    await assert.rejects(() => syncMegaFuelSellCoverage({ env, catalog, apply: true, allStocks: true, fetcher: s.fetcher }))
    assert.equal(s.calls.some(call => call.method === 'pm_addToWhitelist'), false)
  }
})

test('policy owner errors stay private and unconfirmed updates cannot report success', async () => {
  await assert.rejects(() => syncMegaFuelSellCoverage({ env, catalog, apply: true, allStocks: true, fetcher: async () => {
    throw new Error(`provider ${env.MEGAFUEL_API_KEY} ${env.MEGAFUEL_POLICY_UUID}`)
  } }), error => error.message === 'policy_request_failed')
  const s = fixture(), fetcher = async (url, init) => {
    if (JSON.parse(init.body).method === 'pm_addToWhitelist') return Response.json({ jsonrpc: '2.0', id: 1, result: false })
    return s.fetcher(url, init)
  }
  await assert.rejects(() => syncMegaFuelSellCoverage({ env, catalog, apply: true, allStocks: true, fetcher }), /policy_update_not_confirmed/)
})

test('writes require an explicit catalog scope and cannot include arbitrary contracts', async () => {
  const s = fixture()
  await assert.rejects(() => syncMegaFuelSellCoverage({ env, catalog, apply: true, fetcher: s.fetcher }), /stock_selection_required/)
  await assert.rejects(() => syncMegaFuelSellCoverage({ env, catalog, apply: true, symbols: ['UNSUPPORTED'], fetcher: s.fetcher }), /invalid_stock_selection/)
  await assert.rejects(() => syncMegaFuelSellCoverage({ env, catalog, apply: true, symbols: ['NVDAon'], allStocks: true, fetcher: s.fetcher }), /invalid_stock_selection/)
  assert.equal(s.calls.length, 0)
  const expanded = [...catalog, { chainId: 56, symbol: 'OTHER', address: `0x${'33'.repeat(20)}` }]
  await syncMegaFuelSellCoverage({ env, catalog: expanded, apply: true, symbols: ['NVDAon'], fetcher: s.fetcher })
  assert.deepEqual(s.calls.find(call => call.method === 'pm_addToWhitelist').params[0].values, [stock.toLowerCase()])
})
