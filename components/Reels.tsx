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

const TABS = [
  { label: '🎲 Mix', value: 'mix' },
  { label: '😂 Funny', value: 'funny' },
  { label: '🐾 Animals', value: 'cute animals' },
  { label: '😮 Amazing', value: 'amazing' },
  { label: '⚽ Sports', value: 'sports' },
  { label: '✈️ Travel', value: 'travel' },
  { label: '🌿 Nature', value: 'nature' },
  { label: '🎵 Music', value: 'music' },
  { label: '🍕 Food', value: 'food' },
  { label: '🏙️ City', value: 'city' },
]

// Detect browser language → Pixabay lang code
function getBrowserLang(): string {
  if (typeof navigator === 'undefined') return 'en'
  const l = navigator.language?.slice(0, 2).toLowerCase()
  const supported = ['cs','da','de','en','es','fr','id','it','hu','nl','no','pl','pt','ro','sk','fi','sv','tr','vi','th','bg','ru','el','ja','ko','zh']
  return supported.includes(l) ? l : 'en'
}

// Track if user has ever unmuted — persists across cards
let _userUnmuted = false

function VideoCard({ video, isActive }: { video: PixabayVideo; isActive: boolean }) {
  const vidRef = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(!_userUnmuted)
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(video.likes)
  const [paused, setPaused] = useState(false)
  const [showSoundHint, setShowSoundHint] = useState(false)

  useEffect(() => {
    if (!vidRef.current) return
    if (isActive && !paused) {
      vidRef.current.muted = !_userUnmuted
      setMuted(!_userUnmuted)
      vidRef.current.play().catch(() => {})
      // Show sound hint on first video if still muted
      if (!_userUnmuted) setShowSoundHint(true)
    } else {
      vidRef.current.pause()
      setShowSoundHint(false)
    }
  }, [isActive, paused])

  const toggleMute = () => {
    const newMuted = !muted
    setMuted(newMuted)
    if (vidRef.current) vidRef.current.muted = newMuted
    if (!newMuted) { _userUnmuted = true }
    setShowSoundHint(false)
  }

  const handleLike = () => {
    if (!liked) setLikeCount(c => c + 1)
    else setLikeCount(c => c - 1)
    setLiked(l => !l)
  }

  const src = video.videos.medium?.url || video.videos.small?.url || video.videos.tiny?.url

  return (
    <div className="relative w-full bg-black select-none" style={{ height: 'calc(100vh - 180px)', minHeight: 400 }}>
      <video
        ref={vidRef}
        src={src}
        loop
        muted={muted}
        playsInline
        onClick={() => setPaused(p => !p)}
        className="w-full h-full object-cover cursor-pointer"
      />

      {/* Pause indicator */}
      {paused && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center">
            <span className="text-white text-3xl ml-1">▶</span>
          </div>
        </div>
      )}

      {/* Sound hint — tap to unmute */}
      {showSoundHint && (
        <button onClick={toggleMute}
          className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm text-white text-xs font-bold px-4 py-2 rounded-full z-20 animate-pulse">
          🔇 Tap for sound
        </button>
      )}

      {/* Dark gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20 pointer-events-none" />

      {/* Right action bar */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-5 z-10">
        {/* Like */}
        <button onClick={handleLike} className="flex flex-col items-center gap-1 group">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-2xl transition-all duration-200 ${liked ? 'scale-125' : 'group-active:scale-90'}`}>
            {liked ? '❤️' : '🤍'}
          </div>
          <span className="text-white text-xs font-bold drop-shadow">{likeCount > 999 ? `${(likeCount/1000).toFixed(1)}K` : likeCount}</span>
        </button>

        {/* Views */}
        <div className="flex flex-col items-center gap-1">
          <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl">👁</div>
          <span className="text-white text-xs font-bold drop-shadow">{video.views > 999 ? `${(video.views/1000).toFixed(0)}K` : video.views}</span>
        </div>

        {/* Sound */}
        <button onClick={toggleMute}
          className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-xl">
          {muted ? '🔇' : '🔊'}
        </button>

        {/* Open in Pixabay */}
        <a href={video.pageURL} target="_blank" rel="noreferrer"
          className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-lg font-bold">
          ↗
        </a>
      </div>

      {/* Bottom info */}
      <div className="absolute bottom-4 left-3 right-16 z-10">
        <div className="flex items-center gap-2 mb-1.5">
          {video.userImageURL
            ? <img src={video.userImageURL} className="w-8 h-8 rounded-full object-cover border-2 border-white/30" alt="" />
            : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#0052FF] to-[#7B3FE4] flex items-center justify-center text-white text-sm font-black">
                {video.user[0]?.toUpperCase()}
              </div>
          }
          <span className="text-white font-bold text-sm drop-shadow">@{video.user}</span>
          <span className="text-white/50 text-xs">{video.duration}s</span>
        </div>
        <p className="text-white/75 text-xs leading-relaxed line-clamp-2 drop-shadow">
          #{video.tags.split(', ').slice(0, 4).join(' #')}
        </p>
        <div className="flex items-center gap-1 mt-2 opacity-50">
          <span className="text-white text-[10px]">📷 Pixabay</span>
        </div>
      </div>
    </div>
  )
}

export default function Reels() {
  const [videos, setVideos] = useState<PixabayVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [activeTab, setActiveTab] = useState('mix')
  const [page, setPage] = useState(1)
  const [activeIndex, setActiveIndex] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  const pageRef = useRef(1)
  const loadingMoreRef = useRef(false)

  const fetchVideos = useCallback(async (tab: string, pg: number, reset = false) => {
    if (pg === 1) setLoading(true)
    else { setLoadingMore(true); loadingMoreRef.current = true }

    try {
      const lang = getBrowserLang()
      const isMix = tab === 'mix'
      const params = new URLSearchParams({
        page: String(pg),
        lang,
        ...(isMix ? { mix: '1' } : { q: tab }),
      })
      const res = await fetch(`/api/reels?${params}`)
      const data = await res.json()
      const hits: PixabayVideo[] = data.hits || []
      if (reset) {
        setVideos(hits)
        setActiveIndex(0)
      } else {
        setVideos(prev => [...prev, ...hits])
      }
      setHasMore(hits.length >= 15)
    } catch {}

    setLoading(false)
    setLoadingMore(false)
    loadingMoreRef.current = false
  }, [])

  useEffect(() => {
    pageRef.current = 1
    setPage(1)
    fetchVideos(activeTab, 1, true)
  }, [activeTab, fetchVideos])

  // Intersection Observer — detect active video + infinite scroll
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()
    observerRef.current = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = Number((entry.target as HTMLElement).dataset.index)
          setActiveIndex(idx)
          if (idx >= videos.length - 4 && hasMore && !loadingMoreRef.current) {
            const next = pageRef.current + 1
            pageRef.current = next
            setPage(next)
            fetchVideos(activeTab, next)
          }
        }
      })
    }, { threshold: 0.55 })

    const cards = containerRef.current?.querySelectorAll('[data-index]')
    cards?.forEach(c => observerRef.current?.observe(c))
    return () => observerRef.current?.disconnect()
  }, [videos.length, hasMore, activeTab, fetchVideos])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="text-5xl animate-bounce">🎬</div>
        <p className="text-[#5B6271] text-sm font-semibold">Loading videos…</p>
      </div>
    )
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-2 overflow-x-auto px-3 py-2.5 border-b border-[#EEF1F5] bg-white sticky top-0 z-10" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(tab => (
          <button key={tab.value} onClick={() => setActiveTab(tab.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              activeTab === tab.value
                ? 'bg-[#0052FF] text-white shadow-sm'
                : 'bg-[#F0F2F5] text-[#5B6271] hover:bg-[#E6EEFF] hover:text-[#0052FF]'
            }`}>
            {tab.label}
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
          <div className="py-10 text-center text-[#5B6271] text-sm animate-pulse">Loading more…</div>
        )}
        {!hasMore && videos.length > 0 && (
          <div className="py-8 text-center text-[#8A919E] text-xs">You've seen them all in this category!</div>
        )}
      </div>
    </div>
  )
}
