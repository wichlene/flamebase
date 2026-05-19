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
  const videoCategoryId = searchParams.get('videoCategoryId') || '0'
  const KEY = process.env.YOUTUBE_API_KEY

  try {
    let items: any[] = []
    let nextPageToken = ''

    if (q) {
      // search.list → then videos.list to get statistics + contentDetails (duration)
      const sp = new URLSearchParams({
        key: KEY,
        part: 'snippet',
        type: 'video',
        q,
        maxResults: '20',
        relevanceLanguage: lang,
        regionCode: region,
        order: 'relevance',
        ...(pageToken && { pageToken }),
      })
      const sr = await fetch(`https://www.googleapis.com/youtube/v3/search?${sp}`)
      const sd = await sr.json()
      if (!sr.ok) return NextResponse.json({ error: sd?.error?.message || 'YouTube error' }, { status: 500 })
      nextPageToken = sd.nextPageToken || ''

      const ids = (sd.items || []).map((i: any) => i.id?.videoId).filter(Boolean).join(',')
      if (ids) {
        const dp = new URLSearchParams({ key: KEY, part: 'snippet,statistics,contentDetails', id: ids })
        const dr = await fetch(`https://www.googleapis.com/youtube/v3/videos?${dp}`)
        const dd = await dr.json()
        items = dd.items || []
      }
    } else {
      // Trending — videos.list with contentDetails for duration
      const params = new URLSearchParams({
        key: KEY,
        part: 'snippet,statistics,contentDetails',
        chart: 'mostPopular',
        regionCode: region,
        maxResults: '20',
        videoCategoryId,
        ...(pageToken && { pageToken }),
      })
      const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`)
      const data = await res.json()
      if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'YouTube error' }, { status: 500 })
      nextPageToken = data.nextPageToken || ''
      items = data.items || []
    }

    return NextResponse.json({ items, nextPageToken })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
