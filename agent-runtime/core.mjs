import { randomUUID } from 'node:crypto'
import { assetCatalog } from '../lib/asset-catalog.ts'
import { BSC_USDT } from '../lib/funding.ts'
import { researchStock, checkSkillTrade } from '../worker/wallet-skills.ts'
import { walletSkills, skillRiskFingerprint, skillTradeBlock } from '../lib/binance-wallet-skills.ts'
import { runBinanceCli } from './cli.mjs'
import { createOrderJournal } from './orders.mjs'
import { verifyBinanceSettlement } from './settlement.mjs'

const address = value => typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
const quantity = value => typeof value === 'string' && /^\d{1,12}(?:\.\d{1,18})?$/.test(value) && /[1-9]/.test(value)
const providerQuantity = value => typeof value === 'string' && /^\d{1,30}(?:\.\d{1,36})?$/.test(value) && /[1-9]/.test(value)
const scaled = value => { const [whole, fraction = ''] = value.split('.'); return BigInt(whole + fraction.padEnd(36, '0')) }
const same = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value)

// The language model may research and prepare. Only the local browser's
// confirmation handler receives executeReviewed; it is not an MCP tool.
export function createBinanceAgent({ runCli = runBinanceCli, research = researchStock, check = checkSkillTrade,
  journal = createOrderJournal(), verifySettlement = verifyBinanceSettlement, now = Date.now } = {}) {
  const reviews = new Map(), signin = new Map(), active = new Set()
  let preflight
  const versionCheck = async () => {
    if (!preflight) preflight = (async () => {
      const cli = await runCli(['cli-check', '--required-version', walletSkills.execution.cliVersion])
      if (cli?.needUpdateCli !== false) throw new Error('binance_cli_update_required')
      try { return await runCli(['skill-check', '--skill-name', walletSkills.execution.name, '--current-version', walletSkills.execution.version]) }
      catch { return null }
    })().catch(error => { preflight = null; throw error })
    return preflight
  }
  const connected = async () => {
    const update = await versionCheck()
    const state = await runCli(['wallet', 'status'])
    if (state?.status !== 'CONNECTED') throw new Error('Sign in to Binance Agentic Wallet first.')
    const [addresses, settings] = await Promise.all([runCli(['wallet', 'address']), runCli(['wallet', 'settings'])])
    const wallet = addresses?.addresses?.find(a => a.binanceChainId === '56')?.address
    if (!address(wallet)) throw new Error('BSC wallet address is unavailable.')
    return { wallet, settings: Object.fromEntries(['dailyLimit', 'quotaLeft', 'abnormalTxnHandling', 'tradeAllTokens', 'sessionExpireTime', 'inactiveSignOutTime'].map(k => [k, settings?.[k] ?? null])),
      skillUpdateAvailable: update?.needUpdateSkill === true, skillVersion: walletSkills.execution.version, cliVersion: walletSkills.execution.cliVersion }
  }
  const balances = async () => {
    const rows = await runCli(['wallet', 'balance', '--binanceChainId', '56'])
    return (Array.isArray(rows) ? rows : []).filter(row => row.binanceChainId === '56' && address(row.address) && typeof row.balance === 'string'
      && /^\d{1,30}(?:\.\d{1,36})?$/.test(row.balance)).map(row => ({ address: row.address, balance: row.balance,
      symbol: same(row.address, BSC_USDT.address) ? 'USDT' : assetCatalog.find(a => same(a.address, row.address))?.symbol ?? null })).filter(row => row.symbol)
  }
  const command = (action, plan) => ['market-order', action, '--fromTokenQty', plan.amount, '--fromToken', plan.fromToken, '--toToken', plan.toToken,
    '--binanceChainId', '56', '--slippage', '0.5', ...(action === 'swap' ? ['--mev', 'true', '--gasLevel', 'MEDIUM'] : [])]
  const quote = async plan => {
    const data = await runCli(command('quote', plan))
    if (!providerQuantity(data?.toCoinAmount) || !providerQuantity(data?.fromCoinAmount) || scaled(data.fromCoinAmount) !== scaled(plan.amount)
      || !same(data.fromCoinSymbol, plan.inputSymbol) || !same(data.toCoinSymbol, plan.outputSymbol)) throw new Error('invalid_binance_quote')
    return { inputAmount: data.fromCoinAmount, outputAmount: data.toCoinAmount }
  }
  const ownedRow = async reviewId => {
    if (!id(reviewId)) throw new Error('invalid_review_id')
    const row = await journal.get(reviewId)
    if (!row || !same((await connected()).wallet, row.wallet)) throw new Error('order_not_found_for_this_wallet')
    return row
  }
  const orderStatus = async reviewId => {
    const row = await ownedRow(reviewId)
    if (!row.orderId || ['FILLED', 'FAILED'].includes(row.status)) return row
    const data = await runCli(['market-order', 'list', '--orderId', row.orderId])
    const order = Array.isArray(data?.list) ? data.list.find(o => o.orderId === row.orderId) : null
    if (!order || order.chain !== '56' || !same(order.fromToken, row.fromToken) || !same(order.toToken, row.toToken)
      || !providerQuantity(order.fromTokenQty) || scaled(order.fromTokenQty) !== scaled(row.amount)) throw new Error('invalid_binance_order_status')
    if (order.status === 'FAILED') { row.status = 'FAILED'; row.txHash = null }
    else if (order.status === 'FINISHED') {
      row.status = 'CONFIRMING'
      try {
        const settlement = await verifySettlement(row, order.txHash)
        if (settlement) Object.assign(row, settlement, { status: 'FILLED' })
      } catch { /* A vendor status alone cannot prove transferred amounts. */ }
    } else if (order.status === 'PENDING') row.status = 'PENDING'
    else throw new Error('invalid_binance_order_status')
    await journal.save(row); return row
  }
  return {
    research: symbol => research(symbol),
    walletStatus: async () => {
      await versionCheck()
      const status = await runCli(['wallet', 'status'])
      return status?.status === 'CONNECTED' ? { status: 'CONNECTED', ...await connected() } : { status: ['UNCONNECTED', 'CREATING'].includes(status?.status) ? status.status : 'UNCONNECTED' }
    },
    signIn: async () => {
      if (active.size) throw new Error('Wait for the active trade confirmation before changing wallet sessions.')
      await versionCheck()
      const data = await runCli(['auth', 'signin'])
      if (data?.status === 'ALREADY_CONNECTED') return { status: 'CONNECTED', ...await connected() }
      const url = new URL(data?.urlForWeb)
      if (url.origin !== 'https://web3.binance.com' || url.username || url.password || !id(data?.qrCodeId)
        || !/^\d{4,12}$/.test(data?.pairingCode) || !Number.isFinite(Number(data?.expireAt))) throw new Error('invalid_binance_signin')
      signin.clear(); signin.set(data.qrCodeId, Number(data.expireAt)); reviews.clear()
      return { urlForWeb: data.urlForWeb, pairingCode: data.pairingCode, qrCodeId: data.qrCodeId, expireAt: String(data.expireAt), instruction: 'Open this exact Binance link, compare the pairing code and confirm in the Binance app. Then call verify_sign_in.' }
    },
    verifySignIn: async (qrCodeId, signal) => {
      if (!id(qrCodeId) || !signin.has(qrCodeId) || signin.get(qrCodeId) <= now()) throw new Error('Sign-in expired. Start a new sign-in.')
      try {
        await runCli(['auth', 'verify', '--qrCodeId', qrCodeId], { timeout: 310_000, signal })
        return { status: 'CONNECTED', ...await connected() }
      } finally { signin.delete(qrCodeId) }
    },
    signOut: async () => { if (active.size) throw new Error('Wait for the active trade confirmation before disconnecting.'); await runCli(['auth', 'signout']); reviews.clear(); signin.clear(); return { status: 'LOGGED_OUT' } },
    walletBalance: async () => ({ ...await connected(), balances: await balances() }),
    prepareTrade: async ({ symbol, side, amount }) => {
      const asset = assetCatalog.find(a => a.symbol === symbol)
      if (!asset || !['buy', 'sell'].includes(side) || !quantity(amount)) throw new Error('invalid_trade_request')
      const account = await connected(), report = await research(symbol)
      const block = skillTradeBlock(report)
      if (block) throw new Error(block)
      const fromToken = side === 'buy' ? BSC_USDT.address : asset.address, toToken = side === 'buy' ? asset.address : BSC_USDT.address
      const held = (await balances()).find(b => same(b.address, fromToken))
      if (!held || scaled(held.balance) < scaled(amount)) throw new Error('insufficient_balance')
      if (side === 'buy' && typeof account.settings.quotaLeft === 'number' && Number(amount) > account.settings.quotaLeft) throw new Error('Binance daily quota is insufficient. Review your settings in the Binance app.')
      for (const [key, plan] of reviews) if (plan.expiresAt <= now()) reviews.delete(key)
      if (reviews.size >= 16) throw new Error('Too many active reviews. Wait for an earlier review to expire.')
      const plan = { reviewId: randomUUID(), wallet: account.wallet, symbol, side, amount, fromToken, toToken,
        inputSymbol: side === 'buy' ? 'USDT' : symbol, outputSymbol: side === 'buy' ? symbol : 'USDT',
        chainId: 56, report, slippagePercent: '0.5', mev: true, expiresAt: now() + 120_000 }
      plan.quote = await quote(plan)
      reviews.set(plan.reviewId, plan)
      return { ...plan, instruction: 'Open the local FirstBell review and personally click Confirm trade. This tool has not placed an order. The Binance wallet is separate from your Privy wallet.' }
    },
    getReview: reviewId => reviews.get(reviewId) ?? null,
    executeReviewed: async reviewId => {
      const plan = reviews.get(reviewId)
      if (!plan || plan.expiresAt <= now() || active.has(reviewId)) throw new Error('Review expired or already confirmed. Request a fresh review.')
      active.add(reviewId); reviews.delete(reviewId)
      let row = { reviewId, wallet: plan.wallet, symbol: plan.symbol, side: plan.side, amount: plan.amount,
        inputSymbol: plan.inputSymbol, outputSymbol: plan.outputSymbol, fromToken: plan.fromToken, toToken: plan.toToken,
        createdAt: new Date(now()).toISOString(), status: 'UNKNOWN', orderId: null, txHash: null, inputAmount: null, outputAmount: null }
      let dispatching = false
      try {
        if (await journal.get(reviewId)) throw new Error('This review was already used. Check its status; it will not be sent again.')
        if (!same((await connected()).wallet, plan.wallet)) throw new Error('wallet_changed')
        const fresh = await check(plan.symbol)
        if (skillRiskFingerprint(fresh) !== skillRiskFingerprint(plan.report)) throw new Error('skill_checks_changed')
        const current = await quote(plan)
        if (scaled(current.outputAmount) * 1000n < scaled(plan.quote.outputAmount) * 995n) throw new Error('quote_changed')
        const held = (await balances()).find(b => same(b.address, plan.fromToken))
        if (!held || scaled(held.balance) < scaled(plan.amount)) throw new Error('insufficient_balance')
        if (plan.expiresAt <= now() || !same((await connected()).wallet, plan.wallet)) throw new Error('Review expired or the connected wallet changed. Get a fresh review.')
        // Persist UNKNOWN before the single dispatch. A timeout or process
        // restart must never cause an automatic second market swap.
        await journal.save(row)
        dispatching = true
        const submitted = await runCli(command('swap', plan))
        if (!id(submitted?.orderId)) throw new Error('submission_unknown')
        row = { ...row, orderId: submitted.orderId, status: 'PENDING' }
        await journal.save(row)
        try { return await orderStatus(reviewId) } catch { return row }
      } catch (error) {
        row.status = dispatching ? 'UNKNOWN' : 'FAILED'
        row.error = dispatching ? 'Submission is unconfirmed. Check Binance history; this review will never submit again.' : error.message
        await journal.save(row)
        return row
      } finally { active.delete(reviewId) }
    },
    orderStatus,
    orderHistory: async () => { const { wallet } = await connected(); return (await journal.list()).filter(row => same(row.wallet, wallet)) },
  }
}
