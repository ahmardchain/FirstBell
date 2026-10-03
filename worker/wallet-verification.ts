import { isAddress } from 'viem'
import { verifyPrivyToken } from './privy-auth.ts'

type Env = { PRIVY_APP_ID: string; PRIVY_VERIFICATION_KEY?: string; PRIVY_APP_SECRET?: string }
export class WalletVerificationError extends Error {
  status = 503
}
const verified = new Map<string, number>()
const maxBytes = 128 * 1024
const ownsWallet = (accounts: unknown, address: string) => Array.isArray(accounts) && accounts.some(account =>
  account && account.type === 'wallet' && account.chain_type === 'ethereum'
  && ['privy', 'privy_v2'].includes(account.wallet_client_type)
  && typeof account.address === 'string' && account.address.toLowerCase() === address.toLowerCase())

// Call only after the router verifies the access JWT. Never look up a DID
// supplied in the request body, or trust a wallet supplied by the client alone.
export async function verifyWalletIdentity(token: string | null, env: Env, userId: string, address: string): Promise<boolean> {
  if (!isAddress(address) || !/^did:privy:[a-zA-Z0-9_-]{3,128}$/.test(userId)) return false
  if (token) {
    const payload = await verifyPrivyToken(token, env)
    if (!payload || payload.sub !== userId || typeof payload.linked_accounts !== 'string') return false
    try { return ownsWallet(JSON.parse(payload.linked_accounts), address) } catch { return false }
  }
  // Identity tokens are an optional Privy dashboard feature. The official
  // server API provides the same ownership evidence when that feature is off.
  if (!env.PRIVY_APP_SECRET?.trim()) throw new WalletVerificationError('wallet_verification_not_configured')
  const key = `${env.PRIVY_APP_ID}:${userId}:${address.toLowerCase()}`
  if ((verified.get(key) ?? 0) > Date.now()) return true
  try {
    const response = await fetch(`https://api.privy.io/v1/users/${encodeURIComponent(userId)}`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Basic ${btoa(`${env.PRIVY_APP_ID}:${env.PRIVY_APP_SECRET.trim()}`)}`,
        'privy-app-id': env.PRIVY_APP_ID, Accept: 'application/json' },
    })
    if (!response.ok) {
      console.warn('WALLET_VERIFICATION', { reason: 'lookup_rejected', httpStatus: response.status })
      throw new WalletVerificationError(response.status === 401 || response.status === 403
        ? 'wallet_verification_not_configured' : 'wallet_verification_unavailable')
    }
    if (!response.body || Number(response.headers.get('Content-Length')) > maxBytes) throw new Error('invalid_response')
    const reader = response.body.getReader(), decoder = new TextDecoder()
    let text = '', size = 0
    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        size += chunk.value.byteLength
        if (size > maxBytes) { await reader.cancel(); throw new Error('invalid_response') }
        text += decoder.decode(chunk.value, { stream: true })
      }
    } finally { reader.releaseLock() }
    const user = JSON.parse(text + decoder.decode())
    if (!user || user.id !== userId || !ownsWallet(user.linked_accounts, address)) return false
    if (verified.size >= 128) verified.delete(verified.keys().next().value!)
    verified.set(key, Date.now() + 30_000)
    return true
  } catch (error) {
    if (error instanceof WalletVerificationError) throw error
    console.warn('WALLET_VERIFICATION', { reason: 'lookup_unavailable' })
    throw new WalletVerificationError('wallet_verification_unavailable')
  }
}
