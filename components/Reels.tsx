'use client'

import { useEffect, useRef, useState } from 'react'

type YTVideo = {
  id: string
  title: string
  channelTitle: string
  thumbnail: string
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

// `cats` = related YouTube category IDs. Shuffle picks one at random for variety.
// `q`    = search query fallback when no good category exists.
const TABS = [
  { label: '🔥 Trending', cats: ['0'], q: '' },
  { label: '📱 Shorts', cats: [], q: '#shorts' },
  { label: '😂 Comedy', cats: ['23', '24', '22'], q: '' },
  { label: '🎵 Music', cats: ['10'], q: '' },
  { label: '🎬 Film', cats: ['1', '24'], q: '' },
  { label: '🎭 Entertainment', cats: ['24', '23'], q: '' },
  { label: '⚽ Sports', cats: ['17'], q: '' },
  { label: '🎮 Gaming', cats: ['20'], q: '' },
  { label: '🐾 Animals', cats: ['15'], q: '' },
  { label: '📰 News', cats: ['25'], q: '' },
  { label: '🔬 Science', cats: ['28', '27'], q: '' },
  { label: '🍕 Food', cats: ['26'], q: 'food cooking recipe' },
  { label: '🌿 Nature', cats: [], q: 'nature scenery wildlife' },
  { label: '🚗 Cars', cats: ['2'], q: '' },
]

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

function fmtViews(n: string): string {
  const num = parseInt(n || '0')
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`
  return String(num)
}

export default function Reels() {
  const [videos, setVideos] = useState<YTVideo[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(TABS[0])
  const [region, setRegion] = useState<string>('AUTO')
  const [autoRegion] = useState(() => detectRegion())
  const [showRegions, setShowRegions] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [activeId, setActiveId] = useState<string>('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [showPlaylist, setShowPlaylist] = useState(true)

  const playerHostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const [ytReady, setYtReady] = useState(false)

  // Refs that always hold the latest videos/activeId so the YT player's
  // onStateChange callback (closed over the initial render) can find
  // the next video to auto-play when one ends.
  const videosRef = useRef<YTVideo[]>([])
  const activeIdRef = useRef<string>('')
  useEffect(() => { videosRef.current = videos }, [videos])
  useEffect(() => { activeIdRef.current = activeId }, [activeId])

  const effectiveRegion = region === 'AUTO' ? autoRegion : region

  // Load YouTube IFrame API once. This gives us real player control
  // (loadVideoById, stopVideo) instead of fighting iframe remounts.
  useEffect(() => {
    const w = window as any
    if (w.YT?.Player) { setYtReady(true); return }
    const prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => { prev?.(); setYtReady(true) }
    if (!document.querySelector('script[src*="iframe_api"]')) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.body.appendChild(tag)
    }
  }, [])

  // When the active video changes, tell the existing player to load it.
  // First load creates the player and wires onStateChange so the next
  // video auto-plays when one ends; subsequent calls swap in place.
  useEffect(() => {
    if (!ytReady || !activeId || !playerHostRef.current) return
    const w = window as any
    if (!playerRef.current) {
      playerRef.current = new w.YT.Player(playerHostRef.current, {
        videoId: activeId,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        width: '100%',
        height: '100%',
        events: {
          onStateChange: (e: any) => {
            // YT.PlayerState.ENDED === 0 — advance to next video in our list.
            if (e?.data !== 0) return
            const list = videosRef.current
            const idx = list.findIndex(v => v.id === activeIdRef.current)
            const next = idx >= 0 && idx < list.length - 1 ? list[idx + 1] : list[0]
            if (next && next.id !== activeIdRef.current) setActiveId(next.id)
          },
        },
      })
    } else if (typeof playerRef.current.loadVideoById === 'function') {
      playerRef.current.loadVideoById(activeId)
    }
  }, [ytReady, activeId])

  useEffect(() => {
    setLoading(true)
    // Pick a random category from the tab's related set. This is what makes
    // refresh actually show different videos.
    const pickedCat = activeTab.cats.length > 0
      ? activeTab.cats[Math.floor(Math.random() * activeTab.cats.length)]
      : ''
    const isShorts = activeTab.label === '📱 Shorts'
    const params = new URLSearchParams({
      region: effectiveRegion,
      lang: effectiveRegion.toLowerCase(),
      ...(search
        ? { q: search }
        : pickedCat
          ? { videoCategoryId: pickedCat }
          : { q: activeTab.q }
      ),
      ...(isShorts && { shortsOnly: '1' }),
      _: String(Date.now()),
    })
    fetch(`/api/youtube?${params}`)
      .then(r => r.json())
      .then(data => {
        const parsed: YTVideo[] = (data.items || []).map((item: any) => ({
          id: typeof item.id === 'string' ? item.id : item.id?.videoId,
          title: item.snippet?.title || '',
          channelTitle: item.snippet?.channelTitle || '',
          thumbnail:
            item.snippet?.thumbnails?.high?.url ||
            item.snippet?.thumbnails?.medium?.url || '',
          views: item.statistics?.viewCount || '0',
        })).filter((v: any) => v.id)
        setVideos(parsed)
        setActiveId(parsed[0]?.id || '')
        setLoading(false)
      })
      .catch(e => { console.error(e); setLoading(false) })
  }, [activeTab, effectiveRegion, search, refreshKey])

  const doSearch = () => { setSearch(searchInput.trim()); setActiveTab(TABS[0]) }

  const switchVideo = (newId: string) => setActiveId(newId)

  return (
    <div className="flex flex-col select-none" style={{ height: 'calc(100dvh - calc(60px + var(--inset-top, 0px)) - calc(56px + var(--inset-bottom, 0px)))' }}>

      <div className="flex gap-2 px-3 py-2 border-b border-[#EEF1F5] bg-white flex-shrink-0">
        <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder="Search YouTube…"
          className="flex-1 bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:border-[#FF0000]" />
        <button onClick={doSearch}
          className="bg-[#FF0000] hover:bg-red-700 text-white px-4 py-1.5 rounded-xl text-sm font-bold transition-colors">
          🔍
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto px-3 py-2 border-b border-[#EEF1F5] bg-white flex-shrink-0" style={{ scrollbarWidth: 'none' }}>
        {TABS.map(tab => (
          <button key={tab.label} onClick={() => { setActiveTab(tab); setSearch(''); setSearchInput('') }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${activeTab.label === tab.label && !search ? 'bg-[#FF0000] text-white' : 'bg-[#F0F2F5] text-[#5B6271] hover:bg-[#FFE8E8] hover:text-[#FF0000]'}`}>
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
        <button onClick={() => setRefreshKey(k => k + 1)}
          className="bg-[#0052FF] hover:bg-blue-700 text-white px-3 py-1 rounded-full text-xs font-bold transition-colors">
          🔀 Shuffle
        </button>
        <button onClick={() => setShowPlaylist(p => !p)}
          className="bg-[#F0F2F5] text-[#0A0B0D] px-3 py-1 rounded-full text-xs font-bold ml-auto">
          {showPlaylist ? '📺 Hide list' : '📋 Show list'}
        </button>
      </div>

      {/* Main: mobile = vertical stack, desktop = side by side */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-black min-h-0">

        {/* YouTube player — fixed aspect on mobile, fills height on desktop */}
        <div className={`${showPlaylist ? 'aspect-video md:aspect-auto' : 'flex-1'} md:flex-1 bg-black flex items-center justify-center relative w-full flex-shrink-0 md:flex-shrink`}>
          <div ref={playerHostRef} className="w-full h-full" />
          {loading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 z-10">
              <div className="text-5xl animate-bounce">▶️</div>
              <p className="text-white/70 text-sm font-semibold">Loading videos…</p>
            </div>
          )}
        </div>

        {/* Playlist — full width below player on mobile, sidebar on desktop */}
        {showPlaylist && (
          <div className="flex-1 md:flex-none md:w-72 bg-[#0A0B0D] overflow-y-auto border-t md:border-t-0 md:border-l border-white/10 min-h-0" style={{ scrollbarWidth: 'thin' }}>
            <div className="px-3 py-2 text-white/60 text-[11px] font-bold sticky top-0 bg-[#0A0B0D] border-b border-white/10">
              {videos.length} VIDEOS
            </div>
            {videos.map((v, i) => (
              <button
                key={v.id}
                onClick={() => switchVideo(v.id)}
                className={`w-full text-left p-2 flex gap-2 hover:bg-white/5 transition-colors border-b border-white/5 ${activeId === v.id ? 'bg-red-600/20' : ''}`}
              >
                <div className="w-20 flex-shrink-0 aspect-video bg-black relative overflow-hidden rounded">
                  <img src={v.thumbnail} alt="" className="w-full h-full object-cover" />
                  {activeId === v.id && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <span className="text-white text-xs">▶</span>
                    </div>
                  )}
                  <span className="absolute top-0.5 left-0.5 text-[9px] bg-black/70 text-white px-1 rounded">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-[11px] font-bold line-clamp-2 leading-tight">{v.title}</p>
                  <p className="text-white/50 text-[10px] mt-1 truncate">{v.channelTitle}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {videos.length === 0 && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center bg-black">
          <p className="text-4xl mb-3">😕</p>
          <p className="text-white/60 text-sm">No videos found.</p>
        </div>
      )}
    </div>
  )
}
