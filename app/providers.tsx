'use client'

import { RainbowKitProvider, getDefaultConfig, darkTheme } from '@rainbow-me/rainbowkit'
import {
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  rainbowWallet,
  phantomWallet,
  trustWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { WagmiProvider } from 'wagmi'
import { base } from 'wagmi/chains'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@rainbow-me/rainbowkit/styles.css'

const config = getDefaultConfig({
  appName: 'FlameBase',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'placeholder',
  chains: [base],
  ssr: true,
  wallets: [
    {
      groupName: 'Popüler',
      wallets: [coinbaseWallet, metaMaskWallet, phantomWallet, walletConnectWallet, rainbowWallet],
    },
    {
      groupName: 'Diğer',
      wallets: [trustWallet, injectedWallet],
    },
  ],
})

const queryClient = new QueryClient()

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#0052FF',
            accentColorForeground: 'white',
            borderRadius: 'large',
            fontStack: 'system',
            overlayBlur: 'small',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
