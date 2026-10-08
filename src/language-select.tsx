import * as React from 'react'
import { Check, ChevronDown, Globe2 } from 'lucide-react'
import { languages, text, type Language } from '../lib/i18n'
import './language-select.css'

export function LanguageSelect({ language, onChange, className = '' }: {
  language: Language; onChange: (language: Language) => void; className?: string
}) {
  const [open, setOpen] = React.useState(false)
  const root = React.useRef<HTMLDivElement>(null)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const id = React.useId()
  const label = text(language, 'Language', '语言')
  React.useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus()
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  const move = (event: React.KeyboardEvent) => {
    const buttons = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length
      : event.key === 'ArrowUp' ? (index + buttons.length - 1) % buttons.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null
    if (next !== null) { event.preventDefault(); buttons[next]?.focus() }
  }
  return <div className="language-picker" ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }}>
    <button ref={trigger} type="button" className={className} aria-label={label} aria-haspopup="menu"
      aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) } }}>
      <Globe2 size={17} aria-hidden="true" /><span>{languages.find(item => item.id === language)!.short}</span><ChevronDown size={12} aria-hidden="true" />
    </button>
    {open && <div id={id} role="menu" aria-label={label} className="language-picker-menu" onKeyDown={move}>
      {languages.map(item => <button key={item.id} type="button" role="menuitemradio" lang={item.locale}
        aria-checked={language === item.id} onClick={() => { onChange(item.id); setOpen(false); trigger.current?.focus() }}>
        <span>{item.name}</span>{language === item.id && <Check size={16} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>
}
