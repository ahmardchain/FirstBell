import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

export class BinanceCliError extends Error {
  constructor(error = {}) {
    // Do not expose raw stderr, headers or arbitrary fields from the CLI.
    const name = /^[A-Z0-9_]{1,80}$/.test(error.name ?? '') ? error.name : 'BINANCE_CLI_ERROR'
    const code = Number.isSafeInteger(error.code) ? error.code : null
    // Provider messages can echo credentials, including unlabeled values.
    // Return the structured error identifier/code, never its arbitrary text.
    super(`Binance CLI request failed: ${name}${code === null ? '' : ` (${code})`}. Check your connection and Binance app settings.`)
    this.name = name; this.code = code
  }
}
export function runBinanceCli(args, { timeout = 30_000, signal } = {}) {
  const cli = require.resolve('@binance/agentic-wallet')
  const env = { ...process.env }
  // Use the official production endpoints. Never send the local wallet
  // session to a custom URL inherited from a development shell.
  delete env.WALLET_API_URL; delete env.PREDICTION_API_PREFIX
  return new Promise((resolve, reject) => {
    execFile(process.execPath, [cli, ...args, '--json'], { env, shell: false, timeout, signal, maxBuffer: 250_000, windowsHide: true }, (error, stdout) => {
      let result
      try { result = JSON.parse(stdout) } catch { reject(new BinanceCliError()); return }
      if (result?.success !== true) { reject(new BinanceCliError(result?.error)); return }
      if (error) { reject(new BinanceCliError()); return }
      resolve(result.data)
    })
  })
}
