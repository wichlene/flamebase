import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  metadataBase: new URL('https://flamebase.xyz'),
  title: {
    default: 'FlameBase — On-chain social on Base',
    template: '%s · FlameBase',
  },
  description:
    'Every like, comment, and tip is a real on-chain transaction on Base. The first truly on-chain social network — own your posts, own your followers, own your tips.',
  keywords: [
    'Base', 'on-chain social', 'Web3 social', 'Farcaster', 'crypto social',
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
    title: 'FlameBase — On-chain social on Base',
    description:
      'Every like, comment, and tip is a real transaction on Base. Own your social graph.',
    images: [
      {
        url: '/logo.png',
        width: 1200,
        height: 630,
        alt: 'FlameBase — on-chain social on Base',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    site: '@PrimeAirdropTR',
    creator: '@PrimeAirdropTR',
    title: 'FlameBase — On-chain social on Base',
    description:
      'Every like, comment, and tip is a real transaction on Base. Own your social graph.',
    images: ['/logo.png'],
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
  other: {
    'base:app_id': '6a0e223b6e6e49b3da234251',
  },
}

export const viewport: Viewport = {
  themeColor: '#0052FF',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans antialiased bg-white text-[#0A0B0D]`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
