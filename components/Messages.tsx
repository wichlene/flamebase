'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAccount } from 'wagmi'
import Avatar from './Avatar'

type Conv = {
  convId: string
  peer: string
  lastMessage: string
  lastSentAt: number
}

type Msg = {
  id: string
  from: string
  text: string
  ts: number
}

type Profile = { username: string; avatarHash: string; exists: boolean; flames: bigint; tips: bigint }

type Props = {
  profiles: Record<string, Profile>
  fixedFee: bigint
  pendingTarget?: string | null
  onPendingHandled?: () => void
  onUnreadCount?: (count: number) => void
}

const SEEN_KEY = 'flamebase_msg_seen'
const HIDDEN_KEY = 'flamebase_msg_hidden'

function getHidden(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')) } catch { return new Set() }
}

function addHidden(id: string) {
  const s = getHidden(); s.add(id)
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...s]))
}

function getSeenMap(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}') } catch { return {} }
}

function saveSeenMap(m: Record<string, number>) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(m))
}

function convIdOf(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join('_')
}

export default function Messages({ profiles, fixedFee, pendingTarget, onPendingHandled, onUnreadCount }: Props) {
  const { address } = useAccount()
  const me = address?.toLowerCase() || ''

  const [conversations, setConversations] = useState<Conv[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const activeIdRef = useRef<string | null>(null)
  const [hiddenConvs, setHiddenConvs] = useState<Set<string>>(() => getHidden())

  // Build username → address reverse lookup
  const usernameToAddress: Record<string, string> = {}
  Object.entries(profiles).forEach(([addr, p]) => {
    if (p?.username) usernameToAddress[p.username.toLowerCase()] = addr
  })

  const peerOf = useCallback((cid: string) => {
    const parts = cid.split('_')
    return parts[0] === me ? parts[1] : parts[0]
  }, [me])

  const reportUnread = useCallback((convs: Conv[], seenMap?: Record<string, number>) => {
    const seen = seenMap ?? getSeenMap()
    const count = convs.filter(c => c.lastSentAt > 0 && c.lastSentAt > (seen[c.convId] ?? 0)).length
    onUnreadCount?.(count)
  }, [onUnreadCount])

  const refreshConversations = useCallback(async () => {
    if (!me) return
    try {
      const res = await fetch(`/api/messages/conversations?address=${me}`, { cache: 'no-store' })
      const data = await res.json()
      if (Array.isArray(data.conversations)) {
        setConversations(data.conversations)
        reportUnread(data.conversations)
      }
    } catch {}
  }, [me, reportUnread])

  const loadThread = useCallback(async (cid: string) => {
    if (!me) return
    const peer = peerOf(cid)
    try {
      const res = await fetch(`/api/messages/thread?a=${me}&b=${peer}`, { cache: 'no-store' })
      const data = await res.json()
      if (Array.isArray(data.messages)) {
        setMessages(prev => {
          const next: Msg[] = data.messages.map((m: any) => ({ id: m.id, from: m.from, text: m.text, ts: m.ts }))
          // avoid pointless re-render if identical length + last id
          if (prev.length === next.length && prev[prev.length - 1]?.id === next[next.length - 1]?.id) return prev
          return next
        })
      }
    } catch {}
  }, [me, peerOf])

  // Initial load + poll conversation list
  useEffect(() => {
    if (!me) return
    refreshConversations()
    const t = setInterval(refreshConversations, 5000)
    return () => clearInterval(t)
  }, [me, refreshConversations])

  // Poll the open thread
  useEffect(() => {
    activeIdRef.current = activeId
    if (!activeId) return
    loadThread(activeId)
    const t = setInterval(() => { if (activeIdRef.current) loadThread(activeIdRef.current) }, 3000)
    return () => clearInterval(t)
  }, [activeId, loadThread])

  // Handle "Send Message" trigger from another tab
  useEffect(() => {
    if (!pendingTarget || !me) return
    ;(async () => {
      await startDm(pendingTarget)
      onPendingHandled?.()
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTarget, me])

  const openConversation = (cid: string) => {
    const seen = getSeenMap()
    seen[cid] = Date.now()
    saveSeenMap(seen)
    setActiveId(cid); setMessages([])
    reportUnread(conversations, seen)
  }

  // Scroll the message list's own scrollTop rather than endRef.scrollIntoView():
  // scrollIntoView walks up every scrollable ancestor, including the page itself,
  // which would drag the whole page down behind the fixed mobile header.
  useEffect(() => {
    const container = endRef.current?.parentElement
    container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const send = async () => {
    const text = draft.trim()
    if (!text || !activeId || !me) return
    const peer = peerOf(activeId)
    setSending(true)
    // optimistic
    const optimistic: Msg = { id: `tmp-${Date.now()}`, from: me, text, ts: Date.now() }
    setMessages(prev => [...prev, optimistic])
    setDraft('')
    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: me, to: peer, text }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Send failed') }
      await loadThread(activeId)
      refreshConversations()
    } catch (e: any) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      setDraft(text)
      alert(e?.message || 'Send failed')
    }
    setSending(false)
  }

  const startDm = async (query: string) => {
    if (!query || !me) return
    const q = query.trim()
    let peer = usernameToAddress[q.toLowerCase()] ?? q
    if (!/^0x[a-fA-F0-9]{40}$/.test(peer)) {
      alert('User not found. Enter an exact username or 0x address.')
      return
    }
    peer = peer.toLowerCase()
    if (peer === me) { alert("You can't message yourself"); return }
    const cid = convIdOf(me, peer)
    setShowNew(false); setSearch('')
    // Add a placeholder row so the conversation shows immediately
    setConversations(prev => prev.some(c => c.convId === cid) ? prev : [{ convId: cid, peer, lastMessage: '', lastSentAt: 0 }, ...prev])
    openConversation(cid)
  }

  // Username if known, otherwise a truncated address
  const labelFor = (peer: string) => {
    if (!peer) return 'Unknown'
    const uname = profiles[peer.toLowerCase()]?.username
    return uname || `${peer.slice(0, 6)}…${peer.slice(-4)}`
  }

  const timeAgo = (ms: number) => {
    if (!ms) return ''
    const d = (Date.now() - ms) / 1000
    if (d < 60) return 'now'
    if (d < 3600) return `${Math.floor(d / 60)}m`
    if (d < 86400) return `${Math.floor(d / 3600)}h`
    if (d < 604800) return `${Math.floor(d / 86400)}d`
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  // Search suggestions from profiles
  const suggestions = search.length > 1 ? Object.entries(profiles)
    .filter(([addr, p]) => {
      const name = p?.username?.toLowerCase() || ''
      const qq = search.toLowerCase()
      return name.includes(qq) || addr.toLowerCase().includes(qq)
    })
    .slice(0, 5) : []

  if (!address) return <div className="p-8 text-center text-[#8A919E]">Connect your wallet to use messages.</div>

  const seenMap = getSeenMap()
  const activePeer = activeId ? peerOf(activeId) : ''
  const activePeerLabel = activeId ? labelFor(activePeer) : ''
  const visibleConvs = conversations.filter(c => !hiddenConvs.has(c.convId))

  return (
    <div className="messages-shell flex overflow-hidden">
      {/* Sidebar — full width on mobile until a thread is opened, fixed column on desktop */}
      <div className={`${activeId ? 'hidden md:flex' : 'flex'} w-full md:w-72 md:border-r border-[#EEF1F5] flex-col min-h-0`}>
        <div className="p-3 border-b border-[#EEF1F5] flex items-center justify-between flex-shrink-0">
          <h3 className="font-black text-[#0A0B0D]">Messages</h3>
          <button onClick={() => setShowNew(true)} className="bg-[#0052FF] hover:bg-[#1652F0] text-white px-3 py-1.5 rounded-lg text-xs font-bold">+ New</button>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0">
          {visibleConvs.length === 0 ? (
            <p className="p-4 text-xs text-[#8A919E] text-center">No conversations yet</p>
          ) : visibleConvs.map(c => {
            const isUnread = c.lastSentAt > 0 && c.lastSentAt > (seenMap[c.convId] ?? 0)
            const label = labelFor(c.peer)
            return (
              <div key={c.convId} className={`group flex items-center border-b border-[#F7F9FC] hover:bg-[#F7F9FC] transition-colors ${activeId === c.convId ? 'bg-[#E6EEFF]' : ''}`}>
                <button onClick={() => openConversation(c.convId)} className="flex-1 text-left p-3 flex items-center gap-3 min-w-0">
                  <Avatar addr={c.peer} profiles={profiles} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {isUnread && <span className="w-2 h-2 rounded-full bg-[#0052FF] flex-shrink-0" />}
                      <p className={`text-sm truncate ${isUnread ? 'font-black' : 'font-bold'} text-[#0A0B0D]`}>
                        {label}
                      </p>
                      {c.lastSentAt > 0 && <span className="text-[11px] text-[#8A919E] flex-shrink-0 ml-auto">{timeAgo(c.lastSentAt)}</span>}
                    </div>
                    {c.lastMessage && <p className={`text-xs truncate mt-0.5 ${isUnread ? 'text-[#0A0B0D] font-semibold' : 'text-[#5B6271]'}`}>{c.lastMessage}</p>}
                  </div>
                </button>
                <button
                  onClick={() => {
                    addHidden(c.convId)
                    setHiddenConvs(getHidden())
                    if (activeId === c.convId) { setActiveId(null); setMessages([]) }
                  }}
                  className="opacity-0 group-hover:opacity-100 mr-2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-red-100 text-[#8A919E] hover:text-red-500 text-xs transition-all flex-shrink-0"
                  title="Delete conversation">
                  🗑
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Chat area — takes over the full screen on mobile once a thread is opened */}
      <div className={`${activeId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-h-0`}>
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-[#8A919E] text-sm">Select a conversation</div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-[#EEF1F5] p-3 flex-shrink-0">
              <button onClick={() => { setActiveId(null); setMessages([]) }}
                className="md:hidden w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F0F2F5] text-[#0A0B0D] flex-shrink-0 text-lg" aria-label="Back">
                ←
              </button>
              <Avatar addr={activePeer} profiles={profiles} size="sm" />
              <p className="font-bold text-sm text-[#0A0B0D] truncate">{activePeerLabel}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
              {messages.length === 0 && (
                <p className="text-center text-xs text-[#8A919E] mt-4">No messages yet. Say hi 👋</p>
              )}
              {messages.map(m => {
                const mine = m.from.toLowerCase() === me
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm ${mine ? 'bg-[#0052FF] text-white' : 'bg-[#F0F2F5] text-[#0A0B0D]'}`}>
                      {m.text}
                    </div>
                  </div>
                )
              })}
              <div ref={endRef} />
            </div>
            <div className="border-t border-[#EEF1F5] p-3 flex gap-2 flex-shrink-0 pb-safe">
              <input value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Type a message…"
                className="flex-1 bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#0052FF]" />
              <button onClick={send} disabled={sending || !draft.trim()}
                className="bg-[#0052FF] hover:bg-[#1652F0] text-white px-5 py-2 rounded-xl font-bold text-sm disabled:opacity-40 transition-colors flex-shrink-0">
                Send
              </button>
            </div>
          </>
        )}
      </div>

      {/* New conversation modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-lg mb-2 text-[#0A0B0D]">New Message</h3>
            <p className="text-xs text-[#5B6271] mb-3">Search by username or enter a 0x address.</p>
            <div className="relative">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Username or 0x address…"
                className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0052FF] mb-1" />
              {suggestions.length > 0 && (
                <div className="border border-[#E4E7EB] rounded-xl overflow-hidden mb-2">
                  {suggestions.map(([addr, p]) => (
                    <button key={addr} onClick={() => setSearch(p?.username || addr)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#F0F4FF] text-left">
                      <Avatar addr={addr} profiles={profiles} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#0A0B0D] truncate">{p?.username || addr.slice(0, 10)}</p>
                        <p className="text-xs text-[#8A919E] truncate">{addr.slice(0, 8)}…</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => { setShowNew(false); setSearch('') }} className="flex-1 bg-[#F0F2F5] text-[#0A0B0D] py-2.5 rounded-xl font-bold text-sm">Cancel</button>
              <button onClick={() => startDm(search)} disabled={sending || !search}
                className="flex-1 bg-[#0052FF] hover:bg-[#1652F0] text-white py-2.5 rounded-xl font-bold text-sm disabled:opacity-40">
                {sending ? '…' : 'Message'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
