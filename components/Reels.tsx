'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

type YTVideo = {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
  viewCount: string
  likeCount: string
  isShort: boolean
}

const REGIONS = [
  { label: '🌍 Auto', value: 'AUTO' },
  { label: '🇹🇷 Türkiye', value: 'TR' },
  { label: '🇺🇸 USA', value: 'US' },
  { label: '🇬🇧 UK', value: 'GB' },
  { label: '🇩🇪 Germany', value: 'DE' },
  { label: '🇫🇷 France', value: 'FR' },
  { label: '🇯🇵 Japan', value: 'JP' },
  { label: '🇰🇷 Korea', value: 'KR' },
  { label: '🇧🇷 Brazil', value: 'BR' },
  { label: '🇮🇳 India', value: 'IN' },
  { label: '🇷🇺 Russia', value: 'RU' },
  { label: '🇪🇸 Spain', value: 'ES' },
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

function detectRegion(): string {
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
  if (lang.startsWith('es')) return 'ES'
  if (lang.startsWith('it')) return 'IT'
  return 'US'
}

export default function Reels() {
  const [videos, setVideos] = useState<YTVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [activeTab, setActiveTab] = useState('')
  const [region, setRegion] = useState<string>('AUTO')
  const [autoRegion] = useState(() => detectRegion())
  const [activeIndex, setActiveIndex] = useState(0)
  const [showRegions, setShowRegions] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [likes, setLikes] = useState<Record<string, boolean>>({})
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({})

  const containerRef = useRef<HTMLDivElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const loadingMoreRef = useRef(false)
  const activeIndexRef = useRef(0)
  const catIndexRef = useRef(0)
  const nextPageTokenRef = useRef('')
  const activeTabRef = useRef('')
  const regionRef = useRef('AUTO')
  const searchRef = useRef('')
  const videosLenRef = useRef(0)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const lastWheelRef = useRef(0)
  const wheelLockRef = useRef(false)

  const effectiveRegion = region === 'AUTO' ? autoRegion : region

  useEffect(() => { activeTabRef.current = activeTab }, [activeTab])
  useEffect(() => { regionRef.current = effectiveRegion }, [effectiveRegion])
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
      const query = srch || tab
      const params = new URLSearchParams({
        region: reg,
        lang: reg.toLowerCase(),
        ...(query ? { q: query } : { videoCategoryId: YT_CATEGORIES[catIdx % YT_CATEGORIES.length] }),
        ...(pageToken && { pageToken }),
        _: String(Date.now()),
      })
      const res = await fetch(`/api/youtube?${params}`)
      const data = await res.json()
      if (data.error) { console.error(data.error); return }
      let parsed = parseVideos(data.items || [])
      if (reset) seenIdsRef.current = new Set()
      parsed = parsed.filter(v => {
        if (seenIdsRef.current.has(v.id)) return false
        seenIdsRef.current.add(v.id)
        return true
      })
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
    setLoading(false); setLoadingMore(false); loadingMoreRef.current = false
  }, [])

  useEffect(() => {
    catIndexRef.current = 0
    nextPageTokenRef.current = ''
    fetchVideos(activeTab, effectiveRegion, search, '', true, 0)
  }, [activeTab, effectiveRegion, search, fetchVideos])

  const loadMore = useCallback(() => {
    if (loadingMoreRef.current) return
    const nextCat = catIndexRef.current + 1
    catIndexRef.current = nextCat
    fetchVideos(activeTabRef.current, regionRef.current, searchRef.current, nextPageTokenRef.current, false, nextCat)
  }, [fetchVideos])

  // Detect which card is in view via native scroll
  useEffect(() => {
    const c = containerRef.current
    if (!c) return
    const onSnap = () => {
      const h = c.clientHeight
      if (!h) return
      const idx = Math.round(c.scrollTop / h)
      if (idx !== activeIndexRef.current && idx >= 0 && idx < videosLenRef.current) {
        activeIndexRef.current = idx
        setActiveIndex(idx)
      }
      if (idx >= videosLenRef.current - 5) loadMore()
    }

    const supportsScrollEnd = 'onscrollend' in window
    let debounce: ReturnType<typeof setTimeout>
    const onScroll = () => { clearTimeout(debounce); debounce = setTimeout(onSnap, 80) }

    if (supportsScrollEnd) {
      c.addEventListener('scrollend', onSnap, { passive: true })
      c.addEventListener('scroll', onScroll, { passive: true }) // fallback dual
    } else {
      c.addEventListener('scroll', onScroll, { passive: true })
    }
    return () => {
      c.removeEventListener('scrollend', onSnap)
      c.removeEventListener('scroll', onScroll)
      clearTimeout(debounce)
    }
  }, [loadMore])

  // Programmatic scroll for desktop wheel + buttons
  const scrollToIndex = useCallback((idx: number) => {
    const c = containerRef.current
    if (!c) return
    if (idx < 0 || idx >= videosLenRef.current) return
    c.scrollTo({ top: idx * c.clientHeight, behavior: 'smooth' })
  }, [])

  // Wheel on the overlay (covers iframe — iframe would otherwise eat wheel events)
  const onOverlayWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const now = Date.now()
    if (now - lastWheelRef.current < 500 || wheelLockRef.current) return
    lastWheelRef.current = now
    wheelLockRef.current = true
    setTimeout(() => { wheelLockRef.current = false }, 500)
    scrollToIndex(activeIndexRef.current + (e.deltaY > 0 ? 1 : -1))
  }

  // Touch on overlay — swipe for navigation, tap for play/pause
  const touchStartYRef = useRef(0)
  const touchStartTimeRef = useRef(0)
  const onOverlayTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY
    touchStartTimeRef.current = Date.now()
  }
  const onOverlayTouchEnd = (e: React.TouchEvent) => {
    const dy = touchStartYRef.current - e.changedTouches[0].clientY
    const dt = Date.now() - touchStartTimeRef.current
    if (Math.abs(dy) > 40) {
      scrollToIndex(activeIndexRef.current + (dy > 0 ? 1 : -1))
    } else if (dt < 300) {
      // tap → toggle play/pause
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }), '*'
      )
      setTimeout(() => {
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*'
        )
      }, 50)
    }
  }

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault(); scrollToIndex(activeIndexRef.current + 1)
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault(); scrollToIndex(activeIndexRef.current - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scrollToIndex])

  const handleLike = (id: string) => {
    setLikes(prev => {
      const was = !!prev[id]
      setLikeCounts(c => ({ ...c, [id]: (c[id] || 0) + (was ? -1 : 1) }))
      return { ...prev, [id]: !was }
    })
  }

  const doSearch = () => { setSearch(searchInput.trim()); setActiveTab('') }

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="text-5xl animate-bounce">▶️</div>
      <p className="text-[#5B6271] text-sm font-semibold">Loading videos…</p>
    </div>
  )

  return (
    <div className="flex flex-col select-none" style={{ height: 'calc(100vh - 56px)' }}>

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

      <div className="flex gap-2 overflow-x-auto px-3 py-2 border-b border-[#EEF1F5] bg-white flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(tab => (
          <button key={tab.value} onClick={() => { setActiveTab(tab.value); setSearch(''); setSearchInput('') }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab === tab.value && !search ? 'bg-[#FF0000] text-white' : 'bg-[#F0F2F5] text-[#5B6271] hover:bg-[#FFE8E8] hover:text-[#FF0000]'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative flex items-center gap-2 px-3 py-1.5 border-b border-[#EEF1F5] bg-white flex-shrink-0">
        <button onClick={() => setShowRegions(r => !r)}
          className="flex items-center gap-1 bg-[#F0F2F5] px-2.5 py-1 rounded-full text-xs font-bold">
          {region === 'AUTO' ? `🌍 Auto (${autoRegion})` : REGIONS.find(r => r.value === region)?.label} ▾
        </button>
        {showRegions && (
          <div className="absolute top-9 left-3 bg-white border border-[#E4E7EB] rounded-2xl shadow-xl z-30 overflow-hidden min-w-[180px] max-h-[280px] overflow-y-auto">
            {REGIONS.map(r => (
              <button key={r.value} onClick={() => { setRegion(r.value); setShowRegions(false) }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#F0F4FF] ${region === r.value ? 'font-black text-[#0052FF]' : 'text-[#0A0B0D]'}`}>
                {r.value === 'AUTO' ? `🌍 Auto (${autoRegion})` : r.label}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => fetchVideos(activeTab, effectiveRegion, search, '', true, 0)}
          className="bg-[#0052FF] hover:bg-blue-700 text-white px-3 py-1 rounded-full text-xs font-bold transition-colors">
          🔀 Shuffle
        </button>
        <div className="flex gap-1 ml-auto items-center">
          <button onClick={() => scrollToIndex(activeIndex - 1)} disabled={activeIndex === 0}
            className="w-7 h-7 rounded-full bg-[#F0F2F5] flex items-center justify-center text-sm disabled:opacity-30">↑</button>
          <button onClick={() => scrollToIndex(activeIndex + 1)} disabled={activeIndex >= videos.length - 1}
            className="w-7 h-7 rounded-full bg-[#F0F2F5] flex items-center justify-center text-sm disabled:opacity-30">↓</button>
          <span className="text-[10px] text-[#8A919E] ml-1">{activeIndex + 1}/{videos.length}{loadingMore ? '…' : ''}</span>
        </div>
      </div>

      {/* Native snap-scroll container — cards slide in/out as user scrolls */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-scroll bg-black"
        style={{ scrollSnapType: 'y mandatory', scrollbarWidth: 'none' }}
      >
        {videos.map((video, i) => {
          const isActive = activeIndex === i
          const embedUrl = `https://www.youtube.com/embed/${video.id}?autoplay=1&enablejsapi=1&rel=0&modestbranding=1&playsinline=1`
          return (
            <div
              key={video.id}
              data-card
              className="w-full relative bg-black flex items-center justify-center"
              style={{ height: '100%', flexShrink: 0, scrollSnapAlign: 'start', scrollSnapStop: 'always' }}
            >
              {isActive ? (
                <>
                  {video.isShort ? (
                    <div style={{ height: '100%', aspectRatio: '9/16', maxWidth: '100%', position: 'relative' }}>
                      <iframe
                        ref={iframeRef}
                        key={video.id}
                        src={embedUrl}
                        className="w-full h-full"
                        allow="autoplay; encrypted-media; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <div className="w-full" style={{ aspectRatio: '16/9', position: 'relative' }}>
                      <iframe
                        ref={iframeRef}
                        key={video.id}
                        src={embedUrl}
                        className="w-full h-full"
                        allow="autoplay; encrypted-media; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  )}
                  {/* Transparent overlay catches wheel/touch over iframe area only */}
                  <div
                    className="absolute inset-y-0 z-10"
                    style={{ left: 0, right: 70 }}
                    onWheel={onOverlayWheel}
                    onTouchStart={onOverlayTouchStart}
                    onTouchEnd={onOverlayTouchEnd}
                  />
                </>
              ) : (
                <img
                  src={video.thumbnail}
                  alt=""
                  className="max-w-full max-h-full object-contain"
                  draggable={false}
                />
              )}

              <span className="absolute top-3 left-3 z-20 text-[10px] bg-black/50 text-white px-2 py-0.5 rounded-full">
                {video.isShort ? '📱 Short' : '🖥️ Video'}
              </span>

              {isActive && (
                <>
                  <div className="absolute right-3 bottom-20 flex flex-col items-center gap-4 z-20">
                    <button onClick={() => handleLike(video.id)} className="flex flex-col items-center gap-0.5">
                      <span className={`text-2xl transition-transform ${likes[video.id] ? 'scale-125' : ''}`}>
                        {likes[video.id] ? '❤️' : '🤍'}
                      </span>
                      <span className="text-white text-[11px] font-bold drop-shadow">{fmtCount(likeCounts[video.id] || 0)}</span>
                    </button>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-xl">👁</span>
                      <span className="text-white text-[11px] font-bold drop-shadow">{fmtCount(video.viewCount)}</span>
                    </div>
                    <a href={`https://www.youtube.com/watch?v=${video.id}`} target="_blank" rel="noreferrer"
                      className="w-9 h-9 rounded-full bg-red-600 flex items-center justify-center text-white text-xs font-black shadow">YT</a>
                  </div>

                  <div className="absolute bottom-2 left-3 right-20 z-20 pointer-events-none">
                    <p className="text-white text-xs font-bold truncate drop-shadow">{video.channelTitle}</p>
                    <p className="text-white/70 text-[11px] truncate drop-shadow">{video.title}</p>
                  </div>
                </>
              )}

              {i === 0 && isActive && (
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-1 animate-bounce">
                  <span className="text-2xl">👆</span>
                  <span className="text-white/80 text-xs bg-black/40 px-2 py-0.5 rounded-full">Swipe / scroll / arrows</span>
                </div>
              )}
            </div>
          )
        })}
        {loadingMore && (
          <div className="py-8 text-center text-white/60 text-sm" style={{ scrollSnapAlign: 'start' }}>
            Loading more…
          </div>
        )}
        {videos.length === 0 && !loading && (
          <div className="h-full flex flex-col items-center justify-center" style={{ scrollSnapAlign: 'start' }}>
            <p className="text-4xl mb-3">😕</p>
            <p className="text-white/60 text-sm">No videos found.</p>
          </div>
        )}
      </div>
    </div>
  )
}
