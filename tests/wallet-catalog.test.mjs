import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { decodeFunctionData, encodeFunctionResult, erc20Abi, multicall3Abi, parseUnits } from 'viem'
import { assetCatalog } from '../lib/asset-catalog.ts'
import { BSC_USDT } from '../lib/funding.ts'
import { BSC_USDC } from '../lib/trade-assets.ts'
import { readWalletBalances } from '../src/wallet-balances.ts'

const originalFetch = globalThis.fetch
after(() => { globalThis.fetch = originalFetch })

test('the full wallet catalog uses bounded multicalls and reads decimals only for nonzero holdings', async () => {
  const target = assetCatalog.find(asset => asset.symbol === 'GOOGLon')
  const raw = parseUnits('1.23456789', 8)
  let balanceReads = 0, decimalsReads = 0, multicalls = 0
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body)
    assert.equal(Array.isArray(request), false)
    let result
    if (request.method === 'eth_getBalance') result = '0x0'
    else {
      assert.equal(request.method, 'eth_call')
      const decoded = decodeFunctionData({ abi: multicall3Abi, data: request.params[0].data })
      assert.equal(decoded.functionName, 'aggregate3')
      const calls = decoded.args[0]
      assert.ok(calls.length <= 64)
      multicalls++
      result = encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result: calls.map(call => {
        const read = decodeFunctionData({ abi: erc20Abi, data: call.callData })
        const isTarget = call.target.toLowerCase() === target.address.toLowerCase()
        if (read.functionName === 'decimals') { assert.equal(isTarget, true); decimalsReads++ }
        else { assert.equal(read.functionName, 'balanceOf'); balanceReads++ }
        const value = read.functionName === 'decimals' ? 8 : isTarget ? raw
          : call.target.toLowerCase() === BSC_USDT.address.toLowerCase() ? parseUnits('25', 18)
          : call.target.toLowerCase() === BSC_USDC.address.toLowerCase() ? parseUnits('10', 18) : 0n
        return { success: true, returnData: encodeFunctionResult({ abi: erc20Abi, functionName: read.functionName, result: value }) }
      }) })
    }
    return Response.json({ jsonrpc: '2.0', id: request.id, result })
  }
  const balances = await readWalletBalances('0x1111111111111111111111111111111111111111', assetCatalog)
  assert.equal(balanceReads, 461)
  assert.equal(decimalsReads, 1)
  assert.equal(multicalls, 9)
  assert.equal(balances.usdt, '25')
  assert.equal(balances.usdc, '10')
  assert.equal(balances.tokens.length, 459)
  assert.equal(balances.tokens.find(token => token.symbol === 'GOOGLon').quantity, '1.23456789')
  assert.equal(balances.tokens.filter(token => token.raw > 0n).length, 1)
})
