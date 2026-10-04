const sandboxOrigin = 'https://buy.onramper.dev'
const testKey = /^pk_test_[A-Za-z0-9_-]{1,128}$/
const defaults = {
  mode: 'buy', onlyOnramps: 'banxa', defaultFiat: 'eur', onlyFiats: 'eur,gbp',
  defaultPaymentMethod: 'creditcard',
} as const

export function isOnramperDemo(search: string): boolean {
  return new URLSearchParams(search).get('demo') === 'onramper'
}

// A wallet-free widget preview. It never creates a FirstBell funding session.
export function createOnramperDemoUrl(apiKey: string, theme: 'light' | 'dark'): string {
  if (!testKey.test(apiKey)) throw new Error('demo_not_configured')
  const url = new URL(`${sandboxOrigin}/`)
  url.searchParams.set('apiKey', apiKey)
  for (const [name, value] of Object.entries(defaults)) url.searchParams.set(name, value)
  url.searchParams.set('themeName', theme)
  return url.toString()
}

export function isOnramperDemoUrl(value: string): boolean {
  try {
    const url = new URL(value)
    const params = url.searchParams
    const names = ['apiKey', ...Object.keys(defaults), 'themeName']
    return url.origin === sandboxOrigin && url.pathname === '/' && !url.username && !url.password && !url.hash
      && [...params].length === names.length && [...params.keys()].every(name => names.includes(name))
      && testKey.test(params.get('apiKey') ?? '') && ['light', 'dark'].includes(params.get('themeName') ?? '')
      && Object.entries(defaults).every(([name, expected]) => params.get(name) === expected)
  } catch { return false }
}
