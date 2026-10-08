import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encodeAbiParameters, encodeEventTopics, erc20Abi, parseUnits } from 'viem'
import { verifyBinanceSettlement } from '../agent-runtime/settlement.mjs'
import { BSC_USDT } from '../lib/funding.ts'
import { tokenAddresses } from '../lib/asset-catalog.ts'

const wallet = '0x' + '11'.repeat(20), router = '0x' + '22'.repeat(20), hash = '0x' + 'ab'.repeat(32)
const row = { wallet, fromToken: BSC_USDT.address, toToken: tokenAddresses.NVDAon, amount: '1' }
const transfer = (address, from, to, value) => ({ address, topics: encodeEventTopics({ abi: erc20Abi, eventName: 'Transfer', args: { from, to } }), data: encodeAbiParameters([{ type: 'uint256' }], [value]) })
const receipt = () => ({ status: 'success', transactionHash: hash, blockNumber: 100n, logs: [transfer(row.fromToken, wallet, router, parseUnits('1', 18)), transfer(row.toToken, router, wallet, parseUnits('0.00499', 8))] })
const fixture = (value = receipt(), chain = 56, tip = 101n) => ({ getChainId: async () => chain, getBlockNumber: async () => tip, getTransactionReceipt: async () => value, readContract: async ({ address }) => address === row.fromToken ? 18 : 8 })
test('Binance settlement reads actual transfers using on-chain decimals, never indicative quote quantities', async () => {
  assert.deepEqual(await verifyBinanceSettlement(row, hash, fixture()), { txHash: hash, inputAmount: '1', outputAmount: '0.00499' })
})
test('wrong chain, failed receipt, wrong hash and fewer than two confirmations cannot prove a Binance fill', async () => {
  for (const rpc of [fixture(receipt(), 97), fixture({ ...receipt(), status: 'reverted' }), fixture({ ...receipt(), transactionHash: '0x' + 'cc'.repeat(32) }), fixture(receipt(), 56, 100n)])
    assert.equal(await verifyBinanceSettlement(row, hash, rpc), null)
  assert.equal(await verifyBinanceSettlement(row, 'not-a-hash', fixture()), null)
})
test('unrelated recipients, wrong contracts and spending above the reviewed amount cannot prove a Binance fill', async () => {
  for (const logs of [
    [transfer(row.fromToken, wallet, router, parseUnits('1', 18)), transfer(row.toToken, router, router, 499000n)],
    [transfer(row.fromToken, wallet, router, parseUnits('1', 18)), transfer(tokenAddresses.AAPLon, router, wallet, 499000n)],
    [transfer(row.fromToken, wallet, router, parseUnits('1.000000000000000001', 18)), transfer(row.toToken, router, wallet, 499000n)],
  ]) assert.equal(await verifyBinanceSettlement(row, hash, fixture({ ...receipt(), logs })), null)
})
