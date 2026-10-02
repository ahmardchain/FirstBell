import { createHash, timingSafeEqual } from 'node:crypto'
import { checkBinanceMarket } from './market-check.mjs'

const reply = (data, status = 200, headers = {}) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
})
const digest = value => createHash('sha256').update(value).digest()

// This private comparison service has only two fixed, read-only upstream calls.
export function createProbe({ env = process.env, fetcher = globalThis.fetch, clock = Date.now } = {}) {
  let running = false
  let nextAllowed = 0
  return async function probe(request) {
    if (request.method !== 'POST') return reply({ error: 'use_post' }, 405, { Allow: 'POST' })
    const expected = env.BINANCE_TEST_TOKEN?.trim() || ''
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(expected)) return reply({ error: 'test_not_configured' }, 503)
    const authorization = request.headers.get('authorization') || ''
    const candidate = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(authorization)?.[1]
    if (!candidate || !timingSafeEqual(digest(candidate), digest(expected))) return reply({ error: 'unauthorized' }, 401)
    const apiKey = env.BINANCE_WEB3_API_KEY?.trim() || ''
    const secretKey = env.BINANCE_WEB3_SECRET_KEY?.trim() || ''
    if (!apiKey || !secretKey) return reply({ error: 'test_not_configured' }, 503)
    if (new URL(request.url).search) return reply({ error: 'no_query_parameters' }, 400)
    // Cooldown is per process/isolate, not a global rate-limit guarantee.
    if (running || clock() < nextAllowed) return reply({ error: 'wait_before_retry' }, 429, { 'Retry-After': '20' })
    running = true
    nextAllowed = clock() + 20_000
    const startedAt = new Date(clock()).toISOString()
    try {
      const reports = await checkBinanceMarket({ apiKey, secretKey }, fetcher)
      const onVercel = env.VERCEL === '1'
      return reply({
        test: 'NVDAon / BSC 56 / candles and price-info', startedAt,
        hosting: {
          platform: onVercel ? 'vercel-node' : 'node',
          configuredRegion: onVercel ? 'fra1' : null,
          reportedRuntimeRegion: /^[a-z]{3}\d$/.test(env.VERCEL_REGION || '') ? env.VERCEL_REGION : null,
        },
        result: reports.every(report => report.result === 'accepted') ? 'both_accepted' : 'not_both_accepted',
        requests: reports,
      })
    } catch {
      return reply({ error: 'test_failed' }, 502)
    } finally { running = false }
  }
}
