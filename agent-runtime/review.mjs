import { createServer } from 'node:http'
import { randomBytes } from 'node:crypto'
import { requiresAuditAcknowledgement } from '../lib/binance-wallet-skills.ts'
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const style = 'html{color-scheme:light dark}body{max-width:560px;margin:40px auto;padding:0 20px;font:15px/1.6 Inter,Arial,sans-serif}h1{font-size:25px;letter-spacing:-.04em}dl>div{display:flex;justify-content:space-between;gap:20px;padding:8px 0;border-bottom:1px solid #8885}dt{opacity:.7}dd{margin:0;text-align:right;overflow-wrap:anywhere}code{font-size:11px;overflow-wrap:anywhere}button{min-height:44px;padding:0 22px;border-radius:999px;border:1px solid currentColor;font:inherit;cursor:pointer}small{opacity:.7}a{color:inherit}section{margin:24px 0}details{margin:20px 0}summary{min-height:44px;cursor:pointer}@media(max-width:400px){body{margin:22px auto}dl>div{gap:10px}}'
const page = content => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FirstBell · Binance trade review</title><style>${style}</style></head><body><small>FIRSTBELL / BINANCE AGENTIC WALLET</small>${content}</body></html>`
const row = (label, value) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`
const review = (plan, token) => page(`<h1>Review ${escape(plan.side)} · ${escape(plan.symbol)}</h1><p>This uses your Binance Agentic Wallet on BSC. Its balance and history are separate from your FirstBell Privy wallet.</p><dl>${row('You spend', `${plan.amount} ${plan.inputSymbol}`)}${row('Estimated receive', `${plan.quote.outputAmount} ${plan.outputSymbol}`)}${row('Slippage', '0.5% on the execution quote')}${row('MEV protection', 'On')}${row('Network', 'BNB Smart Chain · 56')}${row('Wallet', plan.wallet)}${row('Token trading status', plan.report.stock.market.open ? 'Available' : 'Unavailable')}${row('Security audit', plan.report.audit.available ? `${plan.report.audit.label} · ${plan.report.audit.level}/5` : 'Not supported by Binance for this token')}${row('Buy / sell tax', `${plan.report.audit.buyTax ?? 'Unavailable'}% / ${plan.report.audit.sellTax ?? 'Unavailable'}%`)}</dl><section><small>Input contract</small><br><code>${escape(plan.fromToken)}</code><br><small>Output contract</small><br><code>${escape(plan.toToken)}</code></section>${plan.report.audit.risks.map(r => `<p><strong>${escape(r.title)}</strong><br>${escape(r.description)}</p>`).join('')}<p>The receive amount is an estimate. Binance re-quotes at execution; its fees and market price may change. Audit data is a point-in-time reference, not a safety guarantee or investment advice. Do your own research.</p><p><small>Review expires ${escape(new Date(plan.expiresAt).toLocaleString())}. Spending limits and token permissions are managed in your Binance app.</small></p><form method="post" action="/confirm/${token}">${requiresAuditAcknowledgement(plan.report) ? '<label style="display:flex;gap:12px;align-items:start;margin:20px 0"><input type="checkbox" name="auditAcknowledged" value="on" required style="min-width:20px;min-height:20px;margin-top:4px"><span>I understand Binance has no security audit for this token. I have reviewed the exact contract and trade.</span></label>' : ''}<button type="submit">Confirm trade</button></form><p>You can close this page to cancel. Opening it places no order.</p>`)
const status = rowValue => page(`<h1>${escape(rowValue.status)}</h1><dl>${row('Order', rowValue.orderId ?? 'No acknowledgement')}${row('Spent', rowValue.inputAmount === null ? 'Not confirmed' : `${rowValue.inputAmount} ${rowValue.inputSymbol}`)}${row('Received', rowValue.outputAmount === null ? 'Not confirmed' : `${rowValue.outputAmount} ${rowValue.outputSymbol}`)}</dl><p>${escape(rowValue.error ?? 'Use the order_status tool to check this same order. Submitted and confirming orders are still processing.')}</p>${/^0x[a-fA-F0-9]{64}$/.test(rowValue.txHash ?? '') ? `<a href="https://bscscan.com/tx/${rowValue.txHash}" target="_blank" rel="noreferrer">View transaction</a>` : ''}`)

export async function createReviewServer(agent) {
  const links = new Map()
  let origin
  const server = createServer(async (request, response) => {
    // Same-origin preserves a browser form's Origin. "no-referrer" turns
    // Chromium's POST Origin into "null", preventing legitimate confirmation.
    // Cross-origin links still receive neither the review URL nor its token.
    const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'", 'X-Content-Type-Options': 'nosniff' }
    const send = (code, body) => { response.writeHead(code, headers); response.end(body) }
    if (request.headers.host !== new URL(origin).host) { send(403, page('<h1>Invalid host</h1>')); return }
    const url = new URL(request.url, origin), match = /^\/(review|confirm)\/([a-f0-9]{64})$/.exec(url.pathname)
    if (!match) { send(404, page('<h1>Review not found</h1>')); return }
    const entry = links.get(match[2])
    if (!entry) { send(404, page('<h1>Review not found</h1>')); return }
    if (request.method === 'GET' && match[1] === 'review') {
      const plan = agent.getReview(entry.reviewId)
      if (!plan || plan.expiresAt <= Date.now()) { send(410, page('<h1>Review expired or already confirmed</h1><p>Check the original order. A fresh trade needs a new review.</p>')); return }
      send(200, review(plan, match[2])); return
    }
    if (request.method !== 'POST' || match[1] !== 'confirm') { send(405, page('<h1>Method not allowed</h1>')); return }
    // The AI has no MCP execution/approval tool. Consent comes from a browser
    // form on this exact loopback origin, never a model-supplied boolean.
    if (request.headers.origin !== origin || request.headers['sec-fetch-site'] !== 'same-origin' || request.headers['sec-fetch-mode'] !== 'navigate'
      || request.headers['sec-fetch-user'] !== '?1' || request.headers['sec-fetch-dest'] !== 'document') { send(403, page('<h1>Open the review and click Confirm trade</h1>')); return }
    const plan = agent.getReview(entry.reviewId)
    if (!plan || plan.expiresAt <= Date.now()) { send(410, page('<h1>Review expired or already confirmed</h1>')); return }
    if (Number(request.headers['content-length'] ?? 0) > 128 || request.headers['transfer-encoding']) { send(400, page('<h1>Invalid confirmation</h1>')); return }
    let body = ''
    try {
      for await (const part of request) {
        body += part.toString('utf8')
        if (body.length > 128) { send(400, page('<h1>Invalid confirmation</h1>')); return }
      }
    } catch { send(400, page('<h1>Invalid confirmation</h1>')); return }
    const auditAcknowledged = body === 'auditAcknowledged=on' && request.headers['content-type']?.split(';')[0].trim() === 'application/x-www-form-urlencoded'
    if (body && !auditAcknowledged) { send(400, page('<h1>Invalid confirmation</h1>')); return }
    if (requiresAuditAcknowledgement(plan.report) && !auditAcknowledged) { send(400, page('<h1>Review the missing audit</h1><p>Return to the review and acknowledge that Binance does not audit this token before confirming.</p>')); return }
    links.delete(match[2])
    try { send(200, status(await agent.executeReviewed(entry.reviewId, { auditAcknowledged }))) }
    catch { send(503, page('<h1>Confirmation could not finish</h1><p>Check the original order in Binance history. This review will not submit again.</p>')) }
  })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  origin = `http://127.0.0.1:${server.address().port}`
  return {
    add(plan) {
      for (const [key, item] of links) if (item.expiresAt <= Date.now()) links.delete(key)
      if (links.size >= 16) throw new Error('too_many_reviews')
      const token = randomBytes(32).toString('hex')
      links.set(token, { reviewId: plan.reviewId, expiresAt: plan.expiresAt })
      return `${origin}/review/${token}`
    },
    close: () => new Promise(resolve => server.close(resolve)),
  }
}
