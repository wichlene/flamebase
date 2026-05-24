import { NextResponse } from 'next/server'

export async function GET() {
  const imageHash = process.env.FLAME_NFT_IMAGE_HASH
  const image = imageHash
    ? `ipfs://${imageHash}`
    : 'https://flamebase.xyz/logo.png'

  return NextResponse.json(
    {
      name: 'FlameBase Logo',
      description:
        'Official FlameBase NFT — the first on-chain social network on Base. Holders are recognized as early supporters of the FlameBase community.',
      image,
      external_url: 'https://flamebase.xyz',
      attributes: [
        { trait_type: 'Type', value: 'Official Logo' },
        { trait_type: 'Network', value: 'Base' },
        { trait_type: 'Project', value: 'FlameBase' },
      ],
    },
    {
      headers: {
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    }
  )
}
