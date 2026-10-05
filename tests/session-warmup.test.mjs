import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSessionWarmup } from '../lib/session-warmup.ts'
import { withWalletSession } from '../lib/wallet-session.ts'

test('amount entry warms one session read; the quote consumes it without another SDK call', async () => {
  let calls = 0, release
  const session = createSessionWarmup(() => { calls++; return new Promise(resolve => { release = resolve }) })
  session.warm(); session.warm()
  await Promise.resolve()
  assert.equal(calls, 1)
  const taken = session.take()
  release('fixture-access')
  assert.equal(await taken, 'fixture-access')
  assert.equal(calls, 1)
  const fresh = session.take()
  release('fresh-access')
  assert.equal(await fresh, 'fresh-access')
  assert.equal(calls, 2)
})
test('authentication retry does not reuse the consumed warm token', async () => {
  let calls = 0, sends = 0
  const warmed = createSessionWarmup(async () => `access-${++calls}`)
  warmed.warm()
  const result = await withWalletSession({ getAccessToken: warmed.take, getIdentityToken: () => null, refreshIdentityToken: async () => null }, async value => {
    if (++sends === 1) { assert.equal(value.accessToken, 'access-1'); throw new Error('unauthorized') }
    assert.equal(value.accessToken, 'access-2'); return 'accepted'
  })
  assert.equal(result, 'accepted'); assert.equal(calls, 2)
})
test('expired and cleared warm sessions are discarded', async () => {
  let time = 0, calls = 0
  const warmed = createSessionWarmup(async () => `access-${++calls}`, () => time)
  warmed.warm(); await Promise.resolve(); time = 10_001
  assert.equal(await warmed.take(), 'access-2')
  warmed.warm(); await Promise.resolve(); warmed.clear()
  assert.equal(await warmed.take(), 'access-4')
})
test('a failed warmup cannot poison the next session read', async () => {
  let calls = 0
  const warmed = createSessionWarmup(async () => { if (++calls === 1) throw new Error('fixture failure'); return 'fresh-access' })
  warmed.warm()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(await warmed.take(), 'fresh-access')
})
