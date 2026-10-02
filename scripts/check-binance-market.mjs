import { checkBinanceMarket } from '../server-test/lib/market-check.mjs'
export { checkBinanceMarket } from '../server-test/lib/market-check.mjs'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

async function hiddenInput(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Open a normal terminal to enter the keys at hidden prompts.')
  }
  process.stdout.write(label)
  const output = new Writable({ write(_chunk, _encoding, callback) { callback() } })
  const reader = createInterface({ input: process.stdin, output, terminal: true, historySize: 0 })
  const cancellation = new AbortController()
  reader.on('SIGINT', () => cancellation.abort())
  try { return (await reader.question('', { signal: cancellation.signal })).trim() } finally {
    reader.close()
    process.stdout.write('\n')
  }
}

async function main() {
  console.log('FirstBell: direct local Binance Web3 market test (NVDAon, BSC 56).')
  console.log('Two read-only requests. Keys are hidden and are not saved to disk.')
  console.log('Only the first 8 API-key characters appear in the support report.\n')
  const apiKey = process.env.BINANCE_WEB3_API_KEY?.trim() || await hiddenInput('Paste Web3 API Key (hidden), then Enter: ')
  const secretKey = process.env.BINANCE_WEB3_SECRET_KEY?.trim() || await hiddenInput('Paste matching Secret Key (hidden), then Enter: ')
  if (!apiKey || !secretKey) throw new Error('Both Web3 credentials are required.')
  console.log('\nChecking Binance directly from this computer...')
  const reports = await checkBinanceMarket({ apiKey, secretKey })
  console.log(JSON.stringify(reports, null, 2))
  process.exitCode = reports.every(report => report.result === 'accepted') ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error?.code === 'ABORT_ERR' ? 'Test cancelled.' : 'Test could not start. Use an interactive terminal and enter both keys.')
    process.exitCode = error?.code === 'ABORT_ERR' ? 130 : 1
  })
}
