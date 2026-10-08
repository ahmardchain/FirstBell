import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { McpServer } from '@modelcontextprotocol/server'
import { walletSkills } from '../lib/binance-wallet-skills.ts'
const require = createRequire(import.meta.url)
const { stdout } = await promisify(execFile)(process.execPath, [require.resolve('@binance/agentic-wallet'), '--version'], { timeout: 10_000, maxBuffer: 500 })
const version = stdout.trim()
if (version !== walletSkills.execution.cliVersion || typeof McpServer !== 'function') throw new Error('Unexpected runtime version')
console.log(JSON.stringify({ ready: true, cliVersion: version, chainId: 56, transport: 'stdio', confirmation: 'local-browser', walletConnectionTested: false, liveTradeTested: false }))
