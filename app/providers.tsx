'use client'

import { useEffect } from 'react'
import { sdk } from '@farcaster/miniapp-sdk'
import {
  RainbowKitProvider,
  connectorsForWallets,
  lightTheme,
} from '@rainbow-me/rainbowkit'
import {
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  rainbowWallet,
  phantomWallet,
  trustWallet,
  injectedWallet,
} from '@rainbow-me/rainbowkit/wallets'
import { WagmiProvider, createConfig, useConnect, useAccount } from 'wagmi'
import { base } from 'wagmi/chains'
import { http, fallback } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@rainbow-me/rainbowkit/styles.css'
import { Attribution } from 'ox/erc8021'
import { farcasterConnector } from '../lib/farcasterConnector'

export const BUILDER_CODE_DATA_SUFFIX = Attribution.toDataSuffix({
  codes: ['bc_m8fvx957'],
})

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Popüler',
      wallets: [coinbaseWallet, metaMaskWallet, phantomWallet, walletConnectWallet, rainbowWallet],
    },
    {
      groupName: 'Diğer',
      wallets: [trustWallet, injectedWallet],
    },
  ],
  {
    appName: 'FlameBase',
    appDescription: 'Onchain social on Base — posts, likes and follows live forever on the blockchain.',
    appUrl: 'https://flamebase.xyz',
    appIcon: 'https://flamebase.xyz/icon.png',
    projectId: '876379a64c6da858bdc8230dda19a8db',
  }
)

const config = createConfig({
  chains: [base],
  connectors: [...connectors, farcasterConnector()],
  transports: {
    [base.id]: fallback([
      http('https://mainnet.base.org'),
      http('https://base.drpc.org'),
      http('https://base-rpc.publicnode.com'),
      http('https://base.llamarpc.com'),
    ]),
  },
  ssr: true,
})

const queryClient = new QueryClient()

function FarcasterAutoConnect() {
  const { connect, connectors: wagmiConnectors } = useConnect()
  const { isConnected } = useAccount()

  useEffect(() => {
    if (isConnected) return

    // The host (Farcaster / Base App) may inject the wallet provider a moment
    // after the page loads — retry a few times before giving up.
    let attempts = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    async function tryAutoConnect() {
      if (cancelled) return
      try {
        const inFrame = await sdk.isInMiniApp()
        if (!inFrame) return

        const provider = await sdk.wallet.getEthereumProvider()
        if (!provider) throw new Error('provider not ready')

        const fc = wagmiConnectors.find(c => c.id === 'farcaster')
        if (fc) connect({ connector: fc, chainId: base.id })
      } catch {
        if (++attempts < 5) timer = setTimeout(tryAutoConnect, 1000)
      }
    }

    tryAutoConnect()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [isConnected, connect, wagmiConnectors])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let cancelled = false
    sdk.actions.ready().catch(() => {})

    // PWA: register service worker so the app is installable from Chrome.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    // Read Farcaster safe-area insets and expose them as CSS vars so the
    // app can dodge the host's chrome (notch, status bar, gesture area).
    sdk.context
      .then(ctx => {
        if (cancelled) return
        const insets = ctx?.client?.safeAreaInsets
        if (!insets) return
        const root = document.documentElement
        root.style.setProperty('--fc-inset-top', `${insets.top}px`)
        root.style.setProperty('--fc-inset-bottom', `${insets.bottom}px`)
        root.style.setProperty('--fc-inset-left', `${insets.left}px`)
        root.style.setProperty('--fc-inset-right', `${insets.right}px`)
        root.dataset.fcMiniapp = 'true'
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={lightTheme({
            accentColor: '#0052FF',
            accentColorForeground: 'white',
            borderRadius: 'large',
            fontStack: 'system',
            overlayBlur: 'small',
          })}
        >
          <FarcasterAutoConnect />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
