// Budgets include session preparation in the UI, not just the final fetch.
export const QUOTE_TIMEOUT_MS = 15_000
export const PREPARE_TIMEOUT_MS = 20_000

export async function abortable<T>(action: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted()
  if (!signal) return action()
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve().then(() => { signal.throwIfAborted(); return action() }).then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort))
  })
}
