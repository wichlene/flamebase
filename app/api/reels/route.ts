import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  if (!process.env.PIXABAY_API_KEY) {
    return NextResponse.json({ error: 'PIXABAY_API_KEY not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') || ''
  const page = searchParams.get('page') || '1'
  const q = searchParams.get('q') || ''

  const params = new URLSearchParams({
    key: process.env.PIXABAY_API_KEY,
    per_page: '20',
    order: 'popular',
    page,
    ...(category && { category }),
    ...(q && { q }),
  })

  try {
    const res = await fetch(`https://pixabay.com/api/videos/?${params}`)
    const data = await res.json()
    if (!res.ok) return NextResponse.json({ error: data }, { status: 500 })
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
