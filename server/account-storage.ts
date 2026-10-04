import { handleAccountRequest } from '../worker/account-store.ts'
import type { AccountNamespace, ApiEnv, KeyValueStore } from '../worker/env.ts'
import { loadLegacyAccount } from './legacy-account.ts'
import { AccountStorageError } from './storage-error.ts'

export type StorageEnv = {
  UPSTASH_REDIS_REST_URL?: string
  UPSTASH_REDIS_REST_TOKEN?: string
  KV_REST_API_URL?: string
  KV_REST_API_TOKEN?: string
  LEGACY_ACCOUNTS_ORIGIN?: string
}

const maxBytes = 1_500_000
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const readScript = "return redis.call('GET', KEYS[1])"
const commitScript = `
if (redis.call('GET', KEYS[1]) or '') ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`
// Sliding window in one atomic command, independent of account/deposit records.
const quoteRateScript = `
local now = tonumber(ARGV[1])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - 60000)
if redis.call('ZCARD', KEYS[1]) >= 6 then return 0 end
redis.call('ZADD', KEYS[1], now, ARGV[2])
redis.call('PEXPIRE', KEYS[1], 61000)
return 1
`

async function readBounded(response: Response): Promise<string> {
  if (!response.body || Number(response.headers.get('Content-Length')) > maxBytes * 2) throw new AccountStorageError('account_storage_unavailable')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let size = 0, text = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) return text + decoder.decode()
      size += chunk.value.byteLength
      if (size > maxBytes * 2) { await reader.cancel(); throw new AccountStorageError('account_storage_unavailable') }
      text += decoder.decode(chunk.value, { stream: true })
    }
  } finally { reader.releaseLock() }
}

function credentials(env: StorageEnv): { url: string; token: string } {
  const raw = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN
  if (!raw || !token) throw new AccountStorageError('account_storage_not_configured')
  let url: URL
  try { url = new URL(raw) } catch { throw new AccountStorageError('account_storage_not_configured') }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.upstash\.io$/.test(url.hostname)
    || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash)
    throw new AccountStorageError('account_storage_not_configured')
  return { url: url.origin, token }
}

// There is no process-local persistence or lease that can expire mid-update.
// A version comparison and write occur in one Redis script, across instances.
export function createAccountNamespace(env: Omit<ApiEnv, 'ACCOUNTS'> & StorageEnv, {
  fetcher = globalThis.fetch, legacyAuthorization = null,
}: { fetcher?: typeof fetch; legacyAuthorization?: string | null } = {}): AccountNamespace {
  const command = async (args: unknown[]): Promise<unknown> => {
    const config = credentials(env)
    try {
      const response = await fetcher(config.url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5_000),
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
      if (!response.ok) throw new AccountStorageError('account_storage_unavailable')
      const data: unknown = JSON.parse(await readBounded(response))
      if (!object(data) || 'error' in data || !('result' in data)) throw new AccountStorageError('account_storage_unavailable')
      return data.result
    } catch { throw new AccountStorageError('account_storage_unavailable') }
  }
  return {
    idFromName: name => name,
    get: name => ({ async fetch(request) {
      const fail = (error: string, status = 503) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } })
      if (!/^did:privy:[a-zA-Z0-9_-]{3,128}$/.test(name) || request.headers.get('X-Privy-DID') !== name) return fail('Invalid account', 400)
      const key = `firstbell:accounts:v1:${name}`
      try {
        credentials(env)
        if (new URL(request.url).pathname === '/quote-rate') {
          if (request.method !== 'POST') return fail('Method not allowed', 405)
          const allowed = await command(['EVAL', quoteRateScript, 1, `firstbell:quote-rate:v1:${name}`, Date.now(), crypto.randomUUID()])
          if (allowed !== 0 && allowed !== 1) throw new AccountStorageError('account_storage_unavailable')
          return allowed === 1 ? Response.json({ allowed: true }, { headers: { 'Cache-Control': 'no-store' } })
            : fail('Quote limit reached. Try again in a minute.', 429)
        }
        for (let attempt = 0; attempt < 3; attempt++) {
          const original = await command(['EVAL', readScript, 1, key])
          if (original !== null && typeof original !== 'string') throw new AccountStorageError('account_storage_unavailable')
          let values: Record<string, unknown> = {}
          let dirty = false
          if (original !== null) {
            const parsed: unknown = JSON.parse(original)
            if (!object(parsed) || typeof parsed.revision !== 'string' || !object(parsed.values)) throw new AccountStorageError('account_storage_unavailable')
            values = parsed.values
          } else if (env.LEGACY_ACCOUNTS_ORIGIN) {
            values = await loadLegacyAccount(env.LEGACY_ACCOUNTS_ORIGIN, legacyAuthorization, name, fetcher)
            dirty = true
          }
          const storage: KeyValueStore = {
            async get<T>(item: string) { return structuredClone(values[item]) as T | undefined },
            async put<T>(item: string, value: T) { values[item] = structuredClone(value); dirty = true },
          }
          const response = await handleAccountRequest(request.clone() as unknown as Request, env, storage)
          if (!dirty) return response
          const serialized = JSON.stringify({ revision: crypto.randomUUID(), values })
          if (new TextEncoder().encode(serialized).byteLength > maxBytes) throw new AccountStorageError('account_storage_unavailable')
          const committed = await command(['EVAL', commitScript, 1, key, original ?? '', serialized])
          if (committed === 1) return response
          if (committed !== 0) throw new AccountStorageError('account_storage_unavailable')
          // Retry only a known conflict, never an ambiguous network/write failure.
        }
        return fail('Your account is updating. Please try again.', 409)
      } catch (error) {
        return fail(error instanceof AccountStorageError ? error.message : 'account_storage_unavailable')
      }
    } }),
  }
}
