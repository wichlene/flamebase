'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

type PixabayVideo = {
  id: number
  tags: string
  duration: number
  videos: {
    large: { url: string; width: number; height: number }
    medium: { url: string; width: number; height: number }
    small: { url: string; width: number; height: number }
    tiny: { url: string; width: number; height: number }
  }
  views: number
  likes: number
  user: string
  userImageURL: string
  pageURL: string
}

const CATEGORIES = [
  { label: 'All', value: '' },
  { label: '🌿 Nature', value: 'nature' },
  { label: '👥 People', value: 'people' },
  { label: '🏙️ City', value: 'places' },
  { label: '⚽ Sports', value: 'sports' },
  { label: '🐾 Animals', value: 'animals' },
  { label: '✈️ Travel', value: 'travel' },
  { label: '🎵 Music', value: 'music' },
  { label: '🍕 Food', value: 'food' },
]

function VideoCard({ video, isActive }: { video: PixabayVideo; isActive: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const [liked, setLiked] = useState(false)

  useEffect(() => {
    if (!ref.current) return
    if (isActive) {
      ref.current.play().catch(() => {})
    } else {
      ref.current.pause()
    }
  }, [isActive])

  const src = video.videos.medium?.url || video.videos.small?.url || video.videos.tiny?.url

  return (
    <div className="relative w-full bg-black" style={{ height: 'calc(100vh - 180px)' }}>
      <video
        ref={ref}
        src={src}
        loop
        muted={muted}
        playsInline
        className="w-full h-full object-cover"
      />

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />

      {/* Right action bar */}
      <div className="absolute right-3 bottom-20 flex flex-col items-center gap-5">
        <button
          onClick={() => setMuted(m => !m)}
          className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white text-lg">
          {muted ? '🔇' : '🔊'}
        </button>
        <button
          onClick={() => setLiked(l => !l)}
          className="flex flex-col items-center gap-1">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xl transition-transform ${liked ? 'scale-125' : ''}`}>
            {liked ? '❤️' : '🤍'}
          </div>
          <span className="text-white text-xs font-bold">{(video.likes + (liked ? 1 : 0)).toLocaleString()}</span>
        </button>
        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-lg">👁</div>
          <span className="text-white text-xs font-bold">{video.views > 999 ? `${(video.views / 1000).toFixed(0)}K` : video.views}</span>
        </div>
        <a href={video.pageURL} target="_blank" rel="noreferrer"
          className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-white text-sm font-bold">
          ↗
        </a>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-4 left-3 right-16">
        <div className="flex items-center gap-2 mb-1.5">
          {video.userImageURL
            ? <img src={video.userImageURL} className="w-7 h-7 rounded-full object-cover" alt="" />
            : <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#0052FF] to-[#7B3FE4] flex items-center justify-center text-white text-xs font-black">{video.user[0]?.toUpperCase()}</div>
          }
          <span className="text-white font-bold text-sm">@{video.user}</span>
          <span className="text-white/60 text-xs ml-auto">{video.duration}s</span>
        </div>
        <p className="text-white/80 text-xs leading-relaxed line-clamp-2">{video.tags}</p>
        <div className="flex items-center gap-1 mt-1.5">
          <img src="https://pixabay.com/static/img/logo_square.png" className="w-4 h-4 rounded" alt="Pixabay" />
          <span className="text-white/40 text-[10px]">via Pixabay</span>
        </div>
      </div>
    </div>
  )
}

export default function Reels() {
  const [videos, setVideos] = useState<PixabayVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [category, setCategory] = useState('')
  const [page, setPage] = useState(1)
  const [activeIndex, setActiveIndex] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const fetchVideos = useCallback(async (cat: string, pg: number, reset = false) => {
    if (pg === 1) setLoading(true); else setLoadingMore(true)
    try {
      const params = new URLSearchParams({ page: pg.toString(), ...(cat && { category: cat }) })
      const res = await fetch(`/api/reels?${params}`)
      const data = await res.json()
      const hits: PixabayVideo[] = data.hits || []
      if (reset) {
        setVideos(hits)
        setActiveIndex(0)
      } else {
        setVideos(prev => [...prev, ...hits])
      }
      setHasMore(hits.length === 20)
    } catch {}
    setLoading(false)
    setLoadingMore(false)
  }, [])

  useEffect(() => {
    fetchVideos(category, 1, true)
    setPage(1)
  }, [category, fetchVideos])

  // Intersection Observer to detect active video
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()
    observerRef.current = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = Number((entry.target as HTMLElement).dataset.index)
            setActiveIndex(idx)
            // Load more when near end
            if (idx >= videos.length - 3 && hasMore && !loadingMore) {
              const nextPage = page + 1
              setPage(nextPage)
              fetchVideos(category, nextPage)
            }
          }
        })
      },
      { threshold: 0.6 }
    )
    const cards = containerRef.current?.querySelectorAll('[data-index]')
    cards?.forEach(card => observerRef.current?.observe(card))
    return () => observerRef.current?.disconnect()
  }, [videos.length, hasMore, loadingMore, page, category, fetchVideos])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="text-4xl animate-pulse">🎬</div>
        <p className="text-[#5B6271] text-sm">Loading popular videos…</p>
      </div>
    )
  }

  return (
    <div>
      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 border-b border-[#EEF1F5] scrollbar-hide">
        {CATEGORIES.map(c => (
          <button key={c.value} onClick={() => setCategory(c.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              category === c.value
                ? 'bg-[#0052FF] text-white'
                : 'bg-[#F0F2F5] text-[#5B6271] hover:bg-[#E6EEFF] hover:text-[#0052FF]'
            }`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Video feed */}
      <div ref={containerRef} className="divide-y divide-[#111]">
        {videos.map((video, i) => (
          <div key={`${video.id}-${i}`} data-index={i}>
            <VideoCard video={video} isActive={activeIndex === i} />
          </div>
        ))}
        {loadingMore && (
          <div className="py-8 text-center text-[#5B6271] text-sm animate-pulse">Loading more…</div>
        )}
      </div>
    </div>
  )
}
