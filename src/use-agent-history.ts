import * as React from 'react'
import { appendAgentMessage, deleteAgentConversation, emptyAgentHistory, readAgentHistory, startAgentConversation, storeAgentHistory, type AgentHistory, type AgentMessage } from '../lib/agent-history'

export function useAgentHistory(owner: string | undefined) {
  const initial = React.useMemo(() => {
    try { return { history: owner ? readAgentHistory(localStorage, owner) : emptyAgentHistory(), failed: false } }
    catch { return { history: emptyAgentHistory(), failed: true } }
  }, [owner])
  const [state, setState] = React.useState({ owner, ...initial })
  const live = React.useRef(state)
  if (live.current.owner !== owner) live.current = { owner, ...initial }
  const value = state.owner === owner ? state : { owner, ...initial }
  React.useEffect(() => { setState(current => current.owner === owner ? current : { owner, ...initial }) }, [owner, initial])
  const commit = (change: (history: AgentHistory) => AgentHistory) => {
    if (live.current.owner !== owner) return
    const history = change(live.current.history)
    let failed = false
    try { if (owner) storeAgentHistory(localStorage, owner, history) } catch { failed = true }
    live.current = { owner, history, failed }
    setState(live.current)
  }
  return {
    history: value.history, failed: value.failed,
    messages: value.history.conversations.find(c => c.id === value.history.activeId)!.messages,
    append: (message: Omit<AgentMessage, 'id'>) => commit(history => appendAgentMessage(history, message)),
    start: () => commit(startAgentConversation),
    select: (id: string) => commit(history => history.conversations.some(c => c.id === id) ? { ...history, activeId: id } : history),
    remove: (id: string) => commit(history => deleteAgentConversation(history, id)),
  }
}
