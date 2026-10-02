import { isAddress } from 'viem'
import { isSymbol } from '../worker/market.ts'
import { AccountStorageError } from './storage-error.ts'

const legacyOrigin = 'https://firstbell.ahmardchain.workers.dev'
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const statuses = new Set(['awaiting_payment', 'action_required', 'processing', 'confirming', 'completed', 'failed', 'expired', 'test_completed'])

function sessionValid(value: unknown): boolean {
  if (!object(value)) return false
  return typeof value.id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.id)
    && typeof value.customerId === 'string' && typeof value.walletAddress === 'string' && isAddress(value.walletAddress)
    && typeof value.amount === 'string' && /^[1-9]\d{0,8}$/.test(value.amount)
    && typeof value.fiatCurrency === 'string' && /^[a-z]{3}$/.test(value.fiatCurrency)
    && (value.mode === 'live' || value.mode === 'sandbox')
    && (value.currencyCode === undefined || value.currencyCode === 'eth' || value.currencyCode === 'usdt_bsc')
    && typeof value.status === 'string' && statuses.has(value.status)
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt))
    && ['checkedAt', 'transactionId', 'transactionHash', 'receivedAmount'].every(key => value[key] === null || typeof value[key] === 'string')
}

// Optional one-time import on the user's first authenticated Vercel request.
// The user's existing Privy token is sent only to the fixed original Worker.
export async function loadLegacyAccount(origin: string, authorization: string | null, userId: string, fetcher: typeof fetch): Promise<Record<string, unknown>> {
  if (origin !== legacyOrigin || !authorization?.startsWith('Bearer ')) throw new AccountStorageError('account_import_unavailable')
  try {
    const read = async (path: string): Promise<unknown> => {
      const response = await fetcher(`${legacyOrigin}${path}`, {
        redirect: 'error', signal: AbortSignal.timeout(5_000), headers: { Authorization: authorization },
      })
      if (!response.ok || Number(response.headers.get('Content-Length')) > 1_500_000) throw new Error()
      const reader = response.body?.getReader()
      if (!reader) throw new Error()
      let bytes = 0, text = ''; const decoder = new TextDecoder()
      try {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done) break
          bytes += chunk.value.byteLength
          if (bytes > 1_500_000) { await reader.cancel(); throw new Error() }
          text += decoder.decode(chunk.value, { stream: true })
        }
      } finally { reader.releaseLock() }
      return JSON.parse(text + decoder.decode())
    }
    const [accountData, depositData] = await Promise.all([read('/api/me'), read('/api/deposits')])
    if (!object(accountData) || !object(accountData.account) || accountData.account.id !== userId
      || typeof accountData.account.createdAt !== 'string' || typeof accountData.account.lastSeenAt !== 'string'
      || !Array.isArray(accountData.account.saved) || !accountData.account.saved.every(value => typeof value === 'string' && isSymbol(value))
      || !object(depositData) || !Array.isArray(depositData.sessions) || !depositData.sessions.every(sessionValid)) throw new Error()
    return { account: accountData.account, deposits: depositData.sessions }
  } catch { throw new AccountStorageError('account_import_unavailable') }
}
