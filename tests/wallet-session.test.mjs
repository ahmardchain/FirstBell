import assert from 'node:assert/strict'
import { test } from 'node:test'
import { withWalletSession, WalletSessionError } from '../lib/wallet-session.ts'

// Client freshness hints only. Backend JWT verification is tested separately.
const token = seconds => `header.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds })).toString('base64url')}.signature`
const source = overrides => ({ getAccessToken: async () => 'fixture-access', getIdentityToken: () => token(600),
  refreshIdentityToken: async () => token(900), ...overrides })

test('cached identity can open checkout without the redundant Privy refresh that fails', async () => {
  const identity = token(600)
  let refreshes = 0, requests = 0
  const result = await withWalletSession(source({ getIdentityToken: () => identity,
    refreshIdentityToken: async () => { refreshes++; throw new Error('refresh failed') } }), async session => {
    requests++
    assert.deepEqual(session, { accessToken: 'fixture-access', identityToken: identity })
    return { checkoutUrl: 'https://buy-sandbox.moonpay.com/' }
  })
  assert.equal(result.checkoutUrl, 'https://buy-sandbox.moonpay.com/')
  assert.equal(requests, 1)
  assert.equal(refreshes, 0)
})

test('missing, expired or malformed identity reaches server verification without a client refresh', async () => {
  for (const cached of [null, token(-60), 'bad-token']) {
    let refreshes = 0
    await withWalletSession(source({ getIdentityToken: () => cached,
      refreshIdentityToken: async () => { refreshes++; return null } }), async session => {
      assert.equal(session.identityToken, '')
      assert.equal(session.accessToken, 'fixture-access')
    })
    assert.equal(refreshes, 0)
  }
})

test('explicit wallet rejection refreshes the proof and retries once, with fresh access', async () => {
  let sends = 0, refreshes = 0, accesses = 0
  const fresh = token(900)
  const result = await withWalletSession(source({ getAccessToken: async () => `access-${++accesses}`,
    refreshIdentityToken: async () => { refreshes++; return fresh } }), async session => {
    if (++sends === 1) throw new Error('wallet_not_verified')
    assert.deepEqual(session, { accessToken: 'access-2', identityToken: fresh })
    return 'accepted'
  })
  assert.equal(result, 'accepted')
  assert.equal(sends, 2)
  assert.equal(refreshes, 1)
  await assert.rejects(() => withWalletSession(source(), async () => { throw new Error('wallet_not_verified') }), /wallet_not_verified/)
})

test('provider and network failures never retry a possibly created checkout', async () => {
  for (const failure of [new Error('provider_unavailable'), new TypeError('Failed to fetch')]) {
    let sends = 0, refreshes = 0
    await assert.rejects(() => withWalletSession(source({ refreshIdentityToken: async () => { refreshes++; return token(600) } }),
      async () => { sends++; throw failure }), error => error === failure)
    assert.equal(sends, 1)
    assert.equal(refreshes, 0)
  }
})

test('unavailable access session gives a fixed error and never calls checkout', async () => {
  const cases = [
    [source({ getAccessToken: async () => null }), 'unauthorized'],
    [source({ getAccessToken: async () => { throw new Error('private upstream detail') } }), 'session_unavailable'],
  ]
  for (const [auth, reason] of cases) {
    await assert.rejects(() => withWalletSession(auth, async () => { assert.fail('request must not be sent') }),
      error => error instanceof WalletSessionError && error.message === reason)
  }
})

test('disabled identity-token feature cannot trigger endless refreshes after a server setup error', async () => {
  let sends = 0, refreshes = 0
  await assert.rejects(() => withWalletSession(source({ getIdentityToken: () => null,
    refreshIdentityToken: async () => { refreshes++; return null } }), async session => {
    sends++; assert.equal(session.identityToken, ''); throw new Error('wallet_verification_not_configured')
  }), /wallet_verification_not_configured/)
  assert.equal(sends, 1); assert.equal(refreshes, 0)
})

test('a hanging access-token getter times out and never starts checkout', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const pending = withWalletSession(source({ getAccessToken: () => new Promise(() => {}) }),
    async () => { assert.fail('a timed-out session must never submit a checkout') })
  const rejected = assert.rejects(pending, error => error instanceof WalletSessionError && error.message === 'session_timeout')
  context.mock.timers.tick(6001)
  await rejected
})
