// One delayed quote per typing pause. A manual request consumes that delay,
// rather than leaving a second request queued behind a fast response.
export function createQuoteScheduler() {
  let timer: ReturnType<typeof setTimeout> | undefined
  const clear = () => { clearTimeout(timer); timer = undefined }
  const run = <T,>(action: () => Promise<T>): Promise<T> => { clear(); return action() }
  const schedule = (action: () => Promise<unknown>) => {
    clear()
    timer = setTimeout(() => { timer = undefined; void action() }, 350)
  }
  return { clear, run, schedule }
}
