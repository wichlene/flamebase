import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams
  const postId = params.get('postId') ?? '0'
  const author = params.get('author') ?? ''
  const content = params.get('content') ?? ''
  const image = params.get('image') || 'https://flamebase.xyz/logo.png'

  return NextResponse.json(
    {
      name: `FlameBase Post #${postId}`,
      description: content || 'A post from FlameBase — the first on-chain social network on Base.',
      image,
      external_url: 'https://flamebase.xyz',
      attributes: [
        { trait_type: 'Type', value: 'Post' },
        { trait_type: 'Author', value: author },
        { trait_type: 'Post ID', value: postId },
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
