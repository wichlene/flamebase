import { NextResponse } from 'next/server'

const REGION_MAP: Record<string, string> = {
  tr: 'TR', en: 'US', ru: 'RU', es: 'ES', pt: 'BR',
  de: 'DE', fr: 'FR', it: 'IT', ja: 'JP', ko: 'KR',
  ar: 'SA', hi: 'IN', zh: 'TW', nl: 'NL', pl: 'PL',
}

export async function GET(request: Request) {
  if (!process.env.YOUTUBE_API_KEY) {
    return NextResponse.json({ error: 'YOUTUBE_API_KEY not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const lang = searchParams.get('lang') || 'en'
  const region = searchParams.get('region') || REGION_MAP[lang] || 'US'
  const pageToken = searchParams.get('pageToken') || ''
  const q = searchParams.get('q') || ''

  try {
    let url: string
    if (q) {
      // Search mode
      const params = new URLSearchParams({
        key: process.env.YOUTUBE_API_KEY,
        part: 'snippet',
        type: 'video',
        q,
        maxResults: '20',
        relevanceLanguage: lang,
        regionCode: region,
        videoDuration: 'short',
        order: 'relevance',
        ...(pageToken && { pageToken }),
      })
      url = `https://www.googleapis.com/youtube/v3/search?${params}`
    } else {
      // Trending mode
      const params = new URLSearchParams({
        key: process.env.YOUTUBE_API_KEY,
        part: 'snippet,statistics',
        chart: 'mostPopular',
        regionCode: region,
        maxResults: '20',
        videoCategoryId: '0',
        ...(pageToken && { pageToken }),
      })
      url = `https://www.googleapis.com/youtube/v3/videos?${params}`
    }

    const res = await fetch(url)
    const data = await res.json()
    if (!res.ok) {
      console.error('YouTube API error', data)
      return NextResponse.json({ error: data?.error?.message || 'YouTube error' }, { status: 500 })
    }
    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
