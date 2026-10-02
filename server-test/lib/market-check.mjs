import { createHmac, randomUUID } from 'node:crypto'

const address = '0xA9eE28C80f960B889dFbd1902055218cBa016F75'
const requests = [
  {
    method: 'GET',
    path: `/build/api/v1/dex/market/candles?binanceChainId=56&tokenContractAddress=${address}&bar=15m&limit=100`,
    body: '',
  },
  {
    method: 'POST',
    path: '/build/api/v1/dex/market/price-info',
    body: JSON.stringify([{ binanceChainId: '56', tokenContractAddress: address }]),
  },
]

function safeMessage(value, privateValues) {
  if (typeof value !== 'string') return null
  let message = value
  for (const secret of privateValues.filter(Boolean)) {
    message = message.replaceAll(secret, '[redacted]').replaceAll(encodeURIComponent(secret), '[redacted]')
  }
  return message.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').slice(0, 500)
}

async function readBody(response) {
  if (Number(response.headers.get('content-length')) > 300_000) throw new Error('response_too_large')
  if (!response.body) return ''
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let body = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) return body + decoder.decode()
      size += value.byteLength
      if (size > 300_000) {
        await reader.cancel()
        throw new Error('response_too_large')
      }
      body += decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }
}

// Requests only public market information. No wallet, approval or trade endpoints.
export async function checkBinanceMarket(credentials, fetcher = globalThis.fetch) {
  const reports = []
  for (const request of requests) {
    const requestTimestamp = new Date().toISOString()
    const signature = createHmac('sha256', credentials.secretKey)
      .update(requestTimestamp + request.method + request.path + request.body, 'utf8').digest('base64')
    const nonce = randomUUID()
    const started = performance.now()
    const report = {
      method: request.method, endpoint: `https://web3.binance.com${request.path}`,
      requestTimestamp, token: 'NVDAon', chainId: '56',
      apiKeyPrefix: credentials.apiKey.length > 8 ? credentials.apiKey.slice(0, 8) : '[omitted]',
      httpStatus: null, providerCode: null, message: null, itemCount: null,
      result: 'network_error', elapsedMs: 0,
    }
    try {
      const response = await fetcher(report.endpoint, {
        method: request.method, redirect: 'error', signal: AbortSignal.timeout(8_000),
        headers: {
          'X-OC-APIKEY': credentials.apiKey, 'X-OC-TIMESTAMP': requestTimestamp,
          'X-OC-SIGN': signature, 'X-OC-NONCE': nonce, Accept: 'application/json',
          ...(request.method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(request.method === 'POST' ? { body: request.body } : {}),
      })
      report.httpStatus = response.status
      let payload
      try { payload = JSON.parse(await readBody(response)) } catch {
        report.result = 'unreadable_response'
      }
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        report.providerCode = Number.isInteger(payload.code) ? payload.code : null
        report.message = safeMessage(payload.msg, [credentials.apiKey, credentials.secretKey, signature, nonce])
        const accepted = response.ok && payload.code === 0 && (payload.success === undefined || payload.success === true)
        report.result = accepted ? 'accepted' : 'rejected'
        // Acceptance alone does not prove usable, current prices or valid candles.
        report.itemCount = accepted && Array.isArray(payload.data) ? payload.data.length : null
      } else if (report.result !== 'unreadable_response') {
        report.result = 'unreadable_response'
      }
    } catch {
      // Network exception strings and HTML bodies can echo credentials. Omit them.
      report.result = 'network_error'
    }
    report.elapsedMs = Math.round(performance.now() - started)
    reports.push(report)
  }
  return reports
}
