'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

type YTVideo = {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  viewCount: string
  likeCount: string
  isShort: boolean  // true = vertical (≤60s), false = landscape
}

const REGIONS = [
  { label: '🌍 Global', value: 'US' },
  { label: '🇹🇷 Türkiye', value: 'TR' },
  { label: '🇺🇸 USA', value: 'US' },
  { label: '🇬🇧 UK', value: 'GB' },
  { label: '🇩🇪 Germany', value: 'DE' },
  { label: '🇫🇷 France', value: 'FR' },
  { label: '🇯🇵 Japan', value: 'JP' },
  { label: '🇰🇷 Korea', value: 'KR' },
  { label: '🇧🇷 Brazil', value: 'BR' },
  { label: '🇮🇳 India', value: 'IN' },
]

const TABS = [
  { label: '🔥 Trending', value: '' },
  { label: '📱 Shorts', value: '#shorts' },
  { label: '😂 Funny', value: 'funny viral' },
  { label: '🎵 Music', value: 'music video' },
  { label: '⚽ Sports', value: 'sports highlights' },
  { label: '🎮 Gaming', value: 'gaming' },
  { label: '🍕 Food', value: 'food' },
  { label: '🐾 Animals', value: 'cute animals' },
  { label: '🌿 Nature', value: 'nature' },
]

const YT_CATEGORIES = ['0', '22', '10', '23', '24', '17', '20', '26', '28', '15']

function parseDuration(iso: string): number {
  const m = iso?.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 999
  return (parseInt(m[1] || '0') * 3600) + (parseInt(m[2] || '0') * 60) + parseInt(m[3] || '0')
}

function fmtCount(n: string | number): string {
  const num = typeof n === 'string' ? parseInt(n) || 0 : n
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`
  return String(num)
}

function getBrowserRegion(): string {
  if (typeof navigator === 'undefined') return 'US'
  const lang = navigator.language || ''
  if (lang.startsWith('tr')) return 'TR'
  if (lang.startsWith('ru')) return 'RU'
  if (lang.startsWith('de')) return 'DE'
  if (lang.startsWith('fr')) return 'FR'
  if (lang.startsWith('ja')) return 'JP'
  if (lang.startsWith('ko')) return 'KR'
  if (lang.startsWith('pt')) return 'BR'
  if (lang.startsWith('hi')) return 'IN'
  return 'US'
}

export default function Reels() {
  const [videos, setVideos] = useState<YTVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [activeTab, setActiveTab] = useState('')
  const [region, setRegion] = useState(() => getBrowserRegion())
  const [activeIndex, setActiveIndex] = useState(0)
  const [showRegions, setShowRegions] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [likes, setLikes] = useState<Record<string, boolean>>({})
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})

  const containerRef = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false)
  const activeIndexRef = useRef(0)
  const catIndexRef = useRef(0)
  const nextPageTokenRef = useRef('')
  const activeTabRef = useRef('')
  const regionRef = useRef(getBrowserRegion())
  const searchRef = useRef('')
  const videosLenRef = useRef(0)

  // keep refs in sync with state
  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  useEffect(() => { regionRef.current = region }, [region])
  useEffect(() => { searchRef.current = search }, [search])

  const parseVideos = (items: any[]): YTVideo[] =>
    items.map((item: any) => {
      const id = typeof item.id === 'string' ? item.id : item.id?.videoId
      const snippet = item.snippet || {}
      const stats = item.statistics || {}
      const dur = parseDuration(item.contentDetails?.duration || '')
      return {
        id,
        title: snippet.title || '',
        channelTitle: snippet.channelTitle || '',
        thumbnail:
          snippet.thumbnails?.maxres?.url ||
          snippet.thumbnails?.high?.url ||
          snippet.thumbnails?.medium?.url || '',
        viewCount: stats.viewCount || '0',
        likeCount: stats.likeCount || '0',
        isShort: dur <= 62,
      }
    }).filter((v: YTVideo) => v.id)

  const fetchVideos = useCallback(async (
    tab: string, reg: string, srch: string, pageToken: string, reset: boolean, catIdx: number
  ) => {
    if (!reset && loadingMoreRef.current) return
    loadingMoreRef.current = true
    if (reset) setLoading(true)
    else setLoadingMore(true)

    try {
      const query = srch || (tab !== '' ? tab : '')
      const params = new URLSearchParams({
        region: reg,
        lang: reg.toLowerCase(),
        ...(query ? { q: query } : { videoCategoryId: YT_CATEGORIES[catIdx % YT_CATEGORIES.length] }),
        ...(pageToken && { pageToken }),
      })
      const res = await fetch(`/api/youtube?${params}`)
      const data = await res.json()
      if (data.error) { console.error(data.error); return }

      const parsed = parseVideos(data.items || [])
      const counts: Record<string, number> = {}
      parsed.forEach(v => { counts[v.id] = parseInt(v.likeCount || '0') })

      nextPageTokenRef.current = data.nextPageToken || ''

      if (reset) {
        setVideos(parsed)
        setLikeCounts(counts)
        setActiveIndex(0)
        activeIndexRef.current = 0
        videosLenRef.current = parsed.length
        if (containerRef.current) containerRef.current.scrollTop = 0
      } else {
        setVideos(prev => {
          const next = [...prev, ...parsed]
          videosLenRef.current = next.length
          return next
        })
        setLikeCounts(prev => ({ ...prev, ...counts }))
      }
    } catch (e) { console.error(e) }

    setLoading(false)
    setLoadingMore(false)
    loadingMoreRef.current = false
  }, [])

  useEffect(() => {
    catIndexRef.current = 0
    nextPageTokenRef.current = ''
    fetchVideos(activeTab, region, search, '', true, 0)
  }, [activeTab, region, search, fetchVideos])

  // Load more using refs — no stale closure issues
  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return
    const nextCat = catIndexRef.current + 1
    catIndexRef.current = nextCat
    fetchVideos(
      activeTabRef.current,
      regionRef.current,
      searchRef.current,
      nextPageTokenRef.current,
      false,
      nextCat
    )
  }, [fetchVideos])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onSnap = () => {
      const cardHeight = container.clientHeight
      if (!cardHeight) return
      const idx = Math.round(container.scrollTop / cardHeight)
      if (idx !== activeIndexRef.current) {
        activeIndexRef.current = idx
        setActiveIndex(idx)
      }
      // Trigger infinite load when 5 videos from end
      if (idx >= videosLenRef.current - 5) loadMore()
    }

    const supportsScrollEnd = 'onscrollend' in window
    let debounce: ReturnType<typeof setTimeout>
    const onScroll = () => { clearTimeout(debounce); debounce = setTimeout(onSnap, 80) }

    if (supportsScrollEnd) {
      container.addEventListener('scrollend', onSnap, { passive: true })
    } else {
      container.addEventListener('scroll', onScroll, { passive: true })
    }
    return () => {
      container.removeEventListener('scrollend', onSnap)
      container.removeEventListener('scroll', onScroll)
      clearTimeout(debounce)
    }
  }, [loadMore])

  const scrollToIndex = (idx: number) => {
    const container = containerRef.current
    if (!container) return
    container.scrollTo({ top: idx * container.clientHeight, behavior: 'smooth' })
    activeIndexRef.current = idx
    setActiveIndex(idx)
    if (idx >= videosLenRef.current - 5) loadMore()
  }

  const handleLike = (id: string) => {
    setLikes(prev => {
      const wasLiked = !!prev[id]
      setLikeCounts(c => ({ ...c, [id]: (c[id] || 0) + (wasLiked ? -1 : 1) }))
      return { ...prev, [id]: !wasLiked }
    })
  }

  const doSearch = () => { setSearch(searchInput.trim()); setActiveTab('') }

  const currentVideo = videos[activeIndex]
  const currentRegionLabel = REGIONS.find(r => r.value === region)?.label || '🌍 Global'

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="text-5xl animate-bounce">▶️</div>
      <p className="text-[#5B6271] text-sm font-semibold">Loading videos…</p>
    </div>
  )

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>

      {/* Search */}
      <div className="flex gap-2 px-3 py-2 border-b border-[#EEF1F5] bg-white flex-shrink-0">
        <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder="Search videos…"
          className="flex-1 bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-[#FF0000]" />
        <button onClick={doSearch}
          className="bg-[#FF0000] hover:bg-red-700 text-white px-4 py-1.5 rounded-xl text-sm font-bold transition-colors">
          🔍
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto px-3 py-2 border-b border-[#EEF1F5] bg-white flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(tab => (
          <button key={tab.value} onClick={() => { setActiveTab(tab.value); setSearch(''); setSearchInput('') }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === tab.value && !search ? 'bg-[#FF0000] text-white' : 'bg-[#F0F2F5] text-[#5B6271] hover:bg-[#FFE8E8] hover:text-[#FF0000]'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Region + nav */}
      <div className="relative flex items-center gap-2 px-3 py-1.5 border-b border-[#EEF1F5] bg-white flex-shrink-0">
        <button onClick={() => setShowRegions(r => !r)}
          className="flex items-center gap-1 bg-[#F0F2F5] px-2.5 py-1 rounded-full text-xs font-bold">
          {currentRegionLabel} ▾
        </button>
        {showRegions && (
          <div className="absolute top-9 left-3 bg-white border border-[#E4E7EB] rounded-2xl shadow-xl z-30 overflow-hidden min-w-[150px]">
            {REGIONS.map(r => (
              <button key={r.value} onClick={() => { setRegion(r.value); setShowRegions(false) }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#F0F4FF] ${region === r.value ? 'font-black text-[#0052FF]' : 'text-[#0A0B0D]'}`}>
                {r.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-1 ml-auto items-center">
          <button onClick={() => activeIndex > 0 && scrollToIndex(activeIndex - 1)}
            disabled={activeIndex === 0}
            className="w-7 h-7 rounded-full bg-[#F0F2F5] flex items-center justify-center text-sm disabled:opacity-30">↑</button>
          <button onClick={() => scrollToIndex(activeIndex + 1)}
            disabled={activeIndex >= videos.length - 1}
            className="w-7 h-7 rounded-full bg-[#F0F2F5] flex items-center justify-center text-sm disabled:opacity-30">↓</button>
          <span className="text-[10px] text-[#8A919E] ml-1">{activeIndex + 1}/{videos.length}</span>
        </div>
      </div>

      {/* Main: single iframe on top, snap-scroll thumbnails below */}
      <div className="flex-1 relative overflow-hidden bg-black">

        {currentVideo && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
            {/* Portrait (Shorts) — narrow centered */}
            {currentVideo.isShort ? (
              <div style={{ height: '100%', aspectRatio: '9/16', maxWidth: '100%', position: 'relative' }}>
                <iframe
                  key={currentVideo.id}
                  src={`https://www.youtube.com/embed/${currentVideo.id}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1`}
                  className="w-full h-full"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              /* Landscape — full width */
              <div className="w-full" style={{ aspectRatio: '16/9' }}>
                <iframe
                  key={currentVideo.id}
                  src={`https://www.youtube.com/embed/${currentVideo.id}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1`}
                  className="w-full h-full"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}

            {/* Like / views overlay */}
            <div className="absolute right-3 bottom-20 flex flex-col items-center gap-4 z-20 pointer-events-auto">
              <button onClick={() => handleLike(currentVideo.id)} className="flex flex-col items-center gap-0.5">
                <span className={`text-2xl transition-transform ${likes[currentVideo.id] ? 'scale-125' : ''}`}>
                  {likes[currentVideo.id] ? '❤️' : '🤍'}
                </span>
                <span className="text-white text-[11px] font-bold drop-shadow">{fmtCount(likeCounts[currentVideo.id] || 0)}</span>
              </button>
              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xl">👁</span>
                <span className="text-white text-[11px] font-bold drop-shadow">{fmtCount(currentVideo.viewCount)}</span>
              </div>
              <a href={`https://www.youtube.com/watch?v=${currentVideo.id}`} target="_blank" rel="noreferrer"
                className="w-9 h-9 rounded-full bg-red-600 flex items-center justify-center text-white text-xs font-black shadow">YT</a>
            </div>

            {/* Vertical/landscape badge */}
            <div className="absolute top-3 left-3 z-20">
              <span className="text-[10px] bg-black/50 text-white px-2 py-0.5 rounded-full">
                {currentVideo.isShort ? '📱 Short' : '🖥️ Video'}
              </span>
            </div>
          </div>
        )}

        {/* Invisible snap-scroll thumbnails — navigation only */}
        <div
          ref={containerRef}
          className="absolute inset-0 overflow-y-scroll"
          style={{ scrollSnapType: 'y mandatory', scrollbarWidth: 'none', zIndex: 0 }}
        >
          {videos.map((video, i) => (
            <div
              key={video.id}
              data-card
              onClick={() => scrollToIndex(i)}
              className="w-full flex-shrink-0 cursor-pointer"
              style={{ height: '100%', scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
            />
          ))}
          {loadingMore && (
            <div className="py-8 text-center text-white/60 text-xs" style={{ scrollSnapAlign: 'start' }}>
              Loading more…
            </div>
          )}
        </div>
      </div>

      {/* Info bar */}
      {currentVideo && (
        <div className="flex-shrink-0 bg-black px-3 py-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-white text-xs font-bold truncate">{currentVideo.channelTitle}</p>
            <p className="text-white/60 text-[11px] truncate">{currentVideo.title}</p>
          </div>
          <span className="text-[10px] text-white/40 flex-shrink-0">📺 YouTube</span>
        </div>
      )}

      {videos.length === 0 && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
          <p className="text-4xl mb-3">😕</p>
          <p className="text-white/60 text-sm">No videos found.</p>
        </div>
      )}
    </div>
  )
}
