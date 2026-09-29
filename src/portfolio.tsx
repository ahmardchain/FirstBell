import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ArrowUpRight, Bookmark, Check, Copy, Eye, EyeOff, ExternalLink, RefreshCw, Search, Wallet, X } from 'lucide-react'
import './portfolio.css'

type Language = 'en' | 'zh'
type Asset = { symbol: string; company: string; mark: string; address: string; name: string; chainId: number; source: string; file: string }
type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, listener: (...args: any[]) => void) => void
  removeListener?: (event: string, listener: (...args: any[]) => void) => void
}
type Holding = { asset: Asset; amount: string; status: 'ready' | 'error' }
const BSC_CHAIN_ID = '0x38'
const walletProvider = () => (window as Window & { ethereum?: Provider }).ethereum
const trimAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`
const isAddress = (address: string) => /^0x[0-9a-fA-F]{40}$/.test(address)

function formatUnits(value: bigint, decimals: number, precision = 4) {
  if (decimals < 0 || decimals > 36) throw new Error('Invalid token decimals')
  const base = 10n ** BigInt(decimals)
  const whole = value / base
  const fraction = (value % base).toString().padStart(decimals, '0').slice(0, precision).replace(/0+$/, '')
  return `${whole}${fraction ? `.${fraction}` : ''}`
}

async function readHolding(provider: Provider, account: string, asset: Asset): Promise<Holding> {
  try {
    const data = `0x70a08231${account.slice(2).toLowerCase().padStart(64, '0')}`
    const raw = await provider.request({ method: 'eth_call', params: [{ to: asset.address, data }, 'latest'] })
    if (typeof raw !== 'string' || !/^0x[0-9a-fA-F]+$/.test(raw)) throw new Error('Balance unavailable')
    const balance = BigInt(raw)
    if (balance === 0n) return { asset, amount: '0', status: 'ready' }
    const decimalsHex = await provider.request({ method: 'eth_call', params: [{ to: asset.address, data: '0x313ce567' }, 'latest'] })
    if (typeof decimalsHex !== 'string' || !/^0x[0-9a-fA-F]+$/.test(decimalsHex)) throw new Error('Decimals unavailable')
    const decimals = Number(BigInt(decimalsHex))
    const amount = formatUnits(balance, decimals, 6)
    return { asset, amount: amount === '0' ? '<0.000001' : amount, status: 'ready' }
  } catch {
    return { asset, amount: '—', status: 'error' }
  }
}

const copy = {
  en: {
    title: 'Portfolio', intro: 'Assets you save stay on this device.', watchlist: 'YOUR WATCHLIST',
    start: 'Start building your portfolio', disconnected: 'Connect a BNB Chain wallet to see the tokens you hold.',
    connect: 'Connect wallet', connecting: 'Connecting…', noProvider: 'Open FirstBell inside a wallet browser to connect a BNB Chain wallet.',
    explore: 'Explore stocks', saved: 'Saved assets', noSaved: 'Nothing saved yet', saveHint: 'Save a stock from Home to keep its issuer and contract close.',
    wallet: 'Connected wallet', disconnect: 'Disconnect', bnbBalance: 'BNB balance', positionsValue: 'Tokenized equity value',
    valueUnavailable: 'USD value unavailable without verified prices', positions: 'Positions', activity: 'Activity',
    search: 'Search positions', noPositions: 'No positions yet', noPositionsHint: 'Supported token balances will appear here when held in this wallet.',
    deposit: 'Deposit', withdraw: 'Withdraw', withdrawUnavailable: 'Transfers are not connected in FirstBell.',
    receive: 'Receive on BNB Smart Chain', receiveHint: 'Only send supported assets on BNB Smart Chain to this address. Confirm the asset and network in your wallet first.',
    copy: 'Copy address', copied: 'Copied', close: 'Close', refresh: 'Refresh balances', switchNetwork: 'Switch to BNB Smart Chain',
    wrongNetwork: 'Connect on BNB Smart Chain to read balances.', balanceError: 'Some balances could not be read. Refresh to try again.',
    activityHint: 'FirstBell does not index wallet activity yet. Inspect this address on BscScan.', viewActivity: 'View on BscScan',
    hide: 'Hide balance', show: 'Show balance', loading: 'Reading wallet balances…',
    readUnavailable: 'Balances are unavailable right now. Refresh to try again.', copyFailed: 'Could not copy. Select the address above to copy it manually.',
  },
  zh: {
    title: '资产', intro: '收藏的资产保存在此设备上。', watchlist: '关注列表',
    start: '开始建立你的资产组合', disconnected: '连接 BNB 智能链钱包，查看你持有的代币。',
    connect: '连接钱包', connecting: '连接中…', noProvider: '请在支持 BNB 智能链的钱包浏览器中打开 FirstBell。',
    explore: '探索股票', saved: '已收藏资产', noSaved: '还没有收藏', saveHint: '在首页收藏一只股票，方便随时查看发行方和合约。',
    wallet: '已连接钱包', disconnect: '断开连接', bnbBalance: 'BNB 余额', positionsValue: '代币化股票价值',
    valueUnavailable: '没有经过核实的价格，无法显示美元价值', positions: '持仓', activity: '活动',
    search: '搜索持仓', noPositions: '暂无持仓', noPositionsHint: '此钱包持有的受支持代币会显示在这里。',
    deposit: '充值', withdraw: '提现', withdrawUnavailable: 'FirstBell 尚未接入转账功能。',
    receive: '在 BNB 智能链收款', receiveHint: '仅向此地址发送 BNB 智能链上受支持的资产。请先在钱包中确认资产和网络。',
    copy: '复制地址', copied: '已复制', close: '关闭', refresh: '刷新余额', switchNetwork: '切换至 BNB 智能链',
    wrongNetwork: '请切换至 BNB 智能链以读取余额。', balanceError: '部分余额无法读取，请刷新后重试。',
    activityHint: 'FirstBell 尚未索引钱包活动。可以在 BscScan 查看此地址。', viewActivity: '在 BscScan 查看',
    hide: '隐藏余额', show: '显示余额', loading: '正在读取钱包余额…',
    readUnavailable: '暂时无法读取余额。请刷新重试。', copyFailed: '复制失败。请手动选择上面的地址进行复制。',
  },
}

export function PortfolioWorkspace({ assets, saved, language, onExplore, onInspect, onToggleSaved }: {
  assets: Asset[]
  saved: string[]
  language: Language
  onExplore: () => void
  onInspect: (asset: Asset) => void
  onToggleSaved: (symbol: string) => void
}) {
  const t = copy[language]
  const [account, setAccount] = React.useState<string | null>(null)
  const [chainId, setChainId] = React.useState<string | null>(null)
  const [checking, setChecking] = React.useState(true)
  const [connecting, setConnecting] = React.useState(false)
  const [walletError, setWalletError] = React.useState('')
  const [balance, setBalance] = React.useState<string | null>(null)
  const [holdings, setHoldings] = React.useState<Holding[]>([])
  const [reading, setReading] = React.useState(false)
  const [refreshKey, setRefreshKey] = React.useState(0)
  const [section, setSection] = React.useState<'positions' | 'saved' | 'activity'>('positions')
  const [search, setSearch] = React.useState('')
  const [hidden, setHidden] = React.useState(false)
  const [receiveOpen, setReceiveOpen] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const dialogRef = React.useRef<HTMLDivElement>(null)
  const savedAssets = assets.filter(asset => saved.includes(asset.symbol))
  const positions = holdings.filter(item => item.status === 'ready' && item.amount !== '0')
  const displayed = (section === 'saved' ? savedAssets : positions.map(item => item.asset))
    .filter(asset => `${asset.company} ${asset.symbol}`.toLowerCase().includes(search.toLowerCase()))
  const balanceUnavailable = !reading && chainId === BSC_CHAIN_ID && (holdings.length === 0 && balance === null || holdings.length > 0 && holdings.every(item => item.status === 'error'))

  React.useEffect(() => {
    if (!receiveOpen) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    dialog?.querySelector<HTMLButtonElement>('button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setReceiveOpen(false)
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled)'))
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus() }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; previousFocus?.focus() }
  }, [receiveOpen])

  React.useEffect(() => {
    const provider = walletProvider()
    if (!provider) { setChecking(false); return }
    let active = true
    const updateAccounts = (accounts: unknown) => {
      if (!active || localStorage.getItem('firstbell-wallet-disconnected') === 'true') return
      const next = Array.isArray(accounts) && typeof accounts[0] === 'string' && isAddress(accounts[0]) ? accounts[0] : null
      setAccount(next)
    }
    const updateChain = (next: unknown) => { if (active && typeof next === 'string') setChainId(next.toLowerCase()) }
    Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })])
      .then(([accounts, chain]) => { updateAccounts(accounts); updateChain(chain) })
      .catch(() => { if (active) setWalletError(t.balanceError) })
      .finally(() => { if (active) setChecking(false) })
    provider.on?.('accountsChanged', updateAccounts)
    provider.on?.('chainChanged', updateChain)
    return () => { active = false; provider.removeListener?.('accountsChanged', updateAccounts); provider.removeListener?.('chainChanged', updateChain) }
  }, [language, t.balanceError])

  React.useEffect(() => {
    const provider = walletProvider()
    if (!account || chainId !== BSC_CHAIN_ID || !provider) { setBalance(null); setHoldings([]); setReading(false); return }
    let active = true
    setReading(true)
    setWalletError('')
    Promise.all([
      provider.request({ method: 'eth_getBalance', params: [account, 'latest'] }),
      Promise.all(assets.map(asset => readHolding(provider, account, asset))),
    ]).then(([raw, nextHoldings]) => {
      if (!active) return
      setBalance(typeof raw === 'string' && /^0x[0-9a-fA-F]+$/.test(raw) ? formatUnits(BigInt(raw), 18, 5) : null)
      setHoldings(nextHoldings)
      if (nextHoldings.some(item => item.status === 'error')) setWalletError(t.balanceError)
    }).catch(() => { if (active) { setBalance(null); setHoldings([]); setWalletError(t.balanceError) } })
      .finally(() => { if (active) setReading(false) })
    return () => { active = false }
  }, [account, chainId, refreshKey, assets, t.balanceError])

  const connect = async () => {
    const provider = walletProvider()
    if (!provider) { setWalletError(t.noProvider); return }
    setConnecting(true)
    setWalletError('')
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' })
      if (!Array.isArray(accounts) || typeof accounts[0] !== 'string' || !isAddress(accounts[0])) throw new Error('No account')
      localStorage.removeItem('firstbell-wallet-disconnected')
      setAccount(accounts[0])
      const next = await provider.request({ method: 'eth_chainId' })
      setChainId(typeof next === 'string' ? next.toLowerCase() : null)
    } catch (error) { setWalletError(error instanceof Error && error.message !== 'No account' ? error.message : t.noProvider) }
    finally { setConnecting(false) }
  }
  const switchNetwork = async () => {
    const provider = walletProvider()
    if (!provider) return
    try {
      await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BSC_CHAIN_ID }] })
      setChainId(BSC_CHAIN_ID)
    } catch { setWalletError(t.wrongNetwork) }
  }
  const disconnect = () => {
    localStorage.setItem('firstbell-wallet-disconnected', 'true')
    setAccount(null); setBalance(null); setHoldings([]); setWalletError(''); setReceiveOpen(false)
  }
  const copyAddress = async () => {
    if (!account) return
    try { await navigator.clipboard.writeText(account); setCopied(true); window.setTimeout(() => setCopied(false), 1800) }
    catch { setWalletError(t.copyFailed) }
  }
  const row = (asset: Asset, holding?: Holding, savedRow = false) => <div className="portfolio-asset-row" key={asset.symbol}>
    <button type="button" className="portfolio-asset-open" onClick={() => onInspect(asset)}>
      <span className="portfolio-mark"><img className={`brand-mark brand-mark--${asset.mark}`} src={`/assets/marks/${asset.mark}.svg`} alt="" /></span>
      <span className="portfolio-asset-names"><strong>{asset.symbol}</strong><small>{asset.company}</small></span>
      <span className="portfolio-asset-end">{holding ? <strong>{holding.amount}</strong> : <ArrowUpRight size={18} />}</span>
    </button>
    {savedRow && <button type="button" className="portfolio-unsave" onClick={() => onToggleSaved(asset.symbol)} aria-label={`${t.saved}: ${asset.symbol}`}><Bookmark size={17} fill="currentColor" /></button>}
  </div>

  return <section className="portfolio-workspace" aria-labelledby="portfolio-title">
    {checking ? <div className="portfolio-content-empty" role="status"><h1 id="portfolio-title">{t.title}</h1><p>{t.loading}</p></div> : !account ? <>
      <div className="portfolio-page-head"><span className="app-label">FIRSTBELL / PORTFOLIO</span><h1 id="portfolio-title">{t.title}</h1><p>{t.intro}</p></div>
      <motion.div className="portfolio-guest-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .3 }}>
        <div className="portfolio-orbit" aria-hidden="true"><div className="portfolio-orbit-ring" />{['apple', 'nvidia', 'tesla'].map(mark => <span className={`portfolio-orbit-mark portfolio-orbit-mark--${mark}`} key={mark}><img className={`brand-mark brand-mark--${mark}`} src={`/assets/marks/${mark}.svg`} alt="" /></span>)}</div>
        <span className="app-label">{t.watchlist}</span><h2>{t.start}</h2><p>{t.disconnected}</p>
        <button type="button" className="portfolio-primary" disabled={connecting} onClick={connect}><span>{connecting ? t.connecting : t.connect}</span><ArrowRight size={19} /></button>
        <button type="button" className="portfolio-text-action" onClick={onExplore}>{t.explore}<ArrowUpRight size={16} /></button>
      </motion.div>
      {walletError && <p className="portfolio-feedback" role="alert">{walletError}</p>}
      <div className="portfolio-saved-head"><span className="app-label">{t.saved.toUpperCase()} / {String(savedAssets.length).padStart(2, '0')}</span></div>
      {savedAssets.length ? <div className="portfolio-rows">{savedAssets.map(asset => row(asset, undefined, true))}</div> : <div className="portfolio-saved-empty"><Bookmark size={19} /><span>{t.noSaved}. {t.saveHint}</span></div>}
    </> : <>
      <div className="portfolio-account-head"><span className="portfolio-avatar"><Wallet size={22} /></span><div><span className="app-label">{t.wallet}</span><h1 id="portfolio-title">{trimAddress(account)}</h1></div><button type="button" className="portfolio-disconnect" onClick={disconnect}>{t.disconnect}</button></div>
      <div className="portfolio-balance"><div className="portfolio-balance-label"><span>{t.bnbBalance}</span><button type="button" aria-label={hidden ? t.show : t.hide} onClick={() => setHidden(value => !value)}>{hidden ? <EyeOff size={20} /> : <Eye size={20} />}</button></div><div className="portfolio-balance-value">{hidden ? '••••••' : chainId === BSC_CHAIN_ID ? balance === null ? '—' : `${balance} BNB` : '—'}</div><p>{t.positionsValue} <strong>—</strong><small>{t.valueUnavailable}</small></p></div>
      {chainId !== BSC_CHAIN_ID && <div className="portfolio-network-note"><span>{t.wrongNetwork}</span><button type="button" onClick={switchNetwork}>{t.switchNetwork}</button></div>}
      {walletError && <p className="portfolio-feedback" role="alert">{walletError}</p>}
      <div className="portfolio-action-row"><button type="button" onClick={() => setReceiveOpen(true)}>{t.deposit}</button><button type="button" disabled title={t.withdrawUnavailable}>{t.withdraw}</button></div>
      <p className="portfolio-action-note">{t.withdrawUnavailable}</p>
      <div className="portfolio-content-head"><div className="portfolio-tabs" role="tablist" aria-label={t.title}>{(['positions', 'saved', 'activity'] as const).map(id => <button type="button" role="tab" key={id} aria-selected={section === id} className={section === id ? 'active' : ''} onClick={() => { setSection(id); setSearch('') }}>{t[id]}</button>)}</div><button type="button" className="portfolio-refresh" onClick={() => setRefreshKey(value => value + 1)} aria-label={t.refresh} disabled={reading}><RefreshCw size={18} /></button></div>
      {section !== 'activity' && <label className="portfolio-search"><Search size={19} /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder={section === 'positions' ? t.search : t.saved} /></label>}
      {section === 'activity' ? <div className="portfolio-content-empty"><p>{t.activityHint}</p><a href={`https://bscscan.com/address/${account}`} target="_blank" rel="noreferrer">{t.viewActivity}<ExternalLink size={16} /></a></div>
        : section === 'positions' && reading ? <div className="portfolio-content-empty" role="status">{t.loading}</div>
        : section === 'positions' && chainId !== BSC_CHAIN_ID ? <div className="portfolio-content-empty"><p>{t.wrongNetwork}</p><button type="button" onClick={switchNetwork}>{t.switchNetwork}</button></div>
        : section === 'positions' && balanceUnavailable ? <div className="portfolio-content-empty" role="status"><p>{t.readUnavailable}</p><button type="button" onClick={() => setRefreshKey(value => value + 1)}>{t.refresh}<RefreshCw size={16} /></button></div>
        : displayed.length ? <div className="portfolio-rows">{displayed.map(asset => row(asset, section === 'positions' ? positions.find(item => item.asset.symbol === asset.symbol) : undefined, section === 'saved'))}</div>
        : <div className="portfolio-content-empty"><Bookmark size={24} strokeWidth={1.5} /><h2>{section === 'positions' ? t.noPositions : t.noSaved}</h2><p>{section === 'positions' ? t.noPositionsHint : t.saveHint}</p>{section === 'saved' && <button type="button" onClick={onExplore}>{t.explore}<ArrowUpRight size={16} /></button>}</div>}
      <p className="portfolio-scope">BNB SMART CHAIN / {assets.length} SUPPORTED ASSETS</p>
    </>}
    <AnimatePresence>{receiveOpen && account && <div className="portfolio-dialog-layer"><motion.button type="button" className="portfolio-dialog-backdrop" onClick={() => setReceiveOpen(false)} aria-label={t.close} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} /><motion.div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t.receive} className="portfolio-receive" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}><div><span className="app-label">BNB SMART CHAIN</span><button type="button" onClick={() => setReceiveOpen(false)} aria-label={t.close}><X size={20} /></button></div><h2>{t.receive}</h2><p>{t.receiveHint}</p><code>{account}</code><button type="button" className="portfolio-primary" onClick={copyAddress}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? t.copied : t.copy}</button></motion.div></div>}</AnimatePresence>
  </section>
}
