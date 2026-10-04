import assert from 'node:assert/strict'
import { test } from 'node:test'
import { quoteResponse } from '../worker/quote-response.ts'
import { PREPARE_TIMEOUT_MS, QUOTE_TIMEOUT_MS } from '../lib/quote-timeout.ts'

test('quote responses expose total timing without caching a live price', async () => {
  const response = await quoteResponse(new Request('https://firstbell.test/api/trade/route'), async () => Response.json({ price: 'fixture' }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.match(response.headers.get('Server-Timing'), /^trade;dur=\d+$/)
  assert.deepEqual(await response.json(), { price: 'fixture' })
})

test('a total deadline bounds hanging authentication or storage and rejects late plans', async context => {
  for (const [stage, budget] of [['route', QUOTE_TIMEOUT_MS], ['prepare', PREPARE_TIMEOUT_MS]]) {
    const deadline = new AbortController()
    context.mock.method(AbortSignal, 'timeout', milliseconds => {
      assert.equal(milliseconds, budget - 1000)
      return deadline.signal
    })
    let started, release
    const actionStarted = new Promise(resolve => { started = resolve })
    const pending = quoteResponse(new Request(`https://firstbell.test/api/trade/${stage}`), async bounded => {
      started()
      await new Promise(resolve => { release = resolve })
      assert.equal(bounded.signal.aborted, true)
      return Response.json({ plan: 'late unsigned fixture' })
    })
    await actionStarted; deadline.abort(new DOMException('Fixture timeout', 'TimeoutError'))
    const response = await pending
    assert.equal(response.status, 504)
    assert.deepEqual(await response.json(), { error: 'quote_timeout' })
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    release()
    await new Promise(resolve => setImmediate(resolve))
    context.mock.restoreAll()
  }
})

test('an already cancelled quote does not start the handler', async () => {
  const cancelled = new AbortController(); cancelled.abort()
  const response = await quoteResponse(new Request('https://firstbell.test/api/trade/route', { signal: cancelled.signal }), async () => {
    assert.fail('cancelled callback must not run')
  })
  assert.equal(response.status, 504)
})
