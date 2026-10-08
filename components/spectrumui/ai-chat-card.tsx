// Adapted from Spectrum UI's AI Chat Card (Apache-2.0).
// The composer and empty state remain local source; FirstBell supplies source-backed replies.
import * as React from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { ArrowUp, MessageCircleDashed, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTypewriter } from '@/components/spectrumui/use-typewriter'

export interface AIChatMessage {
  id: number
  role: 'user' | 'guide'
  text: string
  source?: boolean
}

export interface AIChatCardProps {
  title: string
  subtitle: string
  greeting: string
  prompt: string
  prompts: string[]
  placeholder: string
  note: string
  sourceHref: string
  sourceLabel: string
  resetLabel: string
  sendLabel: string
  messages: AIChatMessage[]
  icon?: React.ReactNode
  autoType?: boolean
  onSend: (message: string) => void
  onReset: () => void
  className?: string
  afterMessages?: React.ReactNode
  status?: React.ReactNode
  busy?: boolean
  resetDisabled?: boolean
  composerCaption?: string
  agentLabel?: string
  headingLabel?: string
}

export function AIChatCard({
  title, subtitle, greeting, prompt, prompts, placeholder, note,
  sourceHref, sourceLabel, resetLabel, sendLabel, messages,
  icon, autoType = true, onSend, onReset, className, afterMessages, status, busy = false, resetDisabled = false,
  composerCaption = 'BNB SMART CHAIN', agentLabel = 'FIRSTBELL / SOURCE',
  headingLabel = 'FIRSTBELL / AGENT',
}: AIChatCardProps) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const transcriptRef = React.useRef<HTMLDivElement>(null)
  const inView = useInView(rootRef, { margin: '-10% 0px' })
  const reduce = useReducedMotion()
  const [userActive, setUserActive] = React.useState(false)
  const [userMessage, setUserMessage] = React.useState('')
  const [spins, setSpins] = React.useState(0)
  const { text: typedMessage } = useTypewriter(prompts, {
    typeMs: 48, deleteMs: 14, holdMs: 3400, gapMs: 900,
    enabled: autoType && inView && !userActive && messages.length === 0,
  })

  React.useEffect(() => {
    if (messages.length && transcriptRef.current) transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight
  }, [messages.length, afterMessages])

  const takeOver = () => {
    if (userActive || !autoType) return
    setUserMessage(typedMessage)
    setUserActive(true)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const send = () => {
    const text = userMessage.trim()
    if (!text || busy) return
    onSend(text)
    setUserMessage('')
    setUserActive(true)
    textareaRef.current?.focus()
  }

  return <div ref={rootRef} className={cn('ai-chat-card', className)}>
    <header className="ai-chat-header">
      <div><span className="ai-chat-index">{headingLabel}</span><h1>{title}</h1><p>{subtitle}</p>{status}</div>
      <motion.button type="button" className="ai-chat-reset" aria-label={resetLabel} title={resetLabel}
        whileTap={reduce ? undefined : { scale: .93 }} disabled={busy || resetDisabled}
        onClick={() => { setSpins(count => count + 1); setUserActive(false); setUserMessage(''); onReset() }}>
        <motion.span animate={reduce ? undefined : { rotate: spins * 360 }} transition={{ duration: .55 }}><RefreshCw size={18} /></motion.span>
      </motion.button>
    </header>

    <div className="ai-chat-body">
      {messages.length === 0 && !afterMessages ? <div className="ai-chat-empty">
        <motion.div className="ai-chat-icon" animate={reduce ? undefined : { y: [0, -3, 0] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}>
          {icon ?? <MessageCircleDashed size={22} strokeWidth={1.7} />}
        </motion.div>
        <motion.h2 initial={reduce ? false : { opacity: 0, y: 8, filter: 'blur(3px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: reduce ? 0 : .25, ease: [.22, 1, .36, 1] }}>{greeting}</motion.h2>
        <p>{prompt}</p>
      </div> : <div ref={transcriptRef} className="ai-chat-transcript" role="log" aria-live="polite" aria-label={title}>
        {messages.map(message => <motion.div key={message.id} className={`ai-chat-message ${message.role}`}
          initial={reduce ? false : { opacity: 0, y: 8, filter: 'blur(3px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: reduce ? 0 : .25, ease: [.22, 1, .36, 1] }}>
          <span>{message.role === 'user' ? 'YOU' : agentLabel}</span><p>{message.text}</p>
          {message.role === 'guide' && message.source !== false && <a href={sourceHref} target="_blank" rel="noreferrer">{sourceLabel}</a>}
        </motion.div>)}
        {afterMessages}
      </div>}
    </div>

    <div className="ai-chat-composer-wrap">
      <div className="ai-chat-composer">
        {userActive || !autoType || messages.length > 0 ? <textarea ref={textareaRef} value={userMessage}
          onChange={event => setUserMessage(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send() } }}
          placeholder={placeholder} aria-label={placeholder} rows={2} />
        : <button type="button" className="ai-chat-typewriter" onClick={takeOver} aria-label={`${placeholder}: ${typedMessage || prompts[0]}`}>
          {typedMessage || <span className="ai-chat-placeholder">{placeholder}</span>}<span className="ai-chat-caret" aria-hidden="true" />
        </button>}
        <div className="ai-chat-composer-actions"><span>{composerCaption}</span>
          <motion.button type="button" className="ai-chat-send" aria-label={sendLabel} title={sendLabel} onClick={send} disabled={busy || !userMessage.trim()}
            whileTap={reduce ? undefined : { scale: .93 }}><ArrowUp size={19} /></motion.button>
        </div>
      </div>
      <p className="ai-chat-note">{note}</p>
    </div>
  </div>
}
