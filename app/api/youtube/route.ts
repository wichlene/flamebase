import { NextResponse } from 'next/server'
import { safeJson } from '../../../lib/safeJson'

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
  const shortsOnly = searchParams.get('shortsOnly') === '1'
  const KEY = process.env.YOUTUBE_API_KEY

  // ISO 8601 → seconds. PT1M30S → 90, PT45S → 45
  const parseDuration = (iso: string): number => {
    const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!m) return 0
    return (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0')
  }
  // Random sort order for variety on every refresh
  const orders = ['relevance', 'viewCount', 'date', 'rating']
  const order = orders[Math.floor(Math.random() * orders.length)]

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
        maxResults: '50',
        relevanceLanguage: lang,
        regionCode: region,
        order,
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
        if (!dr.ok) return NextResponse.json({ error: dd?.error?.message || 'YouTube error' }, { status: 500 })
        items = dd.items || []
      }
    } else {
      // Trending — videos.list with contentDetails for duration
      const params = new URLSearchParams({
        key: KEY,
        part: 'snippet,statistics,contentDetails',
        chart: 'mostPopular',
        regionCode: region,
        maxResults: '50',
        videoCategoryId,
        ...(pageToken && { pageToken }),
      })
      const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`)
      const data = await safeJson<any>(res)
      if (!res.ok) return NextResponse.json({ error: data?.error?.message || 'YouTube error' }, { status: 500 })
      nextPageToken = data.nextPageToken || ''
      items = data.items || []
    }

    // Filter by duration: Shorts tab → ≤62s only; everything else → exclude Shorts (>62s)
    items = items.filter(item => {
      const secs = parseDuration(item.contentDetails?.duration || '')
      return shortsOnly ? secs <= 62 : secs > 62
    })

    // Shuffle for variety — never the same order twice
    items = items.sort(() => Math.random() - 0.5)

    return NextResponse.json({ items, nextPageToken })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }
}
