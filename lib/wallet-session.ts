export class WalletSessionError extends Error {}

export type WalletSession = { accessToken: string; identityToken: string }
type SessionSource = {
  getAccessToken: () => Promise<string | null>
  getIdentityToken: () => string | null
  refreshIdentityToken: () => Promise<string | null>
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
    try { token = await source.getAccessToken() }
    catch { throw new WalletSessionError('session_unavailable') }
    if (!token) throw new WalletSessionError('unauthorized')
    return token
  }
  const refreshIdentity = async () => {
    let token: string | null
    try { token = await source.refreshIdentityToken() }
    catch { throw new WalletSessionError('session_refresh_failed') }
    if (!token) throw new WalletSessionError('identity_token_unavailable')
    return token
  }
  const accessToken = await access()
  const cached = source.getIdentityToken()
  const identityToken = freshIdentity(cached) ? cached : await refreshIdentity()
  try { return await send({ accessToken, identityToken }) }
  catch (error) {
    if (!(error instanceof Error) || !['wallet_not_verified', 'unauthorized'].includes(error.message)) throw error
    // These explicit authentication rejections happen before checkout storage
    // or provider work. Never retry a network failure or an uncertain write.
    return send({ accessToken: await access(), identityToken: await refreshIdentity() })
  }
}
