type GetAccessToken = () => Promise<string | null>

async function authorizedRequest(path: string, getAccessToken: GetAccessToken, init?: RequestInit) {
  const token = await getAccessToken()
  if (!token) throw new Error('Sign-in required')
  const response = await fetch(path, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error(`Account request failed: ${response.status}`)
  return response.json() as Promise<{ account: { id: string; saved: string[] } }>
}

export async function getAccount(getAccessToken: GetAccessToken) {
  const { account } = await authorizedRequest('/api/me', getAccessToken)
  return account
}

export async function setSavedAsset(getAccessToken: GetAccessToken, symbol: string, saved: boolean) {
  await authorizedRequest('/api/me/saved', getAccessToken, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol, saved }),
  })
}
