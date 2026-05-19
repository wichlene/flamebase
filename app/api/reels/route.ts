import { NextResponse } from 'next/server'

// Rotating mix of entertaining search terms
const MIX_QUERIES = [
  'funny', 'cute animals', 'amazing', 'viral', 'comedy', 'cute cat',
  'cute dog', 'incredible', 'wow', 'satisfying', 'baby animals',
  'funny animals', 'street performance', 'magic trick', 'extreme sports',
]

export async function GET(request: Request) {
  if (!process.env.PIXABAY_API_KEY) {
    return NextResponse.json({ error: 'PIXABAY_API_KEY not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const q = searchParams.get('q') || ''
  const lang = searchParams.get('lang') || 'en'
  const mix = searchParams.get('mix') === '1'

  // In mix mode: rotate through entertaining queries based on page
  const query = mix
    ? MIX_QUERIES[(page - 1) % MIX_QUERIES.length]
    : q

  const params = new URLSearchParams({
    key: process.env.PIXABAY_API_KEY,
    per_page: '20',
    order: 'popular',
    page: String(page),
    lang,
    ...(category && { category }),
    ...(query && { q: query }),
  })

  try {
    const res = await fetch(`https://pixabay.com/api/videos/?${params}`)
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data }, { status: 500 })
    // Shuffle results for variety
    if (data.hits) data.hits = data.hits.sort(() => Math.random() - 0.5)
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
