import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync, readdirSync } from 'node:fs'
import ts from 'typescript'
import { languages, localeFor, localized, text, formatText, savedLanguage, signedPercent, amountFromInput, amountForInput } from '../lib/i18n.ts'
import { translations } from '../lib/i18n-messages.ts'
import { parseAgentIntent } from '../lib/agent-intent.ts'

test('all authored bilingual UI copy and inline messages have complete new-language translations', () => {
  const technical = new Set(['GitHub', 'BNB Chain on X', 'BNB Smart Chain', 'Onramper', 'Ondo · BNB Smart Chain',
    'orange', 'blue', 'purple', 'FIRSTBELL', 'BNB SMART CHAIN', 'USDT', 'BNB', 'BNB Smart Chain · BEP20', '01', '02', '03', '0.00', '0x…'])
  const missing = new Set()
  const check = value => {
    if (!value || technical.has(value)) return
    if (!translations[value]) { missing.add(value); return }
    const placeholders = input => [...input.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()
    assert.equal(translations[value].length, 3)
    for (const translation of translations[value]) {
      assert.ok(translation.trim(), value)
      assert.deepEqual(placeholders(translation), placeholders(value), value)
    }
  }
  const strings = node => {
    if (ts.isStringLiteral(node)) check(node.text)
    else ts.forEachChild(node, strings)
  }
  const files = readdirSync(new URL('../src/', import.meta.url)).filter(file => file.endsWith('.tsx')).map(file => 'src/' + file).concat('lib/trade-error.ts')
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(new URL('../' + file, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const walk = node => {
      if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'en' && ts.isObjectLiteralExpression(node.initializer)) strings(node.initializer)
      if (ts.isCallExpression(node) && node.expression.getText(source) === 'text' && ts.isStringLiteral(node.arguments[1])) check(node.arguments[1].text)
      ts.forEachChild(node, walk)
    }
    walk(source)
  }
  assert.deepEqual([...missing], [])
})

test('language preferences restore all five options and safely default for invalid or blocked storage', () => {
  const original = globalThis.localStorage
  try {
    for (const { id, locale } of languages) {
      globalThis.localStorage = { getItem: () => id }
      assert.equal(savedLanguage(), id); assert.equal(localeFor(id), locale)
    }
    globalThis.localStorage = { getItem: () => 'de' }; assert.equal(savedLanguage(), 'en')
    globalThis.localStorage = { getItem: () => { throw new Error('blocked') } }; assert.equal(savedLanguage(), 'en')
  } finally { globalThis.localStorage = original }
})

test('nested copy, arrays, dynamic messages and percentages localize without modifying user or token data', () => {
  const source = { en: { title: 'Portfolio', examples: ['Buy $10 of Nvidia'], nested: { status: 'Filled' } }, zh: { title: '资产' } }
  assert.equal(localized(source, 'en'), source.en); assert.equal(localized(source, 'zh'), source.zh)
  assert.equal(localized(source, 'es').title, 'Cartera')
  assert.equal(localized(source, 'fr').nested.status, 'Exécuté')
  assert.equal(localized(source, 'pt').examples[0], 'Comprar $10 de Nvidia')
  assert.equal(source.en.title, 'Portfolio')
  assert.equal(text('es', 'NVDAon'), 'NVDAon')
  assert.equal(formatText(text('fr', 'You have {usdt} USDT to spend and {bnb} BNB for network fees.'), { usdt: '1.25', bnb: '0.01' }), 'Vous avez 1.25 USDT à dépenser et 0.01 BNB pour les frais réseau.')
  for (const language of ['es', 'fr', 'pt']) {
    assert.equal(signedPercent(1.25, language), '+1,25%')
    assert.equal(signedPercent(-1.25, language), '−1,25%')
  }
})

test('translated Agent examples and decimal quantities preserve the requested asset, side and amount', () => {
  for (const language of ['es', 'fr', 'pt']) {
    const buy = parseAgentIntent(text(language, 'Buy $10 of Nvidia'), language)
    assert.deepEqual(buy, { kind: 'trade', symbol: 'NVDAon', side: 'buy', amount: '10', fraction: null, quoteOnly: false })
    const sell = parseAgentIntent(text(language, 'Sell half my Tesla'), language)
    assert.deepEqual(sell, { kind: 'trade', symbol: 'TSLAon', side: 'sell', amount: null, fraction: 'half', quoteOnly: false })
    assert.deepEqual(parseAgentIntent(text(language, 'Show my balance'), language), { kind: 'balance' })
  }
  for (const [language, prompt] of [['es', 'Vende 0,1 TSLAon'], ['fr', 'Vendre 0,1 TSLAon'], ['pt', 'Vender 0,1 TSLAon']]) {
    assert.equal(parseAgentIntent(prompt, language).amount, '0.1')
    assert.equal(parseAgentIntent(prompt.replace('0,1', '0.1'), language).amount, '0.1')
    assert.equal(parseAgentIntent(prompt.replace('0,1', '1,000.00'), language).kind, 'help')
  }
  assert.equal(parseAgentIntent('Buy 1,000 USDT of Nvidia', 'en').amount, '1000')
  assert.equal(parseAgentIntent('Comprar 10 USDT de DEon', 'pt').symbol, 'DEon')
  assert.equal(parseAgentIntent('Acheter 10 USDT de DE', 'fr').symbol, 'DEon')
  assert.equal(parseAgentIntent('Compra 10 USDT de Nvidia y DEon', 'es').kind, 'help')
})

test('localized negations, conditional or scheduled trades, transfers and conflicting amounts cannot create a trade', () => {
  for (const [language, prompts] of [
    ['es', ['No compra 10 USDT de Nvidia', 'Compra Nvidia con 10 USDT si baja', 'Compra Nvidia cada semana con 10 USDT', 'Compra Nvidia o Tesla con 10 USDT', 'Vende la mitad y todo mi Tesla', 'Vende 10 dólares de Tesla']],
    ['fr', ['Ne pas acheter 10 USDT de Nvidia', 'Acheter Nvidia avec 10 USDT quand le prix baisse', 'Acheter 10 USDT de Nvidia demain', 'Acheter Nvidia ou Tesla avec 10 USDT', 'Vendre la moitié et tous mes Tesla', 'Acheter puis envoyer 10 USDT de Nvidia']],
    ['pt', ['Não comprar 10 USDT de Nvidia', 'Comprar Nvidia com 10 USDT se cair', 'Comprar 10 USDT de Nvidia amanhã', 'Comprar Nvidia ou Tesla com 10 USDT', 'Vender metade e toda a minha Tesla', 'Comprar e transferir 10 USDT de Nvidia']],
  ]) for (const prompt of prompts) assert.equal(parseAgentIntent(prompt, language).kind, 'help', prompt)
})

test('localized decimal inputs preserve canonical spend precision and never remove grouping or mixed separators', () => {
  for (const language of ['es', 'fr', 'pt']) {
    assert.equal(amountFromInput('1,123456789123456789', language), '1.123456789123456789')
    assert.equal(amountForInput('1.123456789123456789', language), '1,123456789123456789')
    assert.equal(amountFromInput('1,000.00', language), '1,000.00')
    assert.equal(amountFromInput('1,000,000', language), '1,000,000')
    assert.equal(amountFromInput('1.25', language), '1.25')
  }
  assert.equal(amountFromInput('1,25', 'en'), '1,25')
  assert.equal(amountForInput('1.25', 'zh'), '1.25')
})
