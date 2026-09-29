import { PrivyProvider } from '@privy-io/react-auth'
import { bsc } from 'viem/chains'
import FirstBellApp from './app'

export default function AppEntry() {
  const appId = import.meta.env.VITE_PRIVY_APP_ID?.trim()
  if (!appId) return <FirstBellApp />
  return <PrivyProvider appId={appId} config={{
    loginMethods: ['email', 'google'],
    defaultChain: bsc,
    supportedChains: [bsc],
    embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
    appearance: { theme: 'light', accentColor: '#080808' },
  }}><FirstBellApp /></PrivyProvider>
}
