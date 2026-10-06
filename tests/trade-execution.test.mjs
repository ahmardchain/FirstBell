import assert from 'node:assert/strict'
import { test } from 'node:test'
import { encodeFunctionData, erc20Abi, hashTypedData } from 'viem'
import { COW_ORDER_FIELDS, COW_RELAYER, COW_SETTLEMENT } from '../lib/agent-trading.ts'
import { tokenAddresses } from '../lib/asset-catalog.ts'
import { BSC_USDT } from '../lib/funding.ts'
import { executeReviewedTrade } from '../lib/trade-execution.ts'

const wallet = `0x${'11'.repeat(20)}`
const request = { symbol: 'NVDAon', side: 'buy', amount: '25', walletAddress: wallet }
const raw = '25000000000000000000', receive = '100000000000000000'
const signature = `0x${'aa'.repeat(65)}`
const order = { orderId: 'fixture-order', status: 'PENDING_VENDOR', txHash: null, inputAmount: null, outputAmount: null, receiptToken: 'fixture-receipt' }
function plan(approval = false) {
  const typedData = { domain: { name: 'Gnosis Protocol', version: 'v2', chainId: 56, verifyingContract: COW_SETTLEMENT }, types: { Order: COW_ORDER_FIELDS.map(field => ({ ...field })) }, primaryType: 'Order', message: {
    sellToken: BSC_USDT.address, buyToken: tokenAddresses.NVDAon, receiver: wallet, sellAmount: raw, buyAmount: receive, validTo: Math.floor(Date.now() / 1000) + 600,
    appData: `0x${'00'.repeat(32)}`, feeAmount: '0', kind: 'sell', partiallyFillable: false, sellTokenBalance: 'erc20', buyTokenBalance: 'erc20',
  } }
  return { route: { source: 'binance-web3', chainId: 56, symbol: 'NVDAon', side: 'buy', walletAddress: wallet, inputAmount: '25', inputSymbol: 'USDT', outputAmount: '0.1', outputSymbol: 'NVDAon', vendor: 'CowSwap', executionMode: 'RFQ', executable: false },
    inputDecimals: 18, outputDecimals: 18, rawAmount: raw, minimumReceive: receive, feeAmount: '0', slippagePercent: '0.5', expiresAt: new Date(typedData.message.validTo * 1000).toISOString(),
    requestId: '12345678-1234-1234-1234-123456789abc', orderQuoteId: 'fixture-quote', typedData, typedDataHash: hashTypedData(typedData), planToken: 'fixture-plan',
    approval: approval ? { chainId: 56, to: BSC_USDT.address, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [COW_RELAYER, BigInt(raw)] }), value: '0', amount: raw, spender: COW_RELAYER, reset: false, gasFeeBnb: '0.0001', simulated: true } : null }
}
function ports(overrides = {}) {
  const calls = []
  return { calls, assertWallet: owner => { assert.equal(owner, wallet); calls.push('wallet') }, switchChain: async () => { calls.push('chain') },
    approve: async () => { calls.push('approve'); return `0x${'ab'.repeat(32)}` }, waitApproval: async () => { calls.push('receipt'); return { status: 'success' } },
    signing: async () => { calls.push('sign'); return signature }, onApproval: () => { calls.push('approval-pending') },
    onSigned: attempt => { calls.push('signed'); assert.equal(attempt.signature, signature) }, submit: async () => { calls.push('submit'); return order }, ...overrides }
}
test('Confirm signs the reviewed order once and submits the same quote and request ID', async () => {
  const reviewed = plan()
  const io = ports({ submit: async attempt => {
    assert.equal(attempt.plan.requestId, reviewed.requestId)
    assert.equal(attempt.plan.orderQuoteId, reviewed.orderQuoteId)
    assert.equal(attempt.plan.planToken, reviewed.planToken)
    assert.equal(attempt.plan.typedDataHash, reviewed.typedDataHash)
    assert.equal(attempt.signature, signature)
    return order
  } })
  assert.deepEqual(await executeReviewedTrade(reviewed, request, io), { kind: 'order', order })
  assert.equal(io.calls.filter(call => call === 'sign').length, 1)
  assert.equal(io.calls.includes('approve'), false)
})
test('changed amount, token, side or wallet fails before opening a wallet confirmation', async () => {
  for (const changed of [{ amount: '26' }, { symbol: 'TSLAon' }, { side: 'sell' }, { walletAddress: `0x${'22'.repeat(20)}` }]) {
    const io = ports()
    await assert.rejects(executeReviewedTrade(plan(), { ...request, ...changed }, io), /invalid_order_payload/)
    assert.deepEqual(io.calls, [])
  }
})
test('a wallet change during chain switching stops signing and submission', async () => {
  let changed = false
  const io = ports({ switchChain: async () => { changed = true }, assertWallet: () => { if (changed) throw new Error('wallet_changed') } })
  await assert.rejects(executeReviewedTrade(plan(), request, io), /wallet_changed/)
  assert.equal(io.calls.includes('sign'), false)
  assert.equal(io.calls.includes('submit'), false)
})
test('wallet rejection never submits an order', async () => {
  const io = ports({ signing: async () => { throw new Error('4001: user rejected') } })
  await assert.rejects(executeReviewedTrade(plan(), request, io), /user rejected/)
  assert.equal(io.calls.includes('signed'), false)
  assert.equal(io.calls.includes('submit'), false)
})
test('wallet change during signature confirmation cannot submit under another session', async () => {
  let changed = false
  const io = ports({ signing: async () => { changed = true; return signature }, assertWallet: () => { if (changed) throw new Error('wallet_changed') } })
  await assert.rejects(executeReviewedTrade(plan(), request, io), /wallet_changed/)
  assert.equal(io.calls.includes('signed'), false)
  assert.equal(io.calls.includes('submit'), false)
})
test('approval waits for a confirmed receipt and never automatically signs or submits', async () => {
  const io = ports()
  assert.deepEqual(await executeReviewedTrade(plan(true), request, io), { kind: 'approval' })
  assert.deepEqual(io.calls.filter(call => call !== 'wallet'), ['chain', 'approve', 'approval-pending', 'receipt'])
})
test('failed approval cannot become a trade or success', async () => {
  const io = ports({ waitApproval: async () => ({ status: 'reverted' }) })
  await assert.rejects(executeReviewedTrade(plan(true), request, io), /approval_failed/)
  assert.equal(io.calls.includes('sign'), false)
  assert.equal(io.calls.includes('submit'), false)
})
test('an unknown submission preserves the exact signed attempt for recovery', async () => {
  const reviewed = plan()
  let saved
  const io = ports({ onSigned: attempt => { saved = attempt }, submit: async () => { throw new Error('submission_unknown') } })
  await assert.rejects(executeReviewedTrade(reviewed, request, io), /submission_unknown/)
  assert.equal(saved.plan.requestId, reviewed.requestId)
  assert.equal(saved.plan.planToken, reviewed.planToken)
  assert.equal(saved.signature, signature)
})
test('an acknowledged receipt reaches the submission handler before a late wallet-change rejection', async () => {
  let changed = false, saved
  const io = ports({ assertWallet: () => { if (changed) throw new Error('wallet_changed') }, submit: async () => { saved = order; changed = true; return order } })
  await assert.rejects(executeReviewedTrade(plan(), request, io), /wallet_changed/)
  assert.deepEqual(saved, order)
})
test('an expired order cannot open wallet confirmation', async () => {
  const reviewed = plan()
  reviewed.typedData.message.validTo = Math.floor(Date.now() / 1000) - 1
  const io = ports()
  await assert.rejects(executeReviewedTrade(reviewed, request, io), /invalid_order_payload/)
  assert.deepEqual(io.calls, [])
})

test('direct Confirm continues from a successful approval into the exact reviewed order', async () => {
  const reviewed = plan(true)
  const io = ports({ continueAfterApproval: true, submit: async attempt => {
    assert.equal(attempt.plan.typedDataHash, reviewed.typedDataHash)
    assert.equal(attempt.plan.requestId, reviewed.requestId)
    assert.equal(attempt.plan.orderQuoteId, reviewed.orderQuoteId)
    return order
  } })
  assert.deepEqual(await executeReviewedTrade(reviewed, request, io), { kind: 'order', order })
  assert.deepEqual(io.calls.filter(call => call !== 'wallet'), ['chain', 'approve', 'approval-pending', 'receipt', 'sign', 'signed'])
})

test('a quote expiring while permission confirms cannot be signed automatically', async t => {
  let clock = Date.now()
  t.mock.method(Date, 'now', () => clock)
  const reviewed = plan(true)
  const io = ports({ continueAfterApproval: true, waitApproval: async () => { clock += 601_000; return { status: 'success' } } })
  await assert.rejects(executeReviewedTrade(reviewed, request, io), /stale_quote/)
  assert.equal(io.calls.includes('sign'), false)
  assert.equal(io.calls.includes('submit'), false)
})

test('a changed permission-refresh order requires a fresh review before signing', async () => {
  const reviewed = plan(true)
  reviewed.approval.reset = true; reviewed.approval.amount = '0'
  reviewed.approval.data = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [COW_RELAYER, 0n] })
  const changed = plan(true); changed.requestId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  const io = ports({ continueAfterApproval: true, nextApproval: async () => changed })
  await assert.rejects(executeReviewedTrade(reviewed, request, io), /invalid_order_payload/)
  assert.equal(io.calls.includes('sign'), false)
})
