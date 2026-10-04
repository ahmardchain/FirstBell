import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOnramperDemoUrl, isOnramperDemo, isOnramperDemoUrl } from '../lib/onramper-demo.ts'
import { requestOnramperDemoWidget } from '../src/onramper-demo.ts'
import { handleApiRequest } from '../worker/router.ts'
import { getOnramperCredentials } from '../worker/onramper.ts'

const key = 'pk_test_demo_fixture'
const request = (suffix = '', method = 'GET') => new Request(`https://firstbell.example/api/onramper/demo-widget${suffix}`, { method })

test('widget preview needs only a test key and never contacts wallet, account or funding services', async () => {
  const original = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => { calls++; throw new Error('Unexpected provider request') }
  try {
    const env = { ONRAMPER_API_KEY: key, ACCOUNTS: { idFromName() { throw new Error('Unexpected account lookup') } } }
    const response = await handleApiRequest(request('?theme=dark&wallets=attacker&partnerContext=attacker&defaultCrypto=attacker'), env)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    const result = await response.json()
    assert.deepEqual(Object.keys(result).sort(), ['demo', 'mode', 'widgetUrl'])
    assert.equal(result.demo, true); assert.equal(result.mode, 'sandbox')
    assert.equal(isOnramperDemoUrl(result.widgetUrl), true)
    const url = new URL(result.widgetUrl)
    assert.equal(url.origin, 'https://buy.onramper.dev')
    assert.equal(url.searchParams.get('apiKey'), key)
    assert.equal(url.searchParams.get('themeName'), 'dark')
    for (const field of ['wallets', 'networkWallets', 'partnerContext', 'onlyCryptos', 'defaultCrypto', 'sigV2', 'successRedirectUrl', 'email'])
      assert.equal(url.searchParams.has(field), false)
    assert.equal(calls, 0)
    await assert.rejects(getOnramperCredentials(env), { reason: 'not_configured' }, 'Tracked checkout still requires its full configuration')
    assert.equal((await handleApiRequest(new Request('https://firstbell.example/api/deposits/checkout', { method: 'POST' }), env)).status, 401)
  } finally { globalThis.fetch = original }
})

test('preview refuses production, invalid and missing keys and cannot accept funding writes', async () => {
  for (const env of [{}, { ONRAMPER_API_KEY: 'pk_prod_fixture' }, { ONRAMPER_API_KEY: key, ONRAMPER_ENVIRONMENT: 'live' },
    { ONRAMPER_API_KEY: key, ONRAMPER_ENVIRONMENT: 'typo' }, { ONRAMPER_API_KEY: 'pk_test_bad&wallets=attacker' }]) {
    const response = await handleApiRequest(request(), env)
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), { error: 'demo_not_configured' })
  }
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await handleApiRequest(request('', method), { ONRAMPER_API_KEY: key })).status, 405)
  assert.throws(() => createOnramperDemoUrl('pk_prod_fixture', 'light'))
})

test('demo handoff rejects live hosts, sensitive parameters and duplicate query values', () => {
  const value = createOnramperDemoUrl(key, 'light')
  assert.equal(isOnramperDemoUrl(value), true)
  for (const altered of [value.replace('.dev', '.com'), value.replace('https:', 'http:'), `${value}&wallets=attacker`,
    `${value}&apiKey=${key}`, `${value}#session`, value.replace('banxa', 'another')]) assert.equal(isOnramperDemoUrl(altered), false)
  assert.equal(isOnramperDemo(''), false)
  assert.equal(isOnramperDemo('?demo=true'), false)
  assert.equal(isOnramperDemo('?demo=onramper&view=deposit'), true)
})

test('frontend preview makes a public read and only accepts an explicitly marked sandbox response', async () => {
  const signal = new AbortController().signal
  const widgetUrl = createOnramperDemoUrl(key, 'light')
  const fetcher = async (url, init) => {
    assert.equal(url, '/api/onramper/demo-widget?theme=light')
    assert.equal(init.signal, signal)
    assert.equal(init.cache, 'no-store')
    assert.equal(init.headers, undefined)
    assert.equal(init.body, undefined)
    return Response.json({ demo: true, mode: 'sandbox', widgetUrl })
  }
  assert.equal(await requestOnramperDemoWidget('light', signal, fetcher), widgetUrl)
  for (const result of [{ mode: 'sandbox', widgetUrl }, { demo: true, mode: 'live', widgetUrl },
    { demo: true, mode: 'sandbox', widgetUrl: widgetUrl.replace('.dev', '.com') }])
    await assert.rejects(requestOnramperDemoWidget('light', signal, async () => Response.json(result)), /provider_unavailable/)
  await assert.rejects(requestOnramperDemoWidget('light', signal, async () => Response.json({ error: 'demo_not_configured' }, { status: 503 })), /demo_not_configured/)
})
