export class WalletSessionError extends Error {}

export type WalletSession = { accessToken: string; identityToken: string }
type SessionSource = {
  getAccessToken: () => Promise<string | null>
  getIdentityToken: () => string | null
  refreshIdentityToken: () => Promise<string | null>
}

async function bounded<T>(action: () => Promise<T>, reason: string, milliseconds = 6000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([Promise.resolve().then(action), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new WalletSessionError(reason)), milliseconds)
    })])
  } finally { clearTimeout(timer) }
}

function freshIdentity(token: string | null): token is string {
  if (!token) return false
  try {
    const payload = token.split('.')[1]
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof claims.exp === 'number' && claims.exp * 1000 > Date.now() + 30_000
  } catch { return false }
}

// The SDK's standalone identity getter performs a network refresh. Use the
// reactive token first; the server still verifies both JWTs and wallet ownership.
export async function withWalletSession<T>(source: SessionSource, send: (session: WalletSession) => Promise<T>): Promise<T> {
  const access = async () => {
    let token: string | null
    try { token = await bounded(source.getAccessToken, 'session_timeout') }
    catch (error) { if (error instanceof WalletSessionError) throw error; throw new WalletSessionError('session_unavailable') }
    if (!token) throw new WalletSessionError('unauthorized')
    return token
  }
  const refreshIdentity = async () => {
    let token: string | null
    try { token = await bounded(source.refreshIdentityToken, 'session_timeout') }
    catch (error) { if (error instanceof WalletSessionError) throw error; throw new WalletSessionError('session_refresh_failed') }
    return token ?? ''
  }
  const accessToken = await access()
  const cached = source.getIdentityToken()
  // Missing identity proof must reach the authenticated server lookup, rather
  // than hang on a client refresh for an optional dashboard feature.
  const identityToken = freshIdentity(cached) ? cached : ''
  try { return await send({ accessToken, identityToken }) }
  catch (error) {
    if (!(error instanceof Error) || !['wallet_not_verified', 'unauthorized'].includes(error.message)) throw error
    if (error.message === 'wallet_not_verified' && !identityToken) throw error
    // These explicit authentication rejections happen before checkout storage
    // or provider work. Never retry a network failure or an uncertain write.
    return send({ accessToken: await access(), identityToken: await refreshIdentity() })
  }
}
