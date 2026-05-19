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
  { label: '🎵 Music', value: 'music' },
  { label: '⚽ Sports', value: 'sports highlights' },
  { label: '🎮 Gaming', value: 'gaming' },
  { label: '🍕 Food', value: 'food' },
  { label: '🐾 Animals', value: 'cute animals funny' },
]

// YouTube category IDs to rotate through for more variety
const YT_CATEGORIES = ['0', '22', '23', '24', '17', '10', '20', '26']

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

function VideoCard({ video, isActive, onEnded }: { video: YTVideo; isActive: boolean; onEnded: () => void }) {
  const [liked, setLiked] = useState(false)
  const [localLikes, setLocalLikes] = useState(parseInt(video.likeCount || '0'))
  const [showPlayer, setShowPlayer] = useState(false)

  useEffect(() => {
    if (isActive) {
      const t = setTimeout(() => setShowPlayer(true), 80)
      return () => clearTimeout(t)
    } else {
      setShowPlayer(false)
    }
  }, [isActive])

  // Listen for YouTube postMessage to detect video end
  useEffect(() => {
    if (!isActive) return
    const handler = (e: MessageEvent) => {
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
        // state 0 = ended
        if (data?.event === 'onStateChange' && data?.info === 0) onEnded()
      } catch {}
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [isActive, onEnded])

  const handleLike = () => {
    setLiked(l => { setLocalLikes(c => l ? c - 1 : c + 1); return !l })
  }

  const embedUrl = `https://www.youtube.com/embed/${video.id}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1`

  return (
    <div className="relative w-full h-full bg-black">
      {/* Thumbnail / placeholder */}
      {!showPlayer && (
        <div className="absolute inset-0 cursor-pointer" onClick={() => setShowPlayer(true)}>
          <img src={video.thumbnail} className="w-full h-full object-cover" alt="" />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="w-20 h-20 rounded-full bg-red-600 flex items-center justify-center shadow-2xl hover:scale-110 transition-transform">
              <span className="text-white text-4xl ml-1">▶</span>
            </div>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
          <div className="absolute bottom-4 left-3 right-16">
            <p className="text-white font-bold text-sm drop-shadow truncate">{video.channelTitle}</p>
            <p className="text-white/75 text-xs mt-0.5 line-clamp-2">{video.title}</p>
          </div>
        </div>
      )}

      {/* YouTube iframe */}
      {showPlayer && (
        <iframe
          src={embedUrl}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      )}

      {/* Action bar */}
      <div className="absolute right-3 bottom-20 flex flex-col items-center gap-4 z-10">
        <button onClick={handleLike} className="flex flex-col items-center gap-0.5">
          <span className={`text-2xl transition-transform duration-200 ${liked ? 'scale-125' : ''}`}>{liked ? '❤️' : '🤍'}</span>
          <span className="text-white text-[11px] font-bold drop-shadow">{fmtCount(localLikes)}</span>
        </button>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xl">👁</span>
          <span className="text-white text-[11px] font-bold drop-shadow">{fmtCount(video.viewCount)}</span>
        </div>
        <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer"
          className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center text-white text-xs font-black shadow-lg">
          YT
        </a>
      </div>
    </div>
  )
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
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [catIndex, setCatIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])
  const loadingMoreRef = useRef(false)

  const parseVideos = (data: any, isSearch: boolean): YTVideo[] => {
    return (data.items || []).map((item: any) => {
      const id = isSearch ? item.id?.videoId : item.id
      const snippet = item.snippet || {}
      const stats = item.statistics || {}
      return {
        id,
        title: snippet.title || '',
        channelTitle: snippet.channelTitle || '',
        thumbnail: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || '',
        viewCount: stats.viewCount || '0',
        likeCount: stats.likeCount || '0',
      }
    }).filter((v: YTVideo) => v.id)
  }

  const fetchVideos = useCallback(async (
    tab: string, reg: string, srch: string, pageToken = '', reset = false, catIdx = 0
  ) => {
    if (reset) setLoading(true)
    else { setLoadingMore(true); loadingMoreRef.current = true }
    try {
      const query = srch || tab
      const params = new URLSearchParams({
        region: reg,
        lang: getBrowserRegion().toLowerCase(),
        ...(query && { q: query }),
        ...(!query && { videoCategoryId: YT_CATEGORIES[catIdx % YT_CATEGORIES.length] }),
        ...(pageToken && { pageToken }),
      })
      const res = await fetch(`/api/youtube?${params}`)
      const data = await res.json()
      if (data.error) { console.error(data.error); setLoading(false); setLoadingMore(false); loadingMoreRef.current = false; return }
      const isSearch = !!query
      const parsed = parseVideos(data, isSearch)
      if (reset) { setVideos(parsed); setActiveIndex(0) }
      else setVideos(prev => [...prev, ...parsed])
      setNextPageToken(data.nextPageToken || '')
      setHasMore(!!data.nextPageToken || (!query && catIdx + 1 < YT_CATEGORIES.length * 3))
    } catch (e) { console.error(e) }
    setLoading(false); setLoadingMore(false); loadingMoreRef.current = false
  }, [])

  useEffect(() => {
    setCatIndex(0)
    fetchVideos(activeTab, region, search, '', true, 0)
  }, [activeTab, region, search, fetchVideos])

  // Scroll to specific index inside the snap container
  const scrollToIndex = useCallback((idx: number) => {
    const container = containerRef.current
    const el = cardRefs.current[idx]
    if (container && el) {
      container.scrollTo({ top: el.offsetTop, behavior: 'smooth' })
      setActiveIndex(idx)
    }
  }, [])

  // Auto-advance when video ends
  const handleVideoEnd = useCallback(() => {
    const next = activeIndex + 1
    if (next < videos.length) {
      scrollToIndex(next)
    } else if (hasMore && !loadingMoreRef.current) {
      const nextCat = catIndex + 1
      setCatIndex(nextCat)
      fetchVideos(activeTab, region, search, nextPageToken || '', false, nextCat)
    }
  }, [activeIndex, videos.length, hasMore, nextPageToken, activeTab, region, search, catIndex, fetchVideos, scrollToIndex])

  // Scroll event — reliable active index detection for snap containers
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handleScroll = () => {
      const cardHeight = container.clientHeight
      if (!cardHeight) return
      const idx = Math.round(container.scrollTop / cardHeight)
      setActiveIndex(idx)
      if (idx >= videos.length - 4 && hasMore && !loadingMoreRef.current) {
        const nextCat = catIndex + 1
        setCatIndex(nextCat)
        fetchVideos(activeTab, region, search, nextPageToken || '', false, nextCat)
      }
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [videos.length, hasMore, nextPageToken, activeTab, region, search, catIndex, fetchVideos])

  const doSearch = () => {
    setSearch(searchInput.trim())
    setActiveTab('')
  }

  const currentRegionLabel = REGIONS.find(r => r.value === region)?.label || '🌍 Global'

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="text-5xl animate-bounce">▶️</div>
      <p className="text-[#5B6271] text-sm font-semibold">Loading YouTube trending…</p>
    </div>
  )

  return (
    <div>
      {/* Search bar */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#EEF1F5] bg-white sticky top-0 z-20">
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder="Search videos…"
          className="flex-1 bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF0000]"
        />
        <button onClick={doSearch}
          className="bg-[#FF0000] hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors flex-shrink-0">
          🔍
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 overflow-x-auto px-3 py-2 border-b border-[#EEF1F5] bg-white z-20" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(tab => (
          <button key={tab.value} onClick={() => { setActiveTab(tab.value); setSearch(''); setSearchInput('') }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              activeTab === tab.value && !search
                ? 'bg-[#FF0000] text-white shadow-sm'
                : 'bg-[#F0F2F5] text-[#5B6271] hover:bg-[#FFE8E8] hover:text-[#FF0000]'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Region selector */}
      <div className="relative px-3 py-2 border-b border-[#EEF1F5] bg-white flex items-center gap-2 z-10">
        <span className="text-xs text-[#5B6271] font-semibold">Region:</span>
        <button onClick={() => setShowRegions(r => !r)}
          className="flex items-center gap-1.5 bg-[#F0F2F5] hover:bg-[#E6EEFF] px-3 py-1.5 rounded-full text-xs font-bold text-[#0A0B0D] transition-colors">
          {currentRegionLabel} <span className="text-[#8A919E]">▾</span>
        </button>
        {showRegions && (
          <div className="absolute top-10 left-3 bg-white border border-[#E4E7EB] rounded-2xl shadow-xl z-30 overflow-hidden min-w-[160px]">
            {REGIONS.map(r => (
              <button key={r.value} onClick={() => { setRegion(r.value); setShowRegions(false) }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#F0F4FF] transition-colors ${region === r.value ? 'font-black text-[#0052FF]' : 'text-[#0A0B0D]'}`}>
                {r.label}
              </button>
            ))}
          </div>
        )}

        {/* Prev / Next buttons */}
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={() => activeIndex > 0 && scrollToIndex(activeIndex - 1)}
            disabled={activeIndex === 0}
            className="w-8 h-8 rounded-full bg-[#F0F2F5] flex items-center justify-center text-sm disabled:opacity-30 hover:bg-[#E6EEFF] transition-colors">
            ↑
          </button>
          <button onClick={() => scrollToIndex(activeIndex + 1)}
            disabled={activeIndex >= videos.length - 1}
            className="w-8 h-8 rounded-full bg-[#F0F2F5] flex items-center justify-center text-sm disabled:opacity-30 hover:bg-[#E6EEFF] transition-colors">
            ↓
          </button>
          <span className="text-[10px] text-[#8A919E] ml-1">{activeIndex + 1}/{videos.length}</span>
        </div>
      </div>

      {/* Video feed — snap scroll, one video at a time */}
      <div
        ref={containerRef}
        className="overflow-y-scroll"
        style={{ height: 'calc(100vh - 175px)', scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }}
      >
        {videos.map((video, i) => (
          <div
            key={`${video.id}-${i}`}
            data-index={i}
            ref={el => { cardRefs.current[i] = el }}
            style={{ scrollSnapAlign: 'start', scrollSnapStop: 'always', height: '100%' }}
          >
            <VideoCard video={video} isActive={activeIndex === i} onEnded={handleVideoEnd} />
          </div>
        ))}
        {loadingMore && (
          <div className="py-10 text-center text-[#5B6271] text-sm animate-pulse" style={{ scrollSnapAlign: 'start' }}>
            Loading more…
          </div>
        )}
        {videos.length === 0 && !loading && (
          <div className="py-20 text-center" style={{ scrollSnapAlign: 'start' }}>
            <p className="text-4xl mb-3">😕</p>
            <p className="text-[#5B6271] text-sm">No videos found.</p>
          </div>
        )}
      </div>
    </div>
  )
}
