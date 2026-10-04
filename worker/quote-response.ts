import { abortable, PREPARE_TIMEOUT_MS, QUOTE_TIMEOUT_MS } from '../lib/quote-timeout.ts'

// Only the read-only route/prepare handlers use this budget. Signed submissions
// and settlement checks retain their separate recovery/confirmation semantics.
export async function quoteResponse(request: Request, action: (bounded: Request) => Promise<Response>): Promise<Response> {
  const stage = new URL(request.url).pathname.endsWith('/prepare') ? 'prepare' : 'route'
  const start = performance.now()
  const deadline = AbortSignal.timeout((stage === 'prepare' ? PREPARE_TIMEOUT_MS : QUOTE_TIMEOUT_MS) - 1_000)
  const signal = AbortSignal.any([request.signal, deadline])
  let response: Response
  try { response = await abortable(() => action(new Request(request, { signal })), signal) }
  catch { response = Response.json({ error: signal.aborted ? 'quote_timeout' : 'provider_error' }, { status: signal.aborted ? 504 : 503 }) }
  const durationMs = Math.round(performance.now() - start)
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store')
  headers.set('Server-Timing', `trade;dur=${durationMs}`)
  console.info('TRADE_REQUEST_TIMING', { stage, durationMs, httpStatus: response.status })
  return new Response(response.body, { status: response.status, headers })
}
