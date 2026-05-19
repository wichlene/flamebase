'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

type YTVideo = {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  viewCount: string
  likeCount: string
  publishedAt: string
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
  { label: '🌿 Nature', value: 'nature beautiful' },
]

function fmtCount(n: string | number): string {
  const num = typeof n === 'string' ? parseInt(n) : n
  if (!num) return '0'
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`
  return String(num)
}

// Module-level: once user unmutes, all subsequent videos play with sound
let _userUnmuted = false

function VideoCard({ video, isActive }: { video: YTVideo; isActive: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [liked, setLiked] = useState(false)
  const [localLikes, setLocalLikes] = useState(parseInt(video.likeCount || '0'))
  const [showPlayer, setShowPlayer] = useState(false)

  useEffect(() => {
    if (isActive) {
      // Small delay so layout settles before loading iframe
      const t = setTimeout(() => setShowPlayer(true), 100)
      return () => clearTimeout(t)
    } else {
      setShowPlayer(false)
    }
  }, [isActive])

  const handleLike = () => {
    setLiked(l => {
      setLocalLikes(c => l ? c - 1 : c + 1)
      return !l
    })
  }

  const embedUrl = `https://www.youtube.com/embed/${video.id}?autoplay=1&mute=0&rel=0&modestbranding=1&playsinline=1`

  return (
    <div className="relative w-full bg-black select-none" style={{ height: 'calc(100vh - 180px)', minHeight: 400 }}>
      {/* Thumbnail while not active */}
      {!showPlayer && (
        <div className="absolute inset-0">
          <img src={video.thumbnail} className="w-full h-full object-cover" alt={video.title} />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
              <span className="text-white text-3xl ml-1">▶</span>
            </div>
          </div>
        </div>
      )}

      {/* YouTube iframe — only mounted when active */}
      {showPlayer && (
        <iframe
          ref={iframeRef}
          src={embedUrl}
          className="absolute inset-0 w-full h-full"
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      )}

      {/* Gradient overlay (only on thumbnail) */}
      {!showPlayer && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />
      )}

      {/* Right action bar */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10">
        {/* Like */}
        <button onClick={handleLike} className="flex flex-col items-center gap-1">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-2xl transition-all duration-200 ${liked ? 'scale-125' : ''}`}>
            {liked ? '❤️' : '🤍'}
          </div>
          <span className="text-white text-xs font-bold drop-shadow">{fmtCount(localLikes)}</span>
        </button>

        {/* Views */}
        <div className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl">👁</div>
          <span className="text-white text-xs font-bold drop-shadow">{fmtCount(video.viewCount)}</span>
        </div>

        {/* Open YouTube */}
        <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer"
          className="w-11 h-11 rounded-full bg-red-600 flex items-center justify-center text-white font-bold text-sm">
          YT
        </a>
      </div>

      {/* Bottom info */}
      {!showPlayer && (
        <div className="absolute bottom-4 left-3 right-16 z-10">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-white text-xs font-black flex-shrink-0">
              ▶
            </div>
            <span className="text-white font-bold text-sm drop-shadow truncate">{video.channelTitle}</span>
          </div>
          <p className="text-white/80 text-xs leading-relaxed line-clamp-2 drop-shadow">{video.title}</p>
        </div>
      )}
    </div>
  )
}

function getBrowserLang(): string {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.language?.slice(0, 2).toLowerCase() || 'en'
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
  const containerRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadingMoreRef = useRef(false)

  const parseVideos = (data: any, isSearch: boolean): YTVideo[] => {
    const items = data.items || []
    return items.map((item: any) => {
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
        publishedAt: snippet.publishedAt || '',
      }
    }).filter((v: YTVideo) => v.id)
  }

  const fetchVideos = useCallback(async (tab: string, reg: string, pageToken = '', reset = false) => {
    if (reset) setLoading(true)
    else { setLoadingMore(true); loadingMoreRef.current = true }

    try {
      const lang = getBrowserLang()
      const params = new URLSearchParams({
        lang,
        region: reg,
        ...(tab && { q: tab }),
        ...(pageToken && { pageToken }),
      })
      const res = await fetch(`/api/youtube?${params}`)
      const data = await res.json()

      if (data.error) {
        console.error('YouTube error:', data.error)
        setLoading(false); setLoadingMore(false); loadingMoreRef.current = false
        return
      }

      const isSearch = !!tab
      const parsed = parseVideos(data, isSearch)
      if (reset) {
        setVideos(parsed)
        setActiveIndex(0)
      } else {
        setVideos(prev => [...prev, ...parsed])
      }
      setNextPageToken(data.nextPageToken || '')
      setHasMore(!!data.nextPageToken && parsed.length > 0)
    } catch (e) {
      console.error(e)
    }

    setLoading(false)
    setLoadingMore(false)
    loadingMoreRef.current = false
  }, [])

  useEffect(() => {
    fetchVideos(activeTab, region, '', true)
  }, [activeTab, region, fetchVideos])

  // Intersection Observer
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()
    observerRef.current = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = Number((entry.target as HTMLElement).dataset.index)
          setActiveIndex(idx)
          if (idx >= videos.length - 3 && hasMore && !loadingMoreRef.current && nextPageToken) {
            fetchVideos(activeTab, region, nextPageToken)
          }
        }
      })
    }, { threshold: 0.55 })

    const cards = containerRef.current?.querySelectorAll('[data-index]')
    cards?.forEach(c => observerRef.current?.observe(c))
    return () => observerRef.current?.disconnect()
  }, [videos.length, hasMore, nextPageToken, activeTab, region, fetchVideos])

  const currentRegionLabel = REGIONS.find(r => r.value === region)?.label || '🌍 Global'

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="text-5xl animate-bounce">▶️</div>
        <p className="text-[#5B6271] text-sm font-semibold">Loading YouTube trending…</p>
      </div>
    )
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-2 overflow-x-auto px-3 py-2 border-b border-[#EEF1F5] bg-white sticky top-0 z-20" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(tab => (
          <button key={tab.value} onClick={() => setActiveTab(tab.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              activeTab === tab.value
                ? 'bg-[#FF0000] text-white shadow-sm'
                : 'bg-[#F0F2F5] text-[#5B6271] hover:bg-[#FFE8E8] hover:text-[#FF0000]'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Region selector */}
      <div className="relative px-3 py-2 border-b border-[#EEF1F5] bg-white flex items-center gap-2">
        <span className="text-xs text-[#5B6271] font-semibold">Region:</span>
        <button onClick={() => setShowRegions(r => !r)}
          className="flex items-center gap-1.5 bg-[#F0F2F5] hover:bg-[#E6EEFF] px-3 py-1.5 rounded-full text-xs font-bold text-[#0A0B0D] transition-colors">
          {currentRegionLabel} <span className="text-[#8A919E]">▾</span>
        </button>
        {showRegions && (
          <div className="absolute top-10 left-3 bg-white border border-[#E4E7EB] rounded-2xl shadow-xl z-30 overflow-hidden">
            {REGIONS.map(r => (
              <button key={r.value} onClick={() => { setRegion(r.value); setShowRegions(false) }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#F0F4FF] transition-colors ${region === r.value ? 'font-black text-[#0052FF]' : 'text-[#0A0B0D]'}`}>
                {r.label}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto text-[10px] text-[#8A919E]">{videos.length} videos</span>
      </div>

      {/* Video feed */}
      <div ref={containerRef} className="divide-y divide-[#111]">
        {videos.map((video, i) => (
          <div key={`${video.id}-${i}`} data-index={i}>
            <VideoCard video={video} isActive={activeIndex === i} />
          </div>
        ))}
        {loadingMore && (
          <div className="py-10 text-center text-[#5B6271] text-sm animate-pulse">Loading more…</div>
        )}
        {videos.length === 0 && !loading && (
          <div className="py-20 text-center">
            <p className="text-4xl mb-3">😕</p>
            <p className="text-[#5B6271] text-sm">No videos found. Try a different region or tab.</p>
          </div>
        )}
      </div>
    </div>
  )
}
