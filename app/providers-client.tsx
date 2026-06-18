'use client'

import dynamic from 'next/dynamic'

// The wagmi config and wallet connectors (WalletConnect, Coinbase) touch
// browser-only APIs like `indexedDB` the moment they're constructed, which
// throws during server prerendering. Loading the whole provider tree with
// `ssr: false` keeps it client-only. SEO-critical metadata lives in the
// server-rendered layout, so nothing important is lost from the HTML.
const Providers = dynamic(() => import('./providers').then(m => m.Providers), {
  ssr: false,
  loading: () => (
    <div
      className="flex min-h-screen items-center justify-center bg-[#0052FF]"
      aria-label="Loading FlameBase"
    >
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/30 border-t-white" />
    </div>
  ),
})

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>
}
