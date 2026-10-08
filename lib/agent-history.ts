import { tokenAddresses } from './asset-catalog.ts'
import { validateSkillReport, type SkillReport } from './binance-wallet-skills.ts'

type StoragePort = Pick<Storage, 'getItem' | 'setItem'>
export type AgentMessage = { id: number; role: 'user' | 'guide'; text: string; source?: boolean; report?: SkillReport; restored?: boolean }
export type AgentConversation = { id: string; createdAt: string; updatedAt: string; messages: AgentMessage[] }
export type AgentHistory = { version: 1; activeId: string; conversations: AgentConversation[] }
const maxBytes = 800_000, maxConversations = 20, maxMessages = 60
const validId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9-]{36}$/.test(v)
const date = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v)) && Date.parse(v) <= Date.now() + 120_000
const key = (owner: string) => {
  const wallet = /^(?:(did:privy:[a-zA-Z0-9_-]{3,128})\|)?(0x[a-fA-F0-9]{40})$/.exec(owner)
  if (owner !== 'guest' && !wallet) throw new Error('invalid_history_owner')
  return `firstbell-agent-chats:v1:${wallet ? `${wallet[1] ? `${wallet[1]}|` : ''}${wallet[2].toLowerCase()}` : 'guest'}`
}
export function newConversation(): AgentConversation {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), createdAt: now, updatedAt: now, messages: [] }
}
export function emptyAgentHistory(): AgentHistory {
  const conversation = newConversation()
  return { version: 1, activeId: conversation.id, conversations: [conversation] }
}

// Store display data only. Reviews, signatures, credentials, receipt tickets
// and executable plans remain outside chat history.
function cleanReport(value: unknown): SkillReport | undefined {
  const symbol = (value as SkillReport)?.stock?.symbol
  if (typeof symbol !== 'string' || !tokenAddresses[symbol]) return
  try {
    const r = validateSkillReport(value, symbol, tokenAddresses[symbol])
    const { symbol: s, ticker, chainId, address, multiplier, tokenPrice, perSharePrice, stockPrice, premiumPct, change24h, pe, dividendYield, market, attestation } = r.stock
    const { open, session, reason, detail, nextOpen } = market
    const { available, level, label, buyTax, sellTax, verified } = r.audit
    return { source: r.source, checkedAt: r.checkedAt,
      stock: { symbol: s, ticker, chainId, address, multiplier, tokenPrice, perSharePrice, stockPrice, premiumPct, change24h, pe, dividendYield, market: { open, session, reason, detail, nextOpen }, attestation },
      audit: { available, level, label, buyTax, sellTax, verified, ...(r.audit.reason ? { reason: r.audit.reason } : {}), risks: r.audit.risks.map(({ title, description, critical }) => ({ title, description, critical })) },
      trace: r.trace.map(({ skill, version, operation, status, durationMs }) => ({ skill, version, operation, status, durationMs })) }
  } catch { return }
}
function cleanMessage(value: unknown, restored = false): AgentMessage | null {
  const m = value as AgentMessage
  if (!m || !Number.isSafeInteger(m.id) || m.id < 1 || !['user', 'guide'].includes(m.role) || typeof m.text !== 'string' || m.text.length > 25_000) return null
  const report = m.role === 'guide' && m.report ? cleanReport(m.report) : undefined
  return { id: m.id, role: m.role, text: m.text, source: m.source === true, ...(report ? { report, ...(restored ? { restored: true } : {}) } : {}) }
}
export function readAgentHistory(storage: StoragePort, owner: string): AgentHistory {
  const raw = storage.getItem(key(owner))
  if (!raw || raw.length > maxBytes) return emptyAgentHistory()
  let value: AgentHistory
  try { value = JSON.parse(raw) } catch { return emptyAgentHistory() }
  if (value?.version !== 1 || !Array.isArray(value.conversations) || value.conversations.length > maxConversations) return emptyAgentHistory()
  const ids = new Set<string>()
  const conversations = value.conversations.flatMap(c => {
    if (!c || !validId(c.id) || ids.has(c.id) || !date(c.createdAt) || !date(c.updatedAt) || !Array.isArray(c.messages) || c.messages.length > maxMessages) return []
    ids.add(c.id)
    const messages = c.messages.map(m => cleanMessage(m, true)).filter((m): m is AgentMessage => m !== null)
    if (new Set(messages.map(m => m.id)).size !== messages.length) return []
    return [{ id: c.id, createdAt: c.createdAt, updatedAt: c.updatedAt, messages }]
  })
  if (!conversations.length) return emptyAgentHistory()
  return { version: 1, activeId: conversations.some(c => c.id === value.activeId) ? value.activeId : conversations.at(-1)!.id, conversations }
}
export function appendAgentMessage(history: AgentHistory, value: Omit<AgentMessage, 'id'>): AgentHistory {
  const active = history.conversations.find(c => c.id === history.activeId)!
  const message = cleanMessage({ ...value, id: Math.max(0, ...active.messages.map(m => m.id)) + 1 })
  if (!message) throw new Error('invalid_agent_message')
  const updated = { ...active, updatedAt: new Date().toISOString(), messages: [...active.messages, message].slice(-maxMessages) }
  return { ...history, conversations: [...history.conversations.filter(c => c.id !== active.id), updated].slice(-maxConversations) }
}
export function startAgentConversation(history: AgentHistory): AgentHistory {
  const active = history.conversations.find(c => c.id === history.activeId)
  if (active && !active.messages.length) return history
  const conversation = newConversation()
  return { ...history, activeId: conversation.id, conversations: [...history.conversations, conversation].slice(-maxConversations) }
}
export function deleteAgentConversation(history: AgentHistory, id: string): AgentHistory {
  const conversations = history.conversations.filter(c => c.id !== id)
  if (!conversations.length) return emptyAgentHistory()
  return { ...history, activeId: id === history.activeId ? conversations.at(-1)!.id : history.activeId, conversations }
}
export function storeAgentHistory(storage: StoragePort, owner: string, history: AgentHistory): void {
  const value: AgentHistory = { version: 1, activeId: history.activeId, conversations: history.conversations.slice(-maxConversations).map(c => ({
    id: c.id, createdAt: c.createdAt, updatedAt: c.updatedAt,
    messages: c.messages.slice(-maxMessages).map(m => cleanMessage(m)).filter((m): m is AgentMessage => m !== null),
  })) }
  let body = JSON.stringify(value)
  while (body.length > maxBytes) {
    const older = value.conversations.findIndex(c => c.id !== value.activeId)
    if (older >= 0) value.conversations.splice(older, 1)
    else value.conversations[0].messages.shift()
    body = JSON.stringify(value)
  }
  storage.setItem(key(owner), body)
}
