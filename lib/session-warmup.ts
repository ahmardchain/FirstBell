import { WalletSessionError } from './wallet-session.ts'

// One consumable access-session read, held only in this view's memory. Consuming
// it removes the slot, so an authentication retry always calls the SDK afresh.
export function createSessionWarmup(getAccessToken: () => Promise<string | null>, now = Date.now) {
  let slot: { promise: Promise<string | null>; started: number } | null = null
  const clear = () => { slot = null }
  const warm = () => {
    if (slot && now() - slot.started < 10_000) return
    let timer: ReturnType<typeof setTimeout>
    const promise = Promise.race([Promise.resolve().then(getAccessToken), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new WalletSessionError('session_timeout')), 6000)
    })]).finally(() => clearTimeout(timer))
    const current = { promise, started: now() }
    slot = current
    void promise.catch(() => { if (slot === current) clear() })
  }
  const take = () => {
    const current = slot
    clear()
    return current && now() - current.started < 10_000 ? current.promise : getAccessToken()
  }
  return { warm, take, clear }
}
