import { amountForInput, localized, text, localeFor, formatText, type Language } from '../lib/i18n'
import * as React from 'react'
import { getIdentityToken, useIdentityToken, usePrivy, useSendTransaction, useSignTypedData, useWallets } from '@privy-io/react-auth'
import { Check, ExternalLink, LoaderCircle, Wallet } from 'lucide-react'
import { createPublicClient, formatUnits, http } from 'viem'
import { bsc } from 'viem/chains'
import { AIChatCard, type AIChatMessage } from '@/components/spectrumui/ai-chat-card'
import { assetCatalog, assetLogo, tokenLogoError } from '../lib/asset-catalog'
import { fractionOfQuantity, parseAgentIntent, type TradeIntent } from '../lib/agent-intent'
import { terminalOrder, validateAgentTradePlan, type AgentOrder, type AgentTradePlan } from '../lib/agent-trading'
import { withWalletSession, type WalletSession } from '../lib/wallet-session'
import { abortable, PREPARE_TIMEOUT_MS, QUOTE_TIMEOUT_MS } from '../lib/quote-timeout'
import { routeFailureMessages, TradeRequestError } from '../lib/trade-error'
import { checkTrade, prepareTrade, recoverTrade, submitTrade, researchStockWithSkills } from './agent-api'
import { walletSkillsCopy } from '../lib/wallet-skills-copy'
import { WalletSkillReport } from './wallet-skill-report'
import { displayQuantity, readWalletBalances } from './wallet-balances'
import { clearSignedTrade, readSignedTrades, readWalletOrders, storeSignedTrade, storeTradeReceipt } from '../lib/trade-storage'
import { getTradingRoute } from './market-api'
import manifest from '@/asset-sources.json'

const client = createPublicClient({ chain: bsc, transport: http('https://bsc-dataseed.bnbchain.org', { timeout: 10_000, retryCount: 0 }) })
const copy = {
  en: {
    title: 'Trade in your own words', subtitle: 'Your wallet. Your confirmation.', greeting: 'What would you like to trade?',
    help: 'Try “Buy $10 of Nvidia” or “Sell half my Tesla.” You review every trade before signing.',
    prompt: 'Buy, sell, or check your balance…', send: 'Send message', reset: 'New conversation', note: 'Simple commands use a fixed parser. Trades use live Binance quotes and your Privy wallet.',
    examples: ['Buy $10 of Nvidia', 'Sell half my Tesla', 'Show my balance'], login: 'Log In', walletLoading: 'Preparing wallet', connected: 'Wallet connected',
    signIn: 'Log in with Google or email to use your wallet. Then send your command again.', loading: 'Checking wallet and trading route…',
    minimumOrder: 'The provider requires a trade worth at least ${value}. Choose an amount that meets it and send your command again.', minimumOrderUnknown: 'This trade is below the provider’s minimum value. Choose a larger amount and send your command again.',
    select: 'Name one token or company, such as Nvidia, Apple, or TSLAon.', amount: 'For a buy, enter USDT to spend: “Buy Nvidia with 10 USDT.” For a sell, enter token quantity: “Sell 0.1 TSLAon,” “Sell half my Tesla,” or “Sell all my Tesla.”',
    ambiguous: 'Please request one trade with one asset and amount. Dollar-based sells and multiple assets need separate commands.', unsupported: 'I can buy or sell one listed token, check your balance or holdings, and look up issuer records. Try “Buy $10 of Nvidia.” Scheduled strategies and transfers are not supported.',
    preparing: 'I’ll check the amount and wallet, then show a trade for you to review.', cancel: 'Trade review cancelled. No order was submitted.', noOrder: 'No order to check yet.',
    balance: 'You have {usdt} USDT to spend and {bnb} BNB for network fees.', empty: 'No listed stock tokens were found in this wallet.',
    quoteOnly: 'Quote only · no order placed', review: 'Review trade', spend: 'You spend', receive: 'Quoted receive', minimum: 'Minimum receive', fee: 'Included order fee', feeEstimate: 'Included fee estimate', network: 'Network', vendor: 'Route', destination: 'Your wallet', expires: 'Order expires',
    approve: 'Approve this amount', resetAllowance: 'Reset token permission', approvalNote: 'A token permission is needed before trading. You confirm this in your wallet; it does not place an order.', gas: 'Estimated network fee',
    confirm: 'Confirm trade', cancelAction: 'Cancel', refresh: 'Refresh quote', expired: 'The order expired. Get a fresh quote to review.',
    walletConfirm: 'Confirm in your wallet…', approvalPending: 'Waiting for token permission to confirm…', approvalDone: 'Token permission confirmed. Get a fresh quote and review it before signing the order.',
    submitted: 'Order submitted. Checking settlement…', checking: 'Checking order…', pending: 'Your order is still processing. Check its status again shortly.', filled: 'Trade confirmed on BNB Smart Chain.', failed: 'The order did not fill. No trade success is recorded.', check: 'Check order status', tx: 'View transaction', recovery: 'Check order status', uncertain: 'Submission could not be confirmed. Check the same submission before starting another trade.',
    busy: 'Finish or cancel the current trade before starting another.', records: 'View token list',
    errors: { ...routeFailureMessages.en, insufficient_balance: 'Your wallet does not have enough of the input token.', insufficient_gas: 'Add a little BNB for the token permission’s network fee.',
      unsupported_order_schema: 'This trading route cannot be safely signed in FirstBell yet.', invalid_order_payload: 'The returned order did not match your requested trade.',
      simulation_failed: 'The token permission failed its simulation. No transaction was sent.', market_closed: 'The provider is not trading this token while its market is closed. Try when it reopens.', provider_unavailable: 'The trading provider is unavailable from the app server.',
      not_configured: 'Binance trading credentials need to be configured.', account_not_configured: 'Account verification needs to be configured.',
      wallet_verification_not_configured: 'Privy wallet verification needs to be enabled for this app.', wallet_verification_unavailable: 'Privy could not verify the wallet. Check the app’s Privy credentials.', wallet_not_verified: 'Your wallet could not be verified. Sign in again.',
      unauthorized: 'Sign in again to continue.', order_fee_changed: 'The provider changed its fee format. Get a fresh quote and confirm again.', stale_quote: 'The quote expired. Get a new quote.', rate_limited: 'Wait a minute before checking again.', quote_timeout: 'The request took too long. Retry shortly.',
      settlement_not_verified: 'The settlement could not be verified on chain. Check the order again.', invalid_order_signature: 'The wallet signature did not match this order.', approval_required: 'Token permission needs to be confirmed first.',
      provider_error: 'The trading provider could not complete this request. Try again shortly.', wallet_loading: 'Your wallet is still being prepared.', session_timeout: 'Your sign-in session took too long. Try again.', wallet_rejected: 'Wallet confirmation was cancelled.', wallet_changed: 'The connected wallet changed. Request a new trade.', approval_failed: 'The token permission transaction failed.', balance_unavailable: 'Wallet balances could not be loaded. Try again.', account_storage_not_configured: 'Account storage needs to be configured.', account_storage_unavailable: 'Account storage is temporarily unavailable.', invalid_amount: 'Enter a supported positive amount.' },
  },
  zh: {
    title: '用自己的话交易', subtitle: '你的钱包，由你确认。', greeting: '你想交易什么？', help: '试试“用 10 USDT 买入 NVDAon”或“卖出一半特斯拉”。每笔交易由你审核后签名。',
    prompt: '买入、卖出或查看余额…', send: '发送消息', reset: '新对话', note: '简单指令由固定解析器识别。交易使用 Binance 实时报价和你的 Privy 钱包。', examples: ['用 10 USDT 买入 NVDAon', '卖出一半特斯拉', '查看余额'],
    login: '登录', walletLoading: '正在准备钱包', connected: '钱包已连接', signIn: '请用 Google 或邮箱登录后重新发送指令。', loading: '正在检查钱包和交易路线…',
    minimumOrder: '服务商要求交易价值至少为 {value} 美元。请选择符合要求的金额并重新发送指令。', minimumOrderUnknown: '此交易低于服务商的最低交易价值。请增加金额并重新发送指令。',
    select: '请指定一个代币或公司，例如 NVDAon、苹果或 TSLAon。', amount: '买入请指定 USDT 支付金额；卖出请指定代币数量、一半或全部持仓。', ambiguous: '每次请只指定一项资产和一个金额。', unsupported: '支持单项代币买卖、余额及持仓查询和发行方资料。暂不支持定期策略或转账。',
    preparing: '正在检查钱包和金额，随后由你审核交易。', cancel: '已取消交易审核，尚未提交订单。', noOrder: '尚无订单可查询。',
    balance: '可用金额为 {usdt} USDT，网络费用余额为 {bnb} BNB。', empty: '此钱包暂无目录内的股票代币。',
    quoteOnly: '仅报价，未下单', review: '审核交易', spend: '支付', receive: '报价接收数量', minimum: '最低接收数量', fee: '已含订单费用', feeEstimate: '费用估算 · 已包含', network: '网络', vendor: '路线', destination: '你的钱包', expires: '订单到期时间',
    approve: '授权此金额', resetAllowance: '重置代币授权', approvalNote: '交易前需要代币授权。此步骤由钱包确认，并不会下单。', gas: '预计网络费', confirm: '确认交易', cancelAction: '取消', refresh: '刷新报价', expired: '订单已过期，请获取新报价。',
    walletConfirm: '请在钱包中确认…', approvalPending: '等待代币授权确认…', approvalDone: '代币授权已确认。请获取新报价并审核，然后签署订单。', submitted: '订单已提交，正在检查结算…', checking: '正在查询订单…', pending: '订单仍在处理中，请稍后查询。', filled: '交易已在 BNB 智能链上确认。', failed: '订单未成交，未记录交易成功。', check: '查询订单状态', tx: '查看交易', recovery: '查询订单状态', uncertain: '无法确认提交结果。开始新交易前请查询同一次提交。', busy: '请先完成或取消当前交易。', records: '查看代币列表',
    errors: { ...routeFailureMessages.zh, insufficient_balance: '钱包中的支付代币不足。', insufficient_gas: '请添加少量 BNB 支付网络费用。', unsupported_order_schema: '此路线尚不支持安全签名。', invalid_order_payload: '订单与交易请求不符。', simulation_failed: '代币授权模拟失败，未发送交易。', market_closed: '此代币市场关闭，暂不支持交易。', provider_unavailable: '服务器无法使用交易服务。', not_configured: '请配置 Binance 交易凭证。', account_not_configured: '请配置账户验证。', wallet_verification_not_configured: '请启用 Privy 钱包验证。', wallet_verification_unavailable: '钱包验证失败，请检查 Privy 凭证。', wallet_not_verified: '钱包无法验证，请重新登录。', unauthorized: '请重新登录。', order_fee_changed: '服务商的费用格式已改变。请获取新报价并重新确认。', stale_quote: '报价已过期，请重新获取。', rate_limited: '请等待一分钟后重试。', quote_timeout: '请求超时，请稍后重试。', settlement_not_verified: '无法核实链上结算，请再次查询。', invalid_order_signature: '钱包签名与订单不符。', approval_required: '请先完成代币授权。', provider_error: '交易服务暂不可用，请稍后重试。', wallet_loading: '钱包仍在准备中。', session_timeout: '登录状态加载超时，请重试。', wallet_rejected: '已取消钱包确认。', wallet_changed: '钱包已改变，请重新发起交易。', approval_failed: '代币授权交易失败。', balance_unavailable: '无法加载余额，请重试。' },
  },
}

export function AgentWorkspace({ language }: { language: Language }) {
  const t = localized(copy, language)
  const { authenticated, login, getAccessToken } = usePrivy()
  const { wallets, ready } = useWallets()
  const { identityToken } = useIdentityToken()
  const { signTypedData } = useSignTypedData()
  const { sendTransaction } = useSendTransaction()
  const wallet = wallets.find(item => item.walletClientType === 'privy' || item.walletClientType === 'privy_v2')
  const address = authenticated && ready ? wallet?.address : undefined
  const [messages, setMessages] = React.useState<AIChatMessage[]>([])
  const [plan, setPlan] = React.useState<AgentTradePlan | null>(null)
  const [intent, setIntent] = React.useState<TradeIntent | null>(null)
  const [order, setOrder] = React.useState<AgentOrder | null>(null)
  const [phase, setPhase] = React.useState<'idle' | 'loading' | 'wallet' | 'approval' | 'submitted' | 'uncertain'>('idle')
  const [notice, setNotice] = React.useState('')
  const [expired, setExpired] = React.useState(false)
  const skillsText = walletSkillsCopy[language]
  const live = React.useRef({ address, identityToken, active: true })
  live.current = { address, identityToken, active: true }
  const busyRef = React.useRef(false)
  const controller = React.useRef<AbortController | null>(null)
  const signedAttempt = React.useRef<{ plan: AgentTradePlan; signature: string } | null>(null)
  const operation = React.useRef(0)
  const busy = ['loading', 'wallet', 'approval', 'submitted'].includes(phase)
  const pending = Boolean(order && !terminalOrder(order.status)) || phase === 'uncertain'
  const say = (text: string, source = false) => setMessages(list => [...list, { id: list.length + 1, role: 'guide', text, source }])
  const errorText = (error: unknown) => {
    const reason = error instanceof Error ? error.message : ''
    if (reason in skillsText.errors) return skillsText.errors[reason as keyof typeof skillsText.errors]
    if (reason === 'minimum_order_not_met') return (error instanceof TradeRequestError && error.minimumUsd ? formatText(t.minimumOrder, { value: amountForInput(error.minimumUsd, language) }) : t.minimumOrderUnknown)
    if (/reject|cancel|4001/i.test(reason)) return t.errors.wallet_rejected
    return t.errors[reason as keyof typeof t.errors] ?? t.errors.provider_error
  }
  const session = <T,>(action: (value: WalletSession) => Promise<T>, signal?: AbortSignal) => withWalletSession({ getAccessToken,
    getIdentityToken: () => live.current.identityToken, refreshIdentityToken: getIdentityToken }, action, signal)
  const assertWallet = (owner: string) => { if (!live.current.active || live.current.address?.toLowerCase() !== owner.toLowerCase()) throw new Error('wallet_changed') }
  const persist = (next: AgentOrder, owner: string) => { try { storeTradeReceipt(localStorage, owner, next) } catch { /* Status stays available in this view. */ } }

  React.useEffect(() => {
    operation.current += 1; controller.current?.abort(); signedAttempt.current = null
    setPlan(null); setIntent(null); setOrder(null); setPhase('idle'); busyRef.current = false; setNotice('')
    if (address) { try {
      const records = readWalletOrders(localStorage, address)
      const saved = records.at(-1)
      if (saved) setOrder(saved)
      signedAttempt.current = readSignedTrades(localStorage, address).find(attempt => !records.some(order => order.trade?.requestId === attempt.plan.requestId)) ?? null
      if (signedAttempt.current) { setPhase('uncertain'); setNotice(t.uncertain) }
    } catch { /* Ignore invalid local history. Server verifies the ticket. */ } }
    return () => { operation.current += 1; controller.current?.abort(); live.current.active = false }
  }, [address])
  React.useEffect(() => {
    setExpired(false)
    if (!plan) return
    const remaining = Date.parse(plan.expiresAt) - Date.now() - 5_000
    if (remaining <= 0) { setExpired(true); return }
    const timer = window.setTimeout(() => setExpired(true), remaining)
    return () => window.clearTimeout(timer)
  }, [plan])
  React.useEffect(() => {
    if (phase !== 'uncertain' && !['wallet', 'approval', 'submitted'].includes(phase)) return
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [phase])

  const prepare = async (next: TradeIntent) => {
    if (!address) { say(t.signIn); return }
    if (busyRef.current) return
    busyRef.current = true
    const version = ++operation.current
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort
    const deadline = AbortSignal.timeout(next.quoteOnly ? QUOTE_TIMEOUT_MS : PREPARE_TIMEOUT_MS)
    const signal = AbortSignal.any([abort.signal, deadline])
    setPhase('loading'); setNotice(t.loading); setPlan(null); setIntent(next)
    try {
      const asset = assetCatalog.find(item => item.symbol === next.symbol)!
      let amount = next.amount
      if (next.fraction) {
        let balances
        try { balances = await abortable(() => readWalletBalances(address, [asset]), signal) } catch { if (signal.aborted) throw signal.reason; throw new Error('balance_unavailable') }
        amount = fractionOfQuantity(balances.tokens[0].quantity, next.fraction)
      }
      if (!amount) throw new Error('invalid_amount')
      assertWallet(address)
      if (next.quoteOnly) {
        const report = await researchStockWithSkills(asset.symbol, signal)
        const route = await session(value => getTradingRoute(asset.symbol, next.side, amount!, address, value.accessToken, value.identityToken, signal), signal)
        if (version === operation.current) { setMessages(list => [...list, { id: list.length + 1, role: 'guide', text: `${route.inputAmount} ${route.inputSymbol} → ${displayQuantity(route.outputAmount, 6, localeFor(language))} ${route.outputSymbol}. ${t.quoteOnly}`, source: false, attachment: <WalletSkillReport report={report} language={language} /> }]); setIntent(null); setNotice('') }
      } else {
        const prepared = await session(value => prepareTrade({ symbol: asset.symbol, side: next.side, amount: amount!, walletAddress: address, walletSkills: true }, value, signal), signal)
        if (version === operation.current) { setPlan(prepared); setIntent({ ...next, amount, fraction: null }); setNotice('') }
      }
    } catch (error) { if (version === operation.current) setNotice(errorText(deadline.aborted && !abort.signal.aborted ? new Error('quote_timeout') : error)) }
    finally { if (version === operation.current) { setPhase('idle'); busyRef.current = false } }
  }

  const checkOrder = async () => {
    if (!order || !address || busyRef.current) return
    busyRef.current = true; setPhase('loading'); setNotice(t.checking)
    const version = operation.current
    try {
      const checked = await session(value => checkTrade(order, address, value))
      if (version !== operation.current) return
      setOrder(checked); persist(checked, address)
      setNotice(checked.status === 'FILLED' ? `${t.filled} ${checked.inputAmount} → ${checked.outputAmount}` : terminalOrder(checked.status) ? t.failed : t.pending)
    } catch (error) { if (version === operation.current) setNotice(errorText(error)) }
    finally { if (version === operation.current) { busyRef.current = false; setPhase('idle') } }
  }
  React.useEffect(() => {
    if (!order || terminalOrder(order.status) || !address || busy) return
    const timer = window.setTimeout(() => { void checkOrder() }, 15_000)
    return () => window.clearTimeout(timer)
  }, [order, address, busy]) // A new checked order schedules the next bounded poll.

  const confirm = async () => {
    if (!plan || !address || busyRef.current || pending) return
    busyRef.current = true; setPhase('wallet'); setNotice(t.walletConfirm)
    const version = operation.current
    const owner = address
    try {
      const reviewed = validateAgentTradePlan(plan, { symbol: plan.route.symbol, side: plan.route.side, amount: plan.route.inputAmount, walletAddress: owner })
      assertWallet(owner)
      await wallet!.switchChain(56)
      assertWallet(owner)
      if (reviewed.approval) {
        const approval = reviewed.approval
        const { hash } = await sendTransaction({ chainId: 56, to: approval.to, data: approval.data, value: 0n }, { address: owner,
          uiOptions: { showWalletUIs: true, description: approval.reset ? t.resetAllowance : `${t.approve}: ${reviewed.route.inputAmount} ${reviewed.route.inputSymbol}` } })
        assertWallet(owner); setPhase('approval'); setNotice(t.approvalPending)
        const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 2, timeout: 90_000, pollingInterval: 4_000 })
        assertWallet(owner)
        if (receipt.status !== 'success') throw new Error('approval_failed')
        setPlan(null); setNotice(t.approvalDone)
      } else {
        const { signature } = await signTypedData(reviewed.typedData, { address: owner, uiOptions: { showWalletUIs: true, title: `${reviewed.route.side === 'buy' ? 'Buy' : 'Sell'} ${reviewed.route.symbol}` } })
        assertWallet(owner)
        signedAttempt.current = { plan: reviewed, signature }
        try { storeSignedTrade(localStorage, owner, signedAttempt.current) } catch { /* Retain the exact submission in memory. */ }
        setPhase('submitted'); setNotice(t.submitted)
        const submitted = await session(value => { assertWallet(owner); return submitTrade(reviewed, signature, value) })
        persist(submitted, owner)
        try { clearSignedTrade(localStorage, owner, { plan: reviewed, signature }) } catch { /* Receipt deduplicates the saved attempt. */ }
        if (version !== operation.current) return
        setOrder(submitted); signedAttempt.current = null; setPlan(null); setIntent(null)
        setNotice(submitted.status === 'FILLED' ? t.filled : terminalOrder(submitted.status) ? t.failed : t.pending)
      }
    } catch (error) {
      if (version !== operation.current) return
      // Once a signature exists, a missing response is ambiguous. Never create
      // another requestId; reconciliation only reads the same submission.
      if (signedAttempt.current) { setPhase('uncertain'); setNotice(t.uncertain) }
      else { setPhase('idle'); setNotice(errorText(error)) }
    } finally { if (version === operation.current) { busyRef.current = false; setPhase(value => value === 'uncertain' ? value : 'idle') } }
  }

  const recover = async () => {
    const attempt = signedAttempt.current
    if (!attempt || !address || busyRef.current) return
    busyRef.current = true; setPhase('submitted'); setNotice(t.submitted)
    const version = operation.current
    try {
      assertWallet(attempt.plan.route.walletAddress)
      const submitted = await session(value => { assertWallet(attempt.plan.route.walletAddress); return recoverTrade(attempt.plan, attempt.signature, value) })
      if (submitted) {
        persist(submitted, attempt.plan.route.walletAddress)
        try { clearSignedTrade(localStorage, attempt.plan.route.walletAddress, attempt) } catch { /* Receipt deduplicates the saved attempt. */ }
      }
      if (version !== operation.current) return
      if (!submitted) { setPhase('uncertain'); setNotice(t.uncertain); return }
      setOrder(submitted); signedAttempt.current = null; setPlan(null); setIntent(null); setPhase('idle')
      setNotice(submitted.status === 'FILLED' ? t.filled : terminalOrder(submitted.status) ? t.failed : t.pending)
    } catch { if (version === operation.current) { setPhase('uncertain'); setNotice(t.uncertain) } }
    finally { if (version === operation.current) busyRef.current = false }
  }

  React.useEffect(() => {
    if (phase !== 'uncertain' || !address || busy || !signedAttempt.current) return
    const timer = window.setTimeout(() => { void recover() }, 10_000)
    return () => window.clearTimeout(timer)
  }, [phase, address, busy])

  const answer = async (prompt: string) => {
    if (busyRef.current) return
    setMessages(list => [...list, { id: list.length + 1, role: 'user', text: prompt }])
    const parsed = parseAgentIntent(prompt, language)
    if (parsed.kind === 'status') { if (order) await checkOrder(); else say(t.noOrder); return }
    if (parsed.kind === 'cancel') { if (pending) say(t.pending); else { setPlan(null); setIntent(null); setNotice(''); say(t.cancel) }; return }
    if (parsed.kind === 'help') { say(t[parsed.reason === 'asset' ? 'select' : parsed.reason]); return }
    if (parsed.kind === 'research') {
      busyRef.current = true; setPhase('loading'); setNotice('')
      const version = operation.current
      controller.current?.abort(); const abort = new AbortController(); controller.current = abort
      try {
        const report = await researchStockWithSkills(parsed.symbol, abort.signal)
        if (version === operation.current) setMessages(list => [...list, { id: list.length + 1, role: 'guide', text: `${skillsText[parsed.field]} · ${skillsText.noTrade}`, source: false, attachment: <WalletSkillReport report={report} language={language} /> }])
      } catch (error) { if (version === operation.current && !abort.signal.aborted) say(errorText(error)) }
      finally { if (version === operation.current) { busyRef.current = false; setPhase('idle') } }
      return
    }
    if (parsed.kind === 'record') {
      const asset = assetCatalog.find(item => item.symbol === parsed.symbol)!
      say(parsed.field === 'contract' ? `${asset.symbol}: ${asset.address}` : parsed.field === 'network' ? `${asset.symbol}: BNB Smart Chain / 56` : `${asset.symbol}: Ondo Global Markets`, true); return
    }
    if (!address) { say(authenticated ? t.errors.wallet_loading : t.signIn); return }
    if (parsed.kind === 'trade') { if (pending || plan) { say(t.busy); return }; say(t.preparing); await prepare(parsed); return }
    busyRef.current = true; setPhase('loading'); const version = operation.current
    try {
      const balances = await readWalletBalances(address, parsed.kind === 'holdings' ? assetCatalog : [])
      if (version !== operation.current) return
      const holdings = balances.tokens.filter(position => position.raw > 0n)
      say(parsed.kind === 'balance' ? formatText(t.balance, { usdt: displayQuantity(balances.usdt, 6, localeFor(language)), bnb: displayQuantity(balances.bnb, 8, localeFor(language)) }) : holdings.length ? holdings.map(position => `${position.symbol}: ${displayQuantity(position.quantity, 6, localeFor(language))}`).join('\n') : t.empty)
    } catch { if (version === operation.current) say(t.errors.balance_unavailable) }
    finally { if (version === operation.current) { setPhase('idle'); busyRef.current = false } }
  }
  const selected = plan ? assetCatalog.find(item => item.symbol === plan.route.symbol) : null
  const clearReview = () => { setPlan(null); setIntent(null); setNotice(''); say(t.cancel) }
  const tradeCard = <>
    {plan && selected && <section className="agent-trade-review" aria-label={t.review}>
      <div className="agent-review-heading"><img src={assetLogo(selected)} alt="" onError={tokenLogoError} /><div><span>{t.review}</span><strong>{plan.route.side === 'buy' ? (text(language, 'Buy', '买入')) : (text(language, 'Sell', '卖出'))} {selected.company}</strong><small>{selected.symbol} · Ondo</small></div></div>
      <dl><div><dt>{t.spend}</dt><dd>{amountForInput(plan.route.inputAmount, language)} {plan.route.inputSymbol}</dd></div><div><dt>{t.receive}</dt><dd>{displayQuantity(plan.route.outputAmount, 6, localeFor(language))} {plan.route.outputSymbol}</dd></div><div><dt>{t.minimum}</dt><dd>{displayQuantity(formatUnits(BigInt(plan.minimumReceive), plan.outputDecimals), 6, localeFor(language))} {plan.route.outputSymbol}</dd></div><div><dt>{plan.estimatedFeeAmount === undefined ? t.fee : t.feeEstimate}</dt><dd>{displayQuantity(formatUnits(BigInt(plan.estimatedFeeAmount ?? plan.feeAmount), plan.inputDecimals), 6, localeFor(language))} {plan.route.inputSymbol}</dd></div><div><dt>{t.network}</dt><dd>BNB Smart Chain · 56</dd></div><div><dt>{t.vendor}</dt><dd>Binance Web3 / CowSwap</dd></div><div><dt>{t.destination}</dt><dd title={plan.route.walletAddress}>{plan.route.walletAddress.slice(0, 7)}…{plan.route.walletAddress.slice(-5)}</dd></div><div><dt>{t.expires}</dt><dd>{new Date(plan.expiresAt).toLocaleTimeString(localeFor(language))}</dd></div>{plan.approval && <div><dt>{t.gas}</dt><dd>≈ {plan.approval.gasFeeBnb} BNB</dd></div>}</dl>
      {plan.approval && <p>{t.approvalNote}</p>}{expired && <p role="status">{t.expired}</p>}
      {plan.walletSkills && <WalletSkillReport report={plan.walletSkills} language={language} compact />}
      <div className="agent-review-actions"><button type="button" disabled={busy || pending} onClick={clearReview}>{t.cancelAction}</button><button type="button" disabled={busy || pending} className="agent-primary" onClick={() => expired && intent ? void prepare(intent) : void confirm()}>{busy ? <LoaderCircle size={16} className="agent-spinner" /> : null}{expired ? t.refresh : plan.approval ? (plan.approval.reset ? t.resetAllowance : t.approve) : t.confirm}</button></div>
    </section>}
    {notice && <p className="agent-notice" role="status">{busy ? <LoaderCircle size={16} className="agent-spinner" /> : order?.status === 'FILLED' ? <Check size={16} /> : null}{notice}</p>}
    {!plan && intent && !pending && <button type="button" className="agent-inline-action" disabled={busy} onClick={() => void prepare(intent)}>{t.refresh}</button>}
    {phase === 'uncertain' && <button type="button" className="agent-inline-action" disabled={busyRef.current} onClick={() => void recover()}>{t.recovery}</button>}
    {order && <div className="agent-order-status"><span>{order.orderId}</span><button type="button" disabled={busy} onClick={() => void checkOrder()}>{t.check}</button>{order.txHash && <a href={`https://bscscan.com/tx/${order.txHash}`} target="_blank" rel="noreferrer">{t.tx}<ExternalLink size={14} /></a>}</div>}
  </>
  return <section className="agent-workspace" aria-label={t.title}><AIChatCard title={t.title} subtitle={t.subtitle} greeting={t.greeting}
    prompt={skillsText.help} prompts={skillsText.examples} placeholder={t.prompt} sendLabel={t.send} resetLabel={t.reset} messages={messages}
    note={skillsText.note} sourceHref={manifest.sourceTokenList} sourceLabel={t.records} agentLabel="FIRSTBELL" headingLabel={'FIRSTBELL / ' + text(language, 'Agent', '助手').toUpperCase()} composerCaption={`BNB SMART CHAIN / ${assetCatalog.length} TOKENS`}
    icon={<img src="/assets/firstbell-mark.svg" alt="" />} busy={busy} resetDisabled={pending} afterMessages={messages.length || order || notice || plan ? tradeCard : undefined}
    status={<div className="agent-wallet-status"><Wallet size={14} />{address ? <span title={address}>{t.connected} · {address.slice(0, 6)}…{address.slice(-4)}</span> : authenticated ? <span>{t.walletLoading}</span> : <button type="button" onClick={login}>{t.login}</button>}</div>}
    onSend={prompt => void answer(prompt)} onReset={() => { if (busy || pending) return; operation.current += 1; controller.current?.abort(); setMessages([]); setPlan(null); setIntent(null); setNotice('') }} /></section>
}
