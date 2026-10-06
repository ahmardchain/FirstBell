import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createQuoteScheduler } from '../lib/quote-scheduler.ts'

test('manual Get quote consumes the pending automatic request even when the response is fast', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const scheduler = createQuoteScheduler()
  let requests = 0
  const quote = async () => { requests++; return 'fixture-quote' }
  scheduler.schedule(quote)
  context.mock.timers.tick(250)
  assert.equal(await scheduler.run(quote), 'fixture-quote')
  context.mock.timers.tick(1000)
  assert.equal(requests, 1)
})
test('typing several amounts prepares only the latest amount after the pause', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const scheduler = createQuoteScheduler()
  const requests = []
  scheduler.schedule(async () => { requests.push('2') })
  context.mock.timers.tick(200)
  scheduler.schedule(async () => { requests.push('25') })
  context.mock.timers.tick(349)
  assert.deepEqual(requests, [])
  context.mock.timers.tick(1)
  assert.deepEqual(requests, ['25'])
})
test('Cancel before the typing pause never starts an API request', context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const scheduler = createQuoteScheduler()
  scheduler.schedule(async () => { assert.fail('cancelled quote must not start') })
  scheduler.clear()
  context.mock.timers.tick(2000)
})
