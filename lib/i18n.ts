import { translations } from './i18n-messages.ts'

export type Language = 'en' | 'zh' | 'es' | 'fr' | 'pt'
export const languages = [
  { id: 'en', name: 'English', short: 'EN', locale: 'en-US' },
  { id: 'zh', name: '中文', short: '中文', locale: 'zh-CN' },
  { id: 'es', name: 'Español', short: 'ES', locale: 'es-ES' },
  { id: 'fr', name: 'Français', short: 'FR', locale: 'fr-FR' },
  { id: 'pt', name: 'Português', short: 'PT', locale: 'pt-BR' },
] as const
export const localeFor = (language: Language) => languages.find(item => item.id === language)!.locale
export function savedLanguage(): Language {
  try { const saved = localStorage.getItem('firstbell-language'); return languages.find(item => item.id === saved)?.id ?? 'en' }
  catch { return 'en' }
}

// Translate authored UI copy only. Symbols, addresses, provider data and user
// messages never pass through this catalog.
export function text(language: Language, english: string, chinese = english): string {
  if (language === 'en') return english
  if (language === 'zh') return chinese
  return translations[english]?.[language === 'es' ? 0 : language === 'fr' ? 1 : 2] ?? english
}
const cache = new WeakMap<object, Partial<Record<Language, unknown>>>()
export function localized<T extends { en: object; zh: object }>(source: T, language: Language): T['en'] {
  if (language === 'en' || language === 'zh') return source[language] as T['en']
  const existing = cache.get(source) ?? {}
  if (!existing[language]) {
    const translate = (value: unknown): unknown => typeof value === 'string' ? text(language, value)
      : Array.isArray(value) ? value.map(translate)
      : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, translate(item)])) : value
    existing[language] = translate(source.en)
    cache.set(source, existing)
  }
  return existing[language] as T['en']
}
export function formatText(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match)
}
export function signedPercent(value: number, language: Language): string {
  return `${value >= 0 ? '+' : '−'}${new Intl.NumberFormat(localeFor(language), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(value))}%`
}
export function amountForInput(value: string, language: Language): string {
  return ['es', 'fr', 'pt'].includes(language) && !value.includes(',') ? value.replace('.', ',') : value
}
export function amountFromInput(value: string, language: Language): string {
  // Inputs retain canonical decimal strings for signing. Mixed separators and
  // grouping remain invalid rather than silently changing the spend amount.
  return ['es', 'fr', 'pt'].includes(language) && /^\d*,\d*$/.test(value) ? value.replace(',', '.') : value
}
