'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

type Video = {
  id: number
  url: string       // direct mp4
  thumb: string
  tags: string
  user: string
  views: number
  likes: number
  duration: number
}

const TABS = [
  { label: '🔥 Popular', q: '', category: '' },
  { label: '😂 Funny', q: 'funny', category: '' },
  { label: '🐾 Animals', q: 'animals', category: 'animals' },
  { label: '🌿 Nature', q: 'nature', category: 'nature' },
  { label: '🏙️ City', q: 'city', category: '' },
  { label: '⚽ Sports', q: 'sports', category: 'sports' },
  { label: '🍕 Food', q: 'food', category: 'food' },
  { label: '✈️ Travel', q: 'travel', category: 'travel' },
  { label: '🎵 Music', q: 'music', category: 'music' },
]

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function VideoCard({
  video, isActive, onLike, liked, likeCount,
}: {
  video: Video
  isActive: boolean
  onLike: () => void
  liked: boolean
  likeCount: number
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (isActive) {
      el.currentTime = 0
      el.play().catch(() => {})
    } else {
      el.pause()
      el.currentTime = 0
    }
  }, [isActive])

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!videoRef.current) return
    videoRef.current.muted = !muted
    setMuted(m => !m)
  }

  const togglePlay = () => {
    const el = videoRef.current
    if (!el) return
    if (el.paused) { el.play(); setPaused(false) }
    else { el.pause(); setPaused(true) }
  }

  return (
    <div className="w-full h-full relative bg-black flex items-center justify-center" onClick={togglePlay}>
      <video
        ref={videoRef}
        src={video.url}
        className="w-full h-full object-contain"
        loop
        muted={muted}
        playsInline
        preload={isActive ? 'auto' : 'none'}
      />

      {/* Pause indicator */}
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center">
            <span className="text-3xl text-white ml-1">▶</span>
          </div>
        </div>
      )}

      {/* Right-side actions */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10" onClick={e => e.stopPropagation()}>
        <button onClick={onLike} className="flex flex-col items-center gap-0.5">
          <span className={`text-2xl transition-transform ${liked ? 'scale-125' : ''}`}>{liked ? '❤️' : '🤍'}</span>
          <span className="text-white text-[11px] font-bold drop-shadow">{fmtCount(likeCount)}</span>
        </button>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xl">👁</span>
          <span className="text-white text-[11px] font-bold drop-shadow">{fmtCount(video.views)}</span>
        </div>
        <button onClick={toggleMute} className="flex flex-col items-center gap-0.5">
          <span className="text-2xl">{muted ? '🔇' : '🔊'}</span>
        </button>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-4 left-3 right-20 z-10 pointer-events-none">
        <p className="text-white font-bold text-sm drop-shadow">@{video.user}</p>
        <p className="text-white/70 text-xs mt-0.5 line-clamp-2">{video.tags}</p>
      </div>

      {/* Gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
    </div>
  )
}

export default function Reels() {
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [activeTab, setActiveTab] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [likes, setLikes] = useState<Record<number, boolean>>({})
  const [likeCounts, setLikeCounts] = useState<Record<number, number>>({})

  const containerRef = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false)
  const pageRef = useRef(1)
  const activeIndexRef = useRef(0)

  const parseVideos = (hits: any[]): Video[] =>
    hits.map((h: any) => ({
      id: h.id,
      url: h.videos?.medium?.url || h.videos?.small?.url || h.videos?.large?.url || '',
      thumb: h.videos?.medium?.thumbnail || h.videos?.small?.thumbnail || h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg` : '',
      tags: h.tags || '',
      user: h.user || '',
      views: h.views || 0,
      likes: h.likes || 0,
      duration: h.duration || 0,
    })).filter(v => v.url)

  const fetchVideos = useCallback(async (tabIdx: number, srch: string, pg: number, reset: boolean) => {
    if (!reset && loadingMoreRef.current) return
    loadingMoreRef.current = true
    if (reset) setLoading(true)
    else setLoadingMore(true)

    try {
      const tab = TABS[tabIdx]
      const params = new URLSearchParams({
        page: String(pg),
        ...(srch ? { q: srch } : tab.q ? { q: tab.q } : { mix: '1' }),
        ...(tab.category && !srch && { category: tab.category }),
      })
      const res = await fetch(`/api/reels?${params}`)
      const data = await res.json()
      const parsed = parseVideos(data.hits || [])
      const counts: Record<number, number> = {}
      parsed.forEach(v => { counts[v.id] = v.likes })

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
    } catch (e) { console.error(e) }

    setLoading(false); setLoadingMore(false); loadingMoreRef.current = false
  }, [])

  useEffect(() => {
    pageRef.current = 1
    setPage(1)
    fetchVideos(activeTab, search, 1, true)
  }, [activeTab, search, fetchVideos])

  // Snap scroll detection + infinite load
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onSnap = () => {
      const h = container.clientHeight
      if (!h) return
      const idx = Math.round(container.scrollTop / h)
      if (idx !== activeIndexRef.current) {
        activeIndexRef.current = idx
        setActiveIndex(idx)
      }
      // Load more when near end
      const total = container.querySelectorAll('[data-card]').length
      if (idx >= total - 4 && !loadingMoreRef.current) {
        const nextPage = pageRef.current + 1
        pageRef.current = nextPage
        setPage(nextPage)
        fetchVideos(activeTab, search, nextPage, false)
      }
    }

    const supportsScrollEnd = 'onscrollend' in window
    let debounce: ReturnType<typeof setTimeout>
    const onScroll = () => { clearTimeout(debounce); debounce = setTimeout(onSnap, 60) }

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
  }, [activeTab, search, fetchVideos])

  const scrollToIndex = (idx: number) => {
    const container = containerRef.current
    if (!container || idx < 0 || idx >= videos.length) return
    container.scrollTo({ top: idx * container.clientHeight, behavior: 'smooth' })
    activeIndexRef.current = idx
    setActiveIndex(idx)
  }

  const doSearch = () => { setSearch(searchInput.trim()); setActiveTab(0) }

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="text-5xl animate-bounce">🎬</div>
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
          className="flex-1 bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-[#FF6B00]" />
        <button onClick={doSearch}
          className="bg-[#FF6B00] hover:bg-orange-700 text-white px-4 py-1.5 rounded-xl text-sm font-bold transition-colors">
          🔍
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto px-3 py-2 border-b border-[#EEF1F5] bg-white flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
        {TABS.map((tab, i) => (
          <button key={i} onClick={() => { setActiveTab(i); setSearch(''); setSearchInput('') }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === i && !search ? 'bg-[#FF6B00] text-white' : 'bg-[#F0F2F5] text-[#5B6271] hover:bg-[#FFE8E8] hover:text-[#FF6B00]'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Nav counter */}
      <div className="flex items-center justify-end gap-2 px-3 py-1 bg-white border-b border-[#EEF1F5] flex-shrink-0">
        <button onClick={() => scrollToIndex(activeIndex - 1)} disabled={activeIndex === 0}
          className="w-7 h-7 rounded-full bg-[#F0F2F5] flex items-center justify-center text-sm disabled:opacity-30">↑</button>
        <button onClick={() => scrollToIndex(activeIndex + 1)} disabled={activeIndex >= videos.length - 1}
          className="w-7 h-7 rounded-full bg-[#F0F2F5] flex items-center justify-center text-sm disabled:opacity-30">↓</button>
        <span className="text-[10px] text-[#8A919E]">{activeIndex + 1}/{videos.length}{loadingMore ? '…' : ''}</span>
      </div>

      {/* Snap scroll video feed — native scroll works because <video> doesn't block events */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-scroll"
        style={{ scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }}
      >
        {videos.map((video, i) => (
          <div
            key={video.id}
            data-card
            style={{ height: '100%', scrollSnapAlign: 'start', scrollSnapStop: 'always', flexShrink: 0 }}
          >
            <VideoCard
              video={video}
              isActive={activeIndex === i}
              liked={!!likes[video.id]}
              likeCount={likeCounts[video.id] ?? video.likes}
              onLike={() => {
                setLikes(prev => {
                  const was = !!prev[video.id]
                  setLikeCounts(c => ({ ...c, [video.id]: (c[video.id] ?? video.likes) + (was ? -1 : 1) }))
                  return { ...prev, [video.id]: !was }
                })
              }}
            />
          </div>
        ))}
        {loadingMore && (
          <div className="py-10 text-center text-[#5B6271] text-sm" style={{ scrollSnapAlign: 'start' }}>
            Loading more…
          </div>
        )}
        {videos.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center" style={{ scrollSnapAlign: 'start' }}>
            <p className="text-4xl mb-3">😕</p>
            <p className="text-[#5B6271] text-sm">No videos found.</p>
          </div>
        )}
      </div>
    </div>
  )
}
