import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

// Mini App metadata. `noindex` is intentionally omitted (defaults to false) so
// Base App / Farcaster index this app into their searchable app catalog.
const miniapp = {
  version: '1',
  name: 'FlameBase',
  iconUrl: 'https://flamebase.xyz/icon.png',
  homeUrl: 'https://flamebase.xyz',
  // Embed card image MUST be 3:2 — a portrait/square image makes Base App
  // reject the launchable card and fall back to opening the URL as a website.
  imageUrl: 'https://flamebase.xyz/embed-card.png',
  buttonTitle: 'Open FlameBase',
  splashImageUrl: 'https://flamebase.xyz/splash-200.png',
  splashBackgroundColor: '#0052FF',
  subtitle: 'On-chain social on Base',
  description:
    'Every like, comment, and tip is a real on-chain transaction on Base. Own your posts, own your followers, own your tips.',
  primaryCategory: 'social',
  tags: ['social', 'web3', 'base', 'onchain', 'crypto'],
  tagline: 'Own your social graph',
  ogTitle: 'FlameBase — Social on Base',
  ogDescription: 'Every like, tip, and comment lives on Base.',
  ogImageUrl: 'https://flamebase.xyz/logo.png',
  heroImageUrl: 'https://flamebase.xyz/thumbnail-base.png',
  // Base mainnet (CAIP-2). Tells Base App's catalog this is a Base-native app.
  requiredChains: ['eip155:8453'],
  noindex: false,
}

export function GET() {
  return NextResponse.json({
    accountAssociation: {
      header:
        'eyJmaWQiOjEzNTM3MDYsInR5cGUiOiJjdXN0b2R5Iiwia2V5IjoiMHg3RTJCRUUyYjZFMzdFQUI5QjM1YjA3RjgzZTVjQzJDNDQ1QjlDNjA0In0',
      payload: 'eyJkb21haW4iOiJmbGFtZWJhc2UueHl6In0',
      signature:
        'lpzx0l3BVyl8Dh2BwU19i8GfG1AEGpUInrqAyjKbsFRGpfhVIhVjBExxEZbZNHEjjEO1au9dS5Rr0hbUeItV9Bw=',
    },
    // `miniapp` is the current spec key; `frame` is the legacy key some
    // indexers (including older Base/Warpcast crawlers) still read. Publish
    // both, identical, so the app is discoverable regardless of which one a
    // given indexer looks for.
    miniapp,
    frame: miniapp,
  })
}
