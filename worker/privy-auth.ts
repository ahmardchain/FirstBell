import { createRemoteJWKSet, customFetch, errors, importSPKI, jwtVerify, type JWTPayload } from 'jose'

type PrivyEnv = { PRIVY_APP_ID: string; PRIVY_VERIFICATION_KEY?: string }
const publishedKeys = new Map<string, ReturnType<typeof createRemoteJWKSet>>()
const maxKeyBytes = 64 * 1024

export const privyAuthConfigured = (env: PrivyEnv) => /^[a-zA-Z0-9_-]{3,128}$/.test(env.PRIVY_APP_ID)

function appKeys(appId: string) {
  let keys = publishedKeys.get(appId)
  if (!keys) {
    // The trusted app ID comes from server configuration, never JWT claims or
    // a token-supplied jku/x5u. Privy publishes this app's verification keys.
    keys = createRemoteJWKSet(new URL(`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`), {
      timeoutDuration: 5000, cacheMaxAge: 60 * 60 * 1000, cooldownDuration: 30_000,
      [customFetch]: async (url, init) => {
        const response = await fetch(url, init)
        if (response.status !== 200) return response
        if (Number(response.headers.get('Content-Length')) > maxKeyBytes) throw new Error('invalid_key_response')
        const reader = response.body?.getReader()
        if (!reader) throw new Error('invalid_key_response')
        const chunks: Uint8Array[] = []
        let size = 0
        try {
          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            size += value.byteLength
            if (size > maxKeyBytes) { await reader.cancel(); throw new Error('invalid_key_response') }
            chunks.push(value)
          }
        } finally { reader.releaseLock() }
        const bytes = new Uint8Array(size)
        let offset = 0
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
        return new Response(bytes, { headers: { 'Content-Type': 'application/json' } })
      },
    })
    // Configured apps, not user input; keep warm-process memory bounded.
    if (publishedKeys.size >= 4) publishedKeys.delete(publishedKeys.keys().next().value!)
    publishedKeys.set(appId, keys)
  }
  return keys
}

function validIdentity(payload: JWTPayload): boolean {
  return typeof payload.sub === 'string' && /^did:privy:[a-zA-Z0-9_-]{3,128}$/.test(payload.sub)
    && typeof payload.exp === 'number'
}

function logFailure(error: unknown) {
  // Fixed library error codes only. Never log a JWT, key, account or error
  // message, which can contain user-controlled data.
  console.warn('PRIVY_AUTH', { reason: error instanceof errors.JOSEError ? error.code : 'verification_unavailable' })
}

export async function verifyPrivyToken(token: string | null, env: PrivyEnv): Promise<JWTPayload | null> {
  if (!token || token.length > 64 * 1024 || !privyAuthConfigured(env)) return null
  const options = { issuer: 'privy.io', audience: env.PRIVY_APP_ID,
    algorithms: ['ES256'], requiredClaims: ['exp', 'sub', 'aud', 'iss'] }
  if (env.PRIVY_VERIFICATION_KEY?.trim()) {
    try {
      const pem = env.PRIVY_VERIFICATION_KEY.trim().replace(/\\n/g, '\n')
      const key = await importSPKI(pem, 'ES256')
      const { payload } = await jwtVerify(token, key, options)
      return validIdentity(payload) ? payload : null
    } catch (error) {
      // Bad claims are never repaired by another key. Only key/signature
      // failures may retry against Privy's authoritative keys for this app.
      if (error instanceof errors.JWTClaimValidationFailed || error instanceof errors.JWTExpired
        || error instanceof errors.JWTInvalid || error instanceof errors.JWSInvalid
        || error instanceof errors.JOSEAlgNotAllowed) { logFailure(error); return null }
    }
  }
  try {
    try {
      const { payload } = await jwtVerify(token, appKeys(env.PRIVY_APP_ID), options)
      return validIdentity(payload) ? payload : null
    } catch (error) {
      if (!(error instanceof errors.JWKSMultipleMatchingKeys)) throw error
      // Older Privy tokens can omit kid. Try only the public keys selected by
      // jose from this app's trusted set; every attempt still verifies claims.
      let attempted = 0
      for await (const key of error) {
        if (++attempted > 10) break
        try {
          const { payload } = await jwtVerify(token, key, options)
          return validIdentity(payload) ? payload : null
        } catch (failure) {
          if (!(failure instanceof errors.JWSSignatureVerificationFailed)) throw failure
        }
      }
      throw new errors.JWSSignatureVerificationFailed()
    }
  } catch (error) { logFailure(error); return null }
}
