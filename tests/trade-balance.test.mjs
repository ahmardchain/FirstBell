import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { decodeFunctionData, encodeFunctionResult, erc20Abi, multicall3Abi, parseUnits } from 'viem'
import { BSC_USDT } from '../lib/funding.ts'
import { tokenAddresses } from '../lib/asset-catalog.ts'
import { readTradeBalance } from '../src/wallet-balances.ts'

const owner = `0x${'11'.repeat(20)}`
const originalFetch = globalThis.fetch
after(() => { globalThis.fetch = originalFetch })

test('Buy reads only the connected wallet BSC USDT balance with 18 decimals', async () => {
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body)
    assert.equal(request.method, 'eth_call')
    assert.equal(request.params[0].to.toLowerCase(), BSC_USDT.address.toLowerCase())
    const call = decodeFunctionData({ abi: erc20Abi, data: request.params[0].data })
    assert.equal(call.functionName, 'balanceOf')
    assert.equal(call.args[0].toLowerCase(), owner)
    return Response.json({ jsonrpc: '2.0', id: request.id, result: encodeFunctionResult({ abi: erc20Abi, functionName: 'balanceOf', result: parseUnits('25.123456789', 18) }) })
  }
  const balance = await readTradeBalance(owner, BSC_USDT)
  assert.equal(balance.symbol, 'USDT')
  assert.equal(balance.quantity, '25.123456789')
  assert.equal(balance.decimals, 18)
})

test('Sell uses the selected token contract and its actual decimals', async () => {
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body)
    const calls = decodeFunctionData({ abi: multicall3Abi, data: request.params[0].data }).args[0]
    assert.equal(calls.length, 2)
    const result = calls.map(call => {
      assert.equal(call.target.toLowerCase(), tokenAddresses.NVDAon.toLowerCase())
      const read = decodeFunctionData({ abi: erc20Abi, data: call.callData })
      if (read.functionName === 'balanceOf') assert.equal(read.args[0].toLowerCase(), owner)
      return { success: true, returnData: encodeFunctionResult({ abi: erc20Abi, functionName: read.functionName, result: read.functionName === 'decimals' ? 8 : parseUnits('0.12345678', 8) }) }
    })
    return Response.json({ jsonrpc: '2.0', id: request.id, result: encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result }) })
  }
  const balance = await readTradeBalance(owner, { symbol: 'NVDAon', address: tokenAddresses.NVDAon })
  assert.equal(balance.quantity, '0.12345678')
  assert.equal(balance.decimals, 8)
})

test('a verified zero is displayed as zero while an RPC failure is rejected', async () => {
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body)
    return Response.json({ jsonrpc: '2.0', id: request.id, result: encodeFunctionResult({ abi: erc20Abi, functionName: 'balanceOf', result: 0n }) })
  }
  assert.equal((await readTradeBalance(owner, BSC_USDT)).quantity, '0')
  globalThis.fetch = async () => { throw new Error('fixture RPC unavailable') }
  await assert.rejects(readTradeBalance(owner, BSC_USDT))
})

test('invalid wallet or token addresses cannot start a balance RPC', async () => {
  globalThis.fetch = async () => { assert.fail('invalid addresses must not make an RPC') }
  await assert.rejects(readTradeBalance('invalid', BSC_USDT), /Invalid balance request/)
  await assert.rejects(readTradeBalance(owner, { symbol: 'NVDAon', address: 'invalid' }), /Invalid balance request/)
})
