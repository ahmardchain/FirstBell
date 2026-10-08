import assert from 'node:assert/strict'
import { test, afterEach } from 'node:test'
import { tokenAddresses } from '../lib/asset-catalog.ts'
import { researchStock, researchStockPublic, checkSkillTrade, parseSkillAudit } from '../worker/wallet-skills.ts'
import { skillTradeBlock } from '../lib/binance-wallet-skills.ts'
import { parseAgentIntent } from '../lib/agent-intent.ts'
import { handleApiRequest } from '../worker/router.ts'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })
function fixture(options = {}) {
  const calls = [], envelope = data => Response.json({ code: '000000', success: true, data })
  globalThis.fetch = async (input, init) => {
    const url = new URL(input)
    calls.push({ url, init })
    assert.equal(init.headers['Accept-Encoding'], 'identity')
    assert.equal(init.headers.Authorization, undefined); assert.equal(init.headers['X-OC-APIKEY'], undefined)
    if (url.pathname.endsWith('detail/list/ai')) {
      assert.equal(url.searchParams.get('type'), '1')
      return envelope([{ symbol: 'AAPLon', ticker: 'AAPL', chainId: options.chain ?? '56', type: options.type ?? 1,
        contractAddress: options.address ?? tokenAddresses.AAPLon, multiplier: '2' }])
    }
    assert.equal(url.searchParams.get('chainId') ?? JSON.parse(init.body).binanceChainId, '56')
    if (url.pathname.endsWith('/audit')) {
      const body = JSON.parse(init.body)
      assert.equal(body.contractAddress, tokenAddresses.AAPLon); assert.match(body.requestId, /^[a-f0-9-]{36}$/)
      assert.equal(init.headers.source, 'agent'); assert.equal(init.headers['User-Agent'], 'binance-web3/1.4 (Skill)')
      return envelope({ requestId: options.badRequestId ? 'wrong' : body.requestId, hasResult: options.auditAvailable !== false, isSupported: options.auditSupported !== false,
        riskLevel: options.risk ?? 1, riskLevelEnum: options.risk === 5 ? 'HIGH' : 'LOW', extraInfo: { buyTax: '0', sellTax: '0', isVerified: true },
        riskItems: [{ details: [{ isHit: options.risk === 5, title: 'Fixture risk', description: 'Fixture description', riskType: 'RISK' }] }] })
    }
    assert.equal(url.searchParams.get('contractAddress'), tokenAddresses.AAPLon)
    assert.equal(init.headers['User-Agent'], 'binance-web3/1.1 (Skill)')
    if (url.pathname.includes('dynamic/ai')) return envelope({ symbol: options.symbol ?? 'AAPLon', ticker: 'AAPL', tokenInfo: { price: '400', priceChangePct24h: '1.25', sharesMultiplier: options.multiplier ?? '2' }, stockInfo: { price: options.referenceMissing ? null : '100', priceToEarnings: '25', dividendYield: '0.27' } })
    if (url.pathname.includes('asset/market/status')) return envelope({ openState: options.open ?? true, marketStatus: 'regular', reasonCode: options.reason ?? 'TRADING', reasonMsg: options.reason === 'ASSET_PAUSED' ? 'stock_split' : null })
    if (url.pathname.includes('meta/ai')) return envelope({ symbol: 'AAPLon', dailyAttestationReports: '/images/web3-data/public/token/ondo/pdf/daily-2026-10-08.pdf' })
    throw new Error('unexpected endpoint')
  }
  return calls
}
test('Wallet Skills use their exact public HTTP contracts and verify BSC provider/address before research', async () => {
  const calls = fixture(), report = await researchStock('AAPLon')
  assert.equal(calls.length, 5); assert.equal(report.source, 'binance-wallet-skills')
  assert.equal(report.stock.tokenPrice, 400); assert.equal(report.stock.perSharePrice, 200); assert.equal(report.stock.stockPrice, 100); assert.equal(report.stock.premiumPct, 100)
  assert.equal(report.stock.dividendYield, 0.27); assert.equal(report.audit.available, true); assert.equal(report.audit.verified, true)
  assert.equal(report.trace.length, 5); assert.ok(report.trace.every(t => t.status === 'ready'))
  assert.match(report.stock.attestation, /^https:\/\/bin\.bnbstatic\.com\//)
  assert.equal(skillTradeBlock(report), null)
  assert.equal(calls.some(c => c.url.pathname.includes('swap') || c.url.pathname.includes('submit')), false)
})
test('same-symbol wrong-chain, wrong-provider or cloned-contract rows are never tradable', async () => {
  for (const options of [{ chain: '1' }, { type: 3 }, { address: '0x' + '11'.repeat(20) }]) {
    const calls = fixture(options)
    await assert.rejects(researchStock('AAPLon'), /skill_asset_not_verified/)
    assert.equal(calls.length, 1)
  }
})
test('missing underlying reference is unavailable, not zero or an invented premium', async () => {
  fixture({ referenceMissing: true }); const report = await researchStock('AAPLon')
  assert.equal(report.stock.stockPrice, null); assert.equal(report.stock.premiumPct, null); assert.equal(report.stock.perSharePrice, 200)
})
test('unsupported, missing or request-mismatched audits hide all unreliable risk/tax fields and block execution', async () => {
  for (const options of [{ auditAvailable: false }, { auditSupported: false }, { badRequestId: true }]) {
    fixture(options); const report = await researchStock('AAPLon')
    assert.deepEqual(report.audit, { available: false, reason: options.auditSupported === false ? 'unsupported' : options.badRequestId ? 'invalid_response' : 'no_result', level: null, label: null, buyTax: null, sellTax: null, verified: null, risks: [] })
    assert.equal(skillTradeBlock(report), 'skill_checks_unavailable')
  }
  assert.equal(parseSkillAudit({ hasResult: true, isSupported: true, requestId: 'a', riskLevel: NaN }, 'a').available, false)
  assert.equal(parseSkillAudit({ hasResult: true, isSupported: true, requestId: 'a', riskLevel: 4, riskLevelEnum: 'LOW' }, 'a').available, false)
})
test('concurrent public research coalesces, while trade checks still fetch a fresh audit', async () => {
  const calls = fixture()
  const reports = await Promise.all([researchStockPublic('AAPLon'), researchStockPublic('AAPLon'), researchStockPublic('AAPLon')])
  assert.equal(calls.length, 5); assert.equal(reports[0].checkedAt, reports[2].checkedAt)
  await checkSkillTrade('AAPLon'); assert.equal(calls.length, 10)
})
test('level 5 risks, corporate-action pauses and closed token markets prevent a trade', async () => {
  fixture({ risk: 5 }); await assert.rejects(checkSkillTrade('AAPLon'), /skill_security_blocked/)
  fixture({ open: false, reason: 'ASSET_PAUSED' }); const report = await researchStock('AAPLon')
  assert.equal(report.stock.market.detail, 'stock_split'); assert.equal(skillTradeBlock(report), 'skill_asset_unavailable')
  fixture({ open: false, reason: 'MARKET_CLOSED' }); await assert.rejects(checkSkillTrade('AAPLon'), /skill_asset_unavailable/)
})
test('explicit unsupported audit keeps valid Apple research and can reach a separately acknowledged review; missing and mismatched results remain blocked', async () => {
  fixture({ auditSupported: false }); const report = await researchStock('AAPLon')
  assert.equal(report.stock.tokenPrice, 400); assert.equal(report.audit.reason, 'unsupported')
  assert.equal(report.trace.find(t => t.operation === 'audit').status, 'unsupported')
  assert.equal(skillTradeBlock(report), 'skill_checks_unavailable')
  assert.equal(skillTradeBlock(report, { allowUnsupportedAudit: true }), null)
  for (const options of [{ auditAvailable: false }, { badRequestId: true }]) {
    fixture(options); assert.equal(skillTradeBlock(await researchStock('AAPLon'), { allowUnsupportedAudit: true }), 'skill_checks_unavailable')
  }
  fixture({ auditSupported: false, open: false }); assert.equal(skillTradeBlock(await researchStock('AAPLon'), { allowUnsupportedAudit: true }), 'skill_asset_unavailable')
})
test('wrong dynamic identity, HTML/rate failures, oversized bodies and redirects never create usable data', async () => {
  fixture({ symbol: 'TSLAon' }); await assert.rejects(researchStock('AAPLon'), /skill_asset_not_verified/)
  globalThis.fetch = async () => new Response('<html>failure</html>'); await assert.rejects(researchStock('AAPLon'), /skill_provider_unavailable/)
  globalThis.fetch = async () => new Response('', { status: 429 }); await assert.rejects(researchStock('AAPLon'), /rate_limited/)
  globalThis.fetch = async () => new Response('{}', { headers: { 'content-length': '1000001' } }); await assert.rejects(researchStock('AAPLon'), /skill_provider_unavailable/)
})
test('public research accepts only known catalog symbols and cannot proxy arbitrary URLs or wallet data', async () => {
  let calls = 0; globalThis.fetch = async () => { calls++; throw new Error('must not fetch') }
  assert.equal((await handleApiRequest(new Request('https://firstbell.example/api/agent/research?symbol=https://example.com'), {})).status, 400)
  assert.equal((await handleApiRequest(new Request('https://firstbell.example/api/agent/research?symbol=AAPLon', { method: 'POST' }), {})).status, 405)
  assert.equal(calls, 0)
  const response = await handleApiRequest(new Request('https://firstbell.example/api/agent/skills'), {})
  const meta = await response.json(); assert.equal(meta.agenticWalletExecution, 'local-mcp'); assert.equal(meta.webExecution, 'privy-confirmed')
})
test('research, audit, market and comparison commands work across five languages without turning conditional requests into trades', () => {
  for (const [language, prompts] of Object.entries({ en: ['Research Apple', 'Is AAPLon safe?', 'Is Apple tradable?', 'Compare Apple with reference'], zh: ['研究苹果', '苹果安全吗', '苹果交易状态', '比较苹果参考价'], es: ['Investiga Apple', '¿Es AAPLon seguro?', 'Mercado Apple', 'Compara Apple'], fr: ['Recherche Apple', 'AAPLon est-il sûr ?', 'Marché Apple', 'Comparer Apple'], pt: ['Pesquise Apple', 'AAPLon é seguro?', 'Mercado Apple', 'Comparar Apple'] })) {
    prompts.forEach((prompt, index) => { const value = parseAgentIntent(prompt, language); assert.equal(value.kind, 'research', prompt); assert.equal(value.symbol, 'AAPLon'); assert.equal(value.field, ['research', 'audit', 'market', 'compare'][index], prompt) })
  }
  assert.equal(parseAgentIntent('Buy Apple if the audit is safe').kind, 'help')
  assert.equal(parseAgentIntent('Compare Apple and Tesla').kind, 'help')
})
