import { DurableObject } from 'cloudflare:workers'
import { handleAccountRequest } from './account-store.ts'
import { handleApiRequest } from './router.ts'
import type { ApiEnv } from './env.ts'

type Env = Omit<ApiEnv, 'ACCOUNTS'> & {
  ASSETS: Fetcher
  ACCOUNTS: DurableObjectNamespace
}

export class AccountStore extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(() => handleAccountRequest(request, apiEnv(this.env), this.ctx.storage))
  }
}

function apiEnv(env: Env): ApiEnv {
  return { ...env, ACCOUNTS: {
    idFromName: name => name,
    get: name => ({ fetch: request => env.ACCOUNTS.get(env.ACCOUNTS.idFromName(name)).fetch(request) }),
  } }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    return handleApiRequest(request, apiEnv(env))
  },
}
