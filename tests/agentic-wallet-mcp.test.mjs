import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// The separate connector has its own install; see docs/binance-wallet-skills.md.
const require = createRequire(new URL('../agent-runtime/package.json', import.meta.url))
test('actual MCP stdio server initializes, exposes strict tools and has no execution/signing tool', { timeout: 15_000 }, async t => {
  try { require.resolve('@modelcontextprotocol/client') }
  catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error
    t.skip('Install the optional connector with npm ci --prefix agent-runtime --ignore-scripts to run its MCP check.')
    return
  }
  const { Client } = require('@modelcontextprotocol/client')
  const { StdioClientTransport } = require('@modelcontextprotocol/client/stdio')
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('../agent-runtime/server.mjs', import.meta.url))], stderr: 'pipe' })
  const client = new Client({ name: 'firstbell-fixture-client', version: '1.0.0' })
  let stderr = ''
  transport.stderr?.on('data', value => { stderr += value })
  try {
    await client.connect(transport)
    const { tools } = await client.listTools()
    assert.equal(tools.length, 10)
    assert.equal(tools.some(t => /execute|swap|transfer|shell|sign_transaction|confirm_trade/.test(t.name)), false)
    assert.ok(tools.find(t => t.name === 'prepare_trade').description.includes('personally') || tools.find(t => t.name === 'prepare_trade').description.includes('click Confirm trade'))
    const result = await client.callTool({ name: 'wallet_skills', arguments: {} })
    assert.equal(result.isError, undefined); assert.equal(result.structuredContent.chainId, 56)
    assert.equal(result.structuredContent.confirmation, 'local-browser')
    assert.equal(result.structuredContent.skills.execution.cliVersion, '1.10.0')
    const invalid = await client.callTool({ name: 'prepare_trade', arguments: { symbol: 'AAPLon', side: 'buy', amount: '1', approved: true } })
    assert.equal(invalid.isError, true)
    assert.equal(/sessionToken|clientId|secretKey/.test(stderr), false)
  } finally { await client.close() }
})
