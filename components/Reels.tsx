'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

type YTVideo = {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  viewCount: string
  likeCount: string
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
  { label: '😂 Funny', value: 'funny viral' },
  { label: '🎵 Music', value: 'music video' },
  { label: '⚽ Sports', value: 'sports highlights' },
  { label: '🎮 Gaming', value: 'gaming' },
  { label: '🍕 Food', value: 'food' },
  { label: '🐾 Animals', value: 'cute animals' },
  { label: '🌿 Nature', value: 'nature' },
]

const YT_CATEGORIES = ['0', '22', '23', '24', '17', '10', '20']

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
  const [nextPageToken, setNextPageToken] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [showRegions, setShowRegions] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [catIndex, setCatIndex] = useState(0)
  const [likes, setLikes] = useState<Record<string, boolean>>({})
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})

  const containerRef = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false)
  const activeIndexRef = useRef(0)
  const catIndexRef = useRef(0)

  const parseVideos = (data: any, isSearch: boolean): YTVideo[] =>
    (data.items || []).map((item: any) => {
      const id = isSearch ? item.id?.videoId : item.id
      const snippet = item.snippet || {}
      const stats = item.statistics || {}
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
      }
    }).filter((v: YTVideo) => v.id)

  const fetchVideos = useCallback(async (
    tab: string, reg: string, srch: string, pageToken = '', reset = false, catIdx = 0
  ) => {
    if (reset) setLoading(true)
    else { setLoadingMore(true); loadingMoreRef.current = true }
    try {
      const query = srch || tab
      const params = new URLSearchParams({
        region: reg,
        lang: reg.toLowerCase(),
        ...(query ? { q: query } : { videoCategoryId: YT_CATEGORIES[catIdx % YT_CATEGORIES.length] }),
        ...(pageToken && { pageToken }),
      })
      const res = await fetch(`/api/youtube?${params}`)
      const data = await res.json()
      if (data.error) { console.error(data.error); return }
      const parsed = parseVideos(data, !!query)
      const counts: Record<string, number> = {}
      parsed.forEach(v => { counts[v.id] = parseInt(v.likeCount || '0') })
      if (reset) {
        setVideos(parsed)
        setLikeCounts(counts)
        setActiveIndex(0)
        activeIndexRef.current = 0
        if (containerRef.current) containerRef.current.scrollTop = 0
      } else {
        setVideos(prev => [...prev, ...parsed])
        setLikeCounts(prev => ({ ...prev, ...counts }))
      }
      setNextPageToken(data.nextPageToken || '')
      setHasMore(!!data.nextPageToken || catIdx + 1 < YT_CATEGORIES.length * 3)
    } catch (e) { console.error(e) }
    setLoading(false); setLoadingMore(false); loadingMoreRef.current = false
  }, [])

  useEffect(() => {
    catIndexRef.current = 0
    setCatIndex(0)
    fetchVideos(activeTab, region, search, '', true, 0)
  }, [activeTab, region, search, fetchVideos])

  // scrollend fires once after snap completes — most reliable for active index
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
      // load more near end
      const vLen = container.querySelectorAll('[data-card]').length
      if (idx >= vLen - 4 && !loadingMoreRef.current) {
        const nextCat = catIndexRef.current + 1
        catIndexRef.current = nextCat
        setCatIndex(nextCat)
      }
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
  }, [])

  useEffect(() => {
    if (catIndex === 0) return
    fetchVideos(activeTab, region, search, nextPageToken || '', false, catIndex)
  }, [catIndex])

  const scrollToIndex = (idx: number) => {
    const container = containerRef.current
    if (!container) return
    container.scrollTo({ top: idx * container.clientHeight, behavior: 'smooth' })
    activeIndexRef.current = idx
    setActiveIndex(idx)
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

      {/* Region + nav buttons */}
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
          <button onClick={() => activeIndex < videos.length - 1 && scrollToIndex(activeIndex + 1)}
            disabled={activeIndex >= videos.length - 1}
            className="w-7 h-7 rounded-full bg-[#F0F2F5] flex items-center justify-center text-sm disabled:opacity-30">↓</button>
          <span className="text-[10px] text-[#8A919E] ml-1">{activeIndex + 1}/{videos.length}</span>
        </div>
      </div>

      {/* Main view: single iframe on top, invisible snap-scroll thumbnails below for navigation */}
      <div className="flex-1 relative overflow-hidden">

        {/* ONE iframe for the active video — key forces remount so old video stops immediately */}
        {currentVideo && (
          <div className="absolute inset-0 z-10 bg-black">
            <iframe
              key={currentVideo.id}
              src={`https://www.youtube.com/embed/${currentVideo.id}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1`}
              className="w-full h-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
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
          </div>
        )}

        {/* Snap-scroll container — invisible thumbnails, used only for scroll navigation */}
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
              className="w-full flex-shrink-0 bg-black cursor-pointer"
              style={{ height: '100%', scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
            >
              <img src={video.thumbnail} className="w-full h-full object-cover opacity-0" alt="" />
            </div>
          ))}
          {loadingMore && (
            <div className="py-8 text-center text-white text-sm" style={{ scrollSnapAlign: 'start' }}>
              Loading…
            </div>
          )}
        </div>
      </div>

      {/* Video info bar */}
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
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-4xl mb-3">😕</p>
          <p className="text-[#5B6271] text-sm">No videos found.</p>
        </div>
      )}
    </div>
  )
}
