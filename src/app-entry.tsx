import { PrivyProvider } from '@privy-io/react-auth'
import { bsc } from 'viem/chains'
import FirstBellApp from './app'
import { PRIVY_APP_ID } from './privy-config'

export default function AppEntry() {
  const appId = PRIVY_APP_ID
  return <PrivyProvider appId={appId} config={{
    loginMethods: ['email', 'google'],
    defaultChain: bsc,
    supportedChains: [bsc],
    embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
    appearance: { theme: 'light', accentColor: '#080808' },
  }}><FirstBellApp /></PrivyProvider>
}
