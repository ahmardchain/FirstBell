import assert from 'node:assert/strict'
import { test } from 'node:test'
import { emptyAgentHistory, appendAgentMessage, startAgentConversation, deleteAgentConversation, readAgentHistory, storeAgentHistory } from '../lib/agent-history.ts'
import { tokenAddresses } from '../lib/asset-catalog.ts'

const owner = 'did:privy:first-user|0x' + '11'.repeat(20)
function storage() { const data = new Map(); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) } }
const report = () => ({ source: 'binance-wallet-skills', checkedAt: new Date().toISOString(),
  stock: { symbol: 'AAPLon', ticker: 'AAPL', chainId: 56, address: tokenAddresses.AAPLon, multiplier: 1, tokenPrice: 100, perSharePrice: 100, stockPrice: 99, premiumPct: 1, change24h: 0, pe: null, dividendYield: null,
    market: { open: true, session: 'regular', reason: 'TRADING', detail: null, nextOpen: null }, attestation: null },
  audit: { available: false, reason: 'unsupported', level: null, label: null, buyTax: null, sellTax: null, verified: null, risks: [] },
  trace: [{ skill: 'query-token-audit', version: '1.4', operation: 'audit', status: 'unsupported', durationMs: 20 }] })

test('chat text and checked research survive reload without persisting any executable review or credential', () => {
  const s = storage()
  let h = appendAgentMessage(emptyAgentHistory(), { role: 'user', text: 'Research Apple' })
  h = appendAgentMessage(h, { role: 'guide', text: 'Read only', report: { ...report(), planToken: 'fixture-secret' }, signature: 'fixture-signature', attachment: 'untrusted JSX' })
  h.plan = { signature: 'fixture-signature', planToken: 'fixture-secret' }
  storeAgentHistory(s, owner, h)
  const restored = readAgentHistory(s, owner)
  assert.equal(restored.activeId, h.activeId)
  assert.equal(restored.conversations[0].messages[0].text, 'Research Apple')
  const message = restored.conversations[0].messages[1]
  assert.equal(message.report.stock.tokenPrice, 100); assert.equal(message.report.audit.reason, 'unsupported'); assert.equal(message.restored, true)
  assert.doesNotMatch([...s.data.values()].join(''), /fixture-secret|fixture-signature|untrusted JSX/)
  assert.equal(message.attachment, undefined); assert.equal(restored.plan, undefined)
})
test('guest, another wallet and another Privy user never restore this conversation', () => {
  const s = storage(), h = appendAgentMessage(emptyAgentHistory(), { role: 'user', text: 'Private wallet question' })
  storeAgentHistory(s, owner, h)
  for (const other of ['guest', 'did:privy:second-user|0x' + '11'.repeat(20), 'did:privy:first-user|0x' + '22'.repeat(20)]) {
    assert.equal(readAgentHistory(s, other).conversations[0].messages.length, 0)
  }
  assert.throws(() => readAgentHistory(s, '../another-user'), /invalid_history_owner/)
})
test('new chat preserves previous conversations; deleting one does not delete another', () => {
  const s = storage()
  let h = appendAgentMessage(emptyAgentHistory(), { role: 'user', text: 'First question' })
  const first = h.activeId
  h = startAgentConversation(h)
  h = appendAgentMessage(h, { role: 'user', text: 'Second question' })
  const second = h.activeId
  h = { ...h, activeId: first }; storeAgentHistory(s, owner, h)
  assert.equal(readAgentHistory(s, owner).activeId, first)
  h = deleteAgentConversation(h, first)
  assert.equal(h.activeId, second); assert.equal(h.conversations.length, 1)
  assert.equal(deleteAgentConversation(h, second).conversations[0].messages.length, 0)
})
test('malformed and oversized storage and cloned research contracts cannot create an actionable history', () => {
  const s = storage(), h = appendAgentMessage(emptyAgentHistory(), { role: 'user', text: 'Research Apple' })
  storeAgentHistory(s, owner, h)
  const key = [...s.data.keys()][0]
  for (const raw of ['{broken', 'x'.repeat(800_001), JSON.stringify({ version: 2, conversations: [] })]) {
    s.setItem(key, raw); assert.equal(readAgentHistory(s, owner).conversations[0].messages.length, 0)
  }
  const wrong = report(); wrong.stock.address = '0x' + '22'.repeat(20)
  const safe = appendAgentMessage(emptyAgentHistory(), { role: 'guide', text: 'Research text', report: wrong })
  storeAgentHistory(s, owner, safe)
  assert.equal(readAgentHistory(s, owner).conversations[0].messages[0].report, undefined)
})
test('history is bounded and quota errors reach the caller instead of claiming persistence', () => {
  let h = emptyAgentHistory()
  for (let i = 0; i < 25; i++) { h = appendAgentMessage(h, { role: 'user', text: `Question ${i}` }); h = startAgentConversation(h) }
  assert.equal(h.conversations.length, 20)
  for (let i = 0; i < 80; i++) h = appendAgentMessage(h, { role: 'guide', text: `Reply ${i}` })
  assert.equal(h.conversations.at(-1).messages.length, 60)
  assert.equal(new Set(h.conversations.at(-1).messages.map(m => m.id)).size, 60)
  assert.throws(() => storeAgentHistory({ getItem: () => null, setItem: () => { throw new Error('Quota exceeded') } }, owner, h), /Quota exceeded/)
})
