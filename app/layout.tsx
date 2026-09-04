import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ClientProviders } from './providers-client'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

// Base App / Farcaster Mini App embed. Without this in the page <head>, a
// client like Base App opens the URL as a plain website instead of launching
// it as a Mini App (in-app frame + splash). `fc:miniapp` is the current spec
// key; `fc:frame` is kept for backwards compatibility with older clients.
const miniappEmbed = {
  version: '1',
  // 3:2 embed image — a portrait/square image here makes Base App reject the
  // launchable Mini App card and open the URL as a plain website instead.
  imageUrl: 'https://flamebase.xyz/embed-card.png',
  button: {
    title: 'Open FlameBase',
    action: {
      type: 'launch_miniapp',
      name: 'FlameBase',
      url: 'https://flamebase.xyz',
      splashImageUrl: 'https://flamebase.xyz/splash-200.png',
      splashBackgroundColor: '#0052FF',
    },
  },
}

const frameEmbed = {
  ...miniappEmbed,
  button: {
    ...miniappEmbed.button,
    action: { ...miniappEmbed.button.action, type: 'launch_frame' },
  },
}

export const metadata: Metadata = {
  metadataBase: new URL('https://flamebase.xyz'),
  title: {
    default: 'FlameBase — Trading, payments & AI agents on Base',
    template: '%s · FlameBase',
  },
  description:
    'Every trade, tip, and AI agent action is a real on-chain transaction on Base. Own your posts, own your trades, own your agents.',
  keywords: [
    'Base', 'on-chain trading', 'AI agents', 'Web3 payments', 'crypto social',
    'Base chain', 'XMTP', 'decentralized social', 'social finance', 'tip jar',
    'on-chain likes', 'wallet social', 'FlameBase',
  ],
  authors: [{ name: 'FlameBase' }],
  creator: 'FlameBase',
  publisher: 'FlameBase',
  applicationName: 'FlameBase',
  category: 'social',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://flamebase.xyz',
    siteName: 'FlameBase',
    title: 'FlameBase — Trading, payments & AI agents on Base',
    description:
      'Every trade, tip, and AI agent action is a real transaction on Base. Own your posts, own your trades, own your agents.',
    images: [
      {
        url: '/thumbnail-base.png',
        width: 1200,
        height: 628,
        alt: 'FlameBase — trading, payments & AI agents on Base',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@PrimeAirdropTR',
    creator: '@PrimeAirdropTR',
    title: 'FlameBase — Trading, payments & AI agents on Base',
    description:
      'Every trade, tip, and AI agent action is a real transaction on Base. Own your posts, own your trades, own your agents.',
    images: ['/thumbnail-base.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
  manifest: '/manifest.json',
  other: {
    'base:app_id': '6a0e223b6e6e49b3da234251',
    'talentapp:project_verification': '87d0e4708a710492b8242db188d91ceacc7c85596e146ce0ad229ed4e5b5bece83ed4290fb8e1d9c578b0cb0d747ce1ec91b6f529ff30817464bbed43ff656c6',
    'fc:miniapp': JSON.stringify(miniappEmbed),
    'fc:frame': JSON.stringify(frameEmbed),
  },
}

export const viewport: Viewport = {
  themeColor: '#0052FF',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'FlameBase',
  url: 'https://flamebase.xyz',
  description: 'Trading, payments, and AI agents on Base. Every trade, tip, and agent action is a real on-chain transaction.',
  applicationCategory: 'SocialNetworkingApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  publisher: { '@type': 'Organization', name: 'FlameBase', url: 'https://flamebase.xyz', logo: 'https://flamebase.xyz/icon.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased bg-white text-[#0A0B0D]`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <ClientProviders>{children}</ClientProviders>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
