import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json({
    miniapp: {
      version: '1',
      name: 'FlameBase',
      iconUrl: 'https://flamebase.xyz/icon.png',
      homeUrl: 'https://flamebase.xyz',
      imageUrl: 'https://flamebase.xyz/logo.png',
      buttonTitle: 'Open FlameBase',
      splashImageUrl: 'https://flamebase.xyz/logo.png',
      splashBackgroundColor: '#0052FF',
      subtitle: 'On-chain social on Base',
      description:
        'Every like, comment, and tip is a real on-chain transaction on Base. Own your posts, own your followers, own your tips.',
      primaryCategory: 'social',
      tags: ['social', 'web3', 'base', 'onchain', 'crypto'],
      tagline: 'Own your social graph',
      ogTitle: 'FlameBase — On-chain social on Base',
      ogDescription: 'Every like, tip, and comment lives on Base.',
      ogImageUrl: 'https://flamebase.xyz/logo.png',
    },
  })
}
