import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'FlameBase — On-chain social on Base',
  description: 'Every like, comment, and tip is a real transaction on Base. Web3 social media.',
  openGraph: {
    title: 'FlameBase',
    description: 'On-chain social on Base.',
    type: 'website',
    images: ['/logo.png'],
  },
  twitter: {
    card: 'summary',
    title: 'FlameBase',
    description: 'On-chain social on Base.',
    images: ['/logo.png'],
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
