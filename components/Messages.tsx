'use client'

import { useEffect, useRef, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { hexToBytes } from 'viem'
import Avatar from './Avatar'

// Global client — survives tab switches, only one signature per browser session
let _xmtpClient: any = null

// inboxId → wallet address, resolved via client.preferences.getInboxStates().
// Cached at module scope so we don't re-resolve the same peer on every refresh.
const _peerAddressCache: Record<string, string> = {}

type Conv = {
  id: string
  peerInboxId: string
  peerAddress: string
  lastMessage: string
  lastSentAt: number
}

type Msg = {
  id: string
  senderInboxId: string
  content: string
  sentAt: number
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

export default function Messages({ profiles, fixedFee, pendingTarget, onPendingHandled, onUnreadCount }: Props) {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()

  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>(() => _xmtpClient ? 'ready' : 'idle')
  const [error, setError] = useState('')
  const [conversations, setConversations] = useState<Conv[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [sending, setSending] = useState(false)
  const activeConvRef = useRef<any>(null)
  const streamRef = useRef<any>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const connectingRef = useRef(false)
  const [hiddenConvs, setHiddenConvs] = useState<Set<string>>(() => getHidden())

  // Build username → address reverse lookup
  const usernameToAddress: Record<string, string> = {}
  Object.entries(profiles).forEach(([addr, p]) => {
    if (p?.username) usernameToAddress[p.username.toLowerCase()] = addr
  })

  const reportUnread = (convs: Conv[], seenMap?: Record<string, number>) => {
    const seen = seenMap ?? getSeenMap()
    const count = convs.filter(c => c.lastSentAt > 0 && c.lastSentAt > (seen[c.id] ?? 0)).length
    onUnreadCount?.(count)
  }

  // On mount: auto-connect if wallet is connected (no manual button needed)
  useEffect(() => {
    if (_xmtpClient) {
      if (status !== 'ready') setStatus('ready')
      refreshConversations()
    } else if (address && !connectingRef.current) {
      connect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-connect when a pending DM target arrives and we're not yet connected
  useEffect(() => {
    if (pendingTarget && status === 'idle' && !connectingRef.current) {
      connect()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTarget])

  // Handle "Send Message" trigger from another tab
  useEffect(() => {
    if (!pendingTarget) return
    if (status === 'connecting') return
    if (status !== 'ready') {
      setShowNew(true)
      setSearch(pendingTarget)
      onPendingHandled?.()
      return
    }
    ;(async () => {
      await startDm(pendingTarget)
      onPendingHandled?.()
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTarget, status])

  const connect = async () => {
    if (!address) return
    if (_xmtpClient) { setStatus('ready'); await refreshConversations(); return }
    if (connectingRef.current) return
    connectingRef.current = true
    setStatus('connecting'); setError('')
    try {
      const { Client } = await import('@xmtp/browser-sdk')
      const signer = {
        type: 'EOA' as const,
        getIdentifier: () => ({ identifier: address, identifierKind: 0 as any }),
        signMessage: async (message: string) => {
          const sig = await signMessageAsync({ message })
          return hexToBytes(sig as `0x${string}`)
        },
      }
      _xmtpClient = await (Client as any).create(signer, { env: 'production' })
      await _xmtpClient.conversations.sync()
      await refreshConversations()
      setStatus('ready')
    } catch (e: any) {
      console.error('XMTP connect error', e)
      setError(e?.message || 'Connection failed')
      setStatus('error')
    }
    connectingRef.current = false
  }

  // Resolve XMTP inboxIds to real Ethereum addresses (the inboxId itself is an
  // internal XMTP hash, not the peer's wallet address — it must never be shown
  // to the user or used for a profiles[] lookup directly).
  const resolvePeerAddresses = async (inboxIds: string[]) => {
    const unresolved = [...new Set(inboxIds.filter(id => id && !_peerAddressCache[id]))]
    if (!unresolved.length || !_xmtpClient) return
    try {
      const states = await _xmtpClient.preferences.getInboxStates(unresolved)
      for (const state of states) {
        const ethId = state.accountIdentifiers?.find((i: any) => i.identifierKind === 0)
        if (ethId) _peerAddressCache[state.inboxId] = ethId.identifier.toLowerCase()
      }
    } catch (e) {
      console.error('Failed to resolve peer addresses', e)
    }
  }

  const refreshConversations = async () => {
    if (!_xmtpClient) return
    const dms = await _xmtpClient.conversations.listDms()
    const rows: { id: string; peerInboxId: string; lastMessage: string; lastSentAt: number }[] = []
    for (const dm of dms) {
      try {
        const last = await dm.lastMessage().catch(() => null)
        const peerInboxId = await dm.peerInboxId().catch(() => '')
        rows.push({
          id: dm.id,
          peerInboxId,
          lastMessage: last && typeof last.content === 'string' ? last.content : '',
          lastSentAt: last ? Number(last.sentAtNs / 1_000_000n) : 0,
        })
      } catch {}
    }
    await resolvePeerAddresses(rows.map(r => r.peerInboxId))
    const out: Conv[] = rows
      .map(r => ({ ...r, peerAddress: _peerAddressCache[r.peerInboxId] || '' }))
      .sort((a, b) => b.lastSentAt - a.lastSentAt)
    setConversations(out)
    reportUnread(out)
  }

  // Username if known, otherwise a truncated address, otherwise a truncated
  // inboxId as a last resort (e.g. address still resolving).
  const getPeerLabel = (c: { peerAddress: string; peerInboxId: string }) => {
    if (c.peerAddress) {
      const uname = profiles[c.peerAddress]?.username
      if (uname) return uname
      return `${c.peerAddress.slice(0, 6)}…${c.peerAddress.slice(-4)}`
    }
    return c.peerInboxId ? `${c.peerInboxId.slice(0, 8)}…${c.peerInboxId.slice(-4)}` : 'Unknown'
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

  const openConversation = async (id: string) => {
    if (!_xmtpClient) return
    // Mark this conversation as read
    const seen = getSeenMap()
    seen[id] = Date.now()
    saveSeenMap(seen)
    setActiveId(id); setMessages([])
    reportUnread(conversations, seen)
    const dm = await _xmtpClient.conversations.getConversationById(id)
    activeConvRef.current = dm
    if (!dm) return
    const raw = await dm.messages()
    const mapped: Msg[] = raw.map((m: any) => ({
      id: m.id,
      senderInboxId: m.senderInboxId || '',
      content: typeof m.content === 'string' ? m.content : '',
      sentAt: Number(m.sentAtNs / 1_000_000n),
    })).sort((a: Msg, b: Msg) => a.sentAt - b.sentAt).filter((m: Msg) => m.content)
    setMessages(mapped)
    if (streamRef.current) try { streamRef.current.end?.() } catch {}
    try {
      streamRef.current = dm.stream(
        (m: any) => {
          if (!m || typeof m.content !== 'string') return
          setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, {
            id: m.id,
            senderInboxId: m.senderInboxId || '',
            content: m.content,
            sentAt: Number(m.sentAtNs / 1_000_000n),
          }])
        },
        () => {},
      )
    } catch {}
  }

  // Scroll the message list's own scrollTop rather than endRef.scrollIntoView():
  // scrollIntoView walks up every scrollable ancestor, including the page itself
  // (the page is taller than the viewport because of the site footer below the
  // tab content), so it was dragging the whole page down and hiding the thread
  // header behind the fixed mobile header.
  useEffect(() => {
    const container = endRef.current?.parentElement
    container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const send = async () => {
    const dm = activeConvRef.current
    if (!dm || !draft.trim()) return
    setSending(true)
    try {
      await dm.sendText(draft)
      setDraft('')
    } catch (e: any) {
      console.error('Send error', e)
      alert(e?.message || 'Send failed')
    }
    setSending(false)
  }

  const startDm = async (query: string) => {
    if (!query || !_xmtpClient) return
    setSending(true)
    try {
      // Resolve: username → address, or use raw 0x address
      const q = query.trim()
      let peer = usernameToAddress[q.toLowerCase()] ?? q
      if (!/^0x[a-fA-F0-9]{40}$/.test(peer)) {
        alert('User not found. Enter an exact username or 0x address.')
        setSending(false); return
      }
      peer = peer.toLowerCase()
      if (peer === address?.toLowerCase()) { alert("You can't message yourself"); setSending(false); return }

      const canMessage = await _xmtpClient.canMessage([{ identifier: peer, identifierKind: 0 }])
      const reachable = canMessage.get(peer) ?? canMessage.get(peer.toLowerCase())
      if (!reachable) {
        alert("This user hasn't activated XMTP yet. They need to open Messages and connect first.")
        setSending(false); return
      }
      const dm = await _xmtpClient.conversations.createDmWithIdentifier({ identifier: peer, identifierKind: 0 })
      setShowNew(false); setSearch('')
      await refreshConversations()
      await openConversation(dm.id)
    } catch (e: any) {
      alert(e?.message || 'Could not start conversation')
    }
    setSending(false)
  }

  // Search suggestions from profiles
  const suggestions = search.length > 1 ? Object.entries(profiles)
    .filter(([addr, p]) => {
      const name = p?.username?.toLowerCase() || ''
      const q = search.toLowerCase()
      return name.includes(q) || addr.toLowerCase().includes(q)
    })
    .slice(0, 5) : []

  if (!address) return <div className="p-8 text-center text-[#8A919E]">Connect your wallet to use messages.</div>

  if (status === 'idle') {
    return <div className="p-8 text-center text-[#5B6271]">Connecting… sign the request in your wallet</div>
  }

  if (status === 'error') {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-red-500 mb-3 break-words">{error || 'Connection failed'}</p>
        <button onClick={connect} className="bg-[#0052FF] hover:bg-[#1652F0] text-white px-6 py-2.5 rounded-xl font-bold transition-colors">
          Retry
        </button>
      </div>
    )
  }

  if (status === 'connecting') {
    return <div className="p-8 text-center text-[#5B6271]">Connecting… sign the request in your wallet</div>
  }

  const seenMap = getSeenMap()
  const activeConv = conversations.find(c => c.id === activeId)
  const activePeerLabel = activeConv ? getPeerLabel(activeConv) : ''

  return (
    <div className="messages-shell flex overflow-hidden">
      {/* Sidebar — full width on mobile until a thread is opened, fixed column on desktop */}
      <div className={`${activeId ? 'hidden md:flex' : 'flex'} w-full md:w-72 md:border-r border-[#EEF1F5] flex-col min-h-0`}>
        <div className="p-3 border-b border-[#EEF1F5] flex items-center justify-between flex-shrink-0">
          <h3 className="font-black text-[#0A0B0D]">Messages</h3>
          <button onClick={() => setShowNew(true)} className="bg-[#0052FF] hover:bg-[#1652F0] text-white px-3 py-1.5 rounded-lg text-xs font-bold">+ New</button>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0">
          {conversations.filter(c => !hiddenConvs.has(c.id)).length === 0 ? (
            <p className="p-4 text-xs text-[#8A919E] text-center">No conversations yet</p>
          ) : conversations.filter(c => !hiddenConvs.has(c.id)).map(c => {
            const isUnread = c.lastSentAt > 0 && c.lastSentAt > (seenMap[c.id] ?? 0)
            const label = getPeerLabel(c)
            return (
              <div key={c.id} className={`group flex items-center border-b border-[#F7F9FC] hover:bg-[#F7F9FC] transition-colors ${activeId === c.id ? 'bg-[#E6EEFF]' : ''}`}>
                <button onClick={() => openConversation(c.id)} className="flex-1 text-left p-3 flex items-center gap-3 min-w-0">
                  {c.peerAddress
                    ? <Avatar addr={c.peerAddress} profiles={profiles} size="md" />
                    : <div className="w-10 h-10 rounded-full bg-[#E4E7EB] flex-shrink-0 animate-pulse" />}
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
                    addHidden(c.id)
                    setHiddenConvs(getHidden())
                    if (activeId === c.id) { setActiveId(null); setMessages([]) }
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
              {activeConv?.peerAddress
                ? <Avatar addr={activeConv.peerAddress} profiles={profiles} size="sm" />
                : <div className="w-8 h-8 rounded-full bg-[#E4E7EB] flex-shrink-0 animate-pulse" />}
              <p className="font-bold text-sm text-[#0A0B0D] truncate">{activePeerLabel}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
              {messages.map(m => {
                const mine = _xmtpClient?.inboxId && m.senderInboxId === _xmtpClient.inboxId
                return (
                  <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm ${mine ? 'bg-[#0052FF] text-white' : 'bg-[#F0F2F5] text-[#0A0B0D]'}`}>
                      {m.content}
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
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#0052FF] to-[#7B3FE4] flex items-center justify-center text-white text-xs font-black flex-shrink-0">
                        {(p?.username || addr)[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#0A0B0D] truncate">{p?.username || addr.slice(0,10)}</p>
                        <p className="text-xs text-[#8A919E] truncate">{addr.slice(0,8)}…</p>
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
