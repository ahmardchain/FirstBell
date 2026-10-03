import { handleApiRequest } from '../worker/router.ts'
import { canonicalIp } from '../worker/moonpay.ts'
import type { ApiEnv } from '../worker/env.ts'
import { createAccountNamespace } from './account-storage.ts'

export function normalizeVercelRequest(request: Request, onVercel: boolean): Request {
  const url = new URL(request.url)
  if (url.pathname === '/api/index') {
    const route = url.searchParams.get('__fb_path')
    if (!route || !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(route)) throw new Error('invalid_route')
    url.pathname = `/api/${route}`
  }
  url.searchParams.delete('__fb_path')
  const forwarded = new Request(url, request)
  // Client-supplied Cloudflare headers must not authenticate a checkout IP.
  for (const name of ['CF-Connecting-IP', 'CF-Connecting-IPv6', 'True-Client-IP']) forwarded.headers.delete(name)
  const clientIp = onVercel ? canonicalIp(request.headers.get('x-vercel-forwarded-for')) : null
  if (clientIp) forwarded.headers.set('CF-Connecting-IP', clientIp)
  return forwarded
}

export function createVercelHandler(environment: Record<string, string | undefined> = process.env) {
  return async function fetch(request: Request): Promise<Response> {
    let forwarded: Request
    try { forwarded = normalizeVercelRequest(request, environment.VERCEL === '1') }
    catch { return Response.json({ error: 'Invalid API route' }, { status: 400, headers: { 'Cache-Control': 'no-store' } }) }
    const config: Omit<ApiEnv, 'ACCOUNTS'> = {
      PRIVY_APP_ID: environment.PRIVY_APP_ID?.trim() || environment.VITE_PRIVY_APP_ID?.trim() || 'cmun7bqhg00070ck6mdyqp888',
      PRIVY_VERIFICATION_KEY: environment.PRIVY_VERIFICATION_KEY,
      PRIVY_APP_SECRET: environment.PRIVY_APP_SECRET,
      BINANCE_WEB3_API_KEY: environment.BINANCE_WEB3_API_KEY,
      BINANCE_WEB3_SECRET_KEY: environment.BINANCE_WEB3_SECRET_KEY,
      ONDO_API_KEY: environment.ONDO_API_KEY,
      MOONPAY_PUBLISHABLE_KEY: environment.MOONPAY_PUBLISHABLE_KEY,
      MOONPAY_SECRET_KEY: environment.MOONPAY_SECRET_KEY,
      MOONPAY_ENVIRONMENT: environment.MOONPAY_ENVIRONMENT,
      CARD_FUNDING_PROVIDER: environment.CARD_FUNDING_PROVIDER,
      ONRAMPER_API_KEY: environment.ONRAMPER_API_KEY,
      ONRAMPER_SIGNING_PRIVATE_KEY: environment.ONRAMPER_SIGNING_PRIVATE_KEY,
      ONRAMPER_WEBHOOK_SECRET: environment.ONRAMPER_WEBHOOK_SECRET,
      ONRAMPER_ENVIRONMENT: environment.ONRAMPER_ENVIRONMENT,
      ONRAMPER_BSC_USDT_ID: environment.ONRAMPER_BSC_USDT_ID,
    }
    const env: ApiEnv = { ...config, ACCOUNTS: createAccountNamespace({ ...config,
      UPSTASH_REDIS_REST_URL: environment.UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN: environment.UPSTASH_REDIS_REST_TOKEN,
      KV_REST_API_URL: environment.KV_REST_API_URL,
      KV_REST_API_TOKEN: environment.KV_REST_API_TOKEN,
      LEGACY_ACCOUNTS_ORIGIN: environment.LEGACY_ACCOUNTS_ORIGIN,
    }, { legacyAuthorization: forwarded.headers.get('Authorization') }) }
    try { return await handleApiRequest(forwarded, env) }
    catch { return Response.json({ error: 'Service unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }) }
  }
}
