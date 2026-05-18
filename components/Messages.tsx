'use client'

import { useEffect, useRef, useState } from 'react'
import { useAccount, useSignMessage, useWriteContract } from 'wagmi'
import { hexToBytes } from 'viem'
import { TOOLS_ADDRESS, TOOLS_ABI } from '@/lib/toolsContracts'

type Conv = {
  id: string
  peerAddress: string
  lastMessage: string
  lastSentAt: number
}

type Msg = {
  id: string
  sender: string
  content: string
  sentAt: number
}

type Props = {
  fixedFee: bigint
  logTx: (hash: string, type: string) => void
}

export default function Messages({ fixedFee, logTx }: Props) {
  const { address } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { writeContractAsync } = useWriteContract()

  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string>('')
  const [conversations, setConversations] = useState<Conv[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [newPeer, setNewPeer] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [sending, setSending] = useState(false)
  const [paidPeers, setPaidPeers] = useState<Set<string>>(new Set())
  const clientRef = useRef<any>(null)
  const activeConvRef = useRef<any>(null)
  const streamRef = useRef<any>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!address) return
    try {
      const raw = localStorage.getItem(`flamebase_paid_peers_${address.toLowerCase()}`)
      if (raw) setPaidPeers(new Set(JSON.parse(raw)))
    } catch {}
  }, [address])

  const markPeerPaid = (peer: string) => {
    if (!address) return
    const key = `flamebase_paid_peers_${address.toLowerCase()}`
    const next = new Set(paidPeers); next.add(peer.toLowerCase())
    setPaidPeers(next)
    localStorage.setItem(key, JSON.stringify([...next]))
  }

  const connect = async () => {
    if (!address) return
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
      const client = await (Client as any).create(signer, { env: 'production' })
      clientRef.current = client
      await client.conversations.sync()
      await refreshConversations()
      setStatus('ready')
    } catch (e: any) {
      console.error('XMTP connect error', e)
      setError(e?.message || 'Connection failed')
      setStatus('error')
    }
  }

  const refreshConversations = async () => {
    const client = clientRef.current
    if (!client) return
    const dms = await client.conversations.listDms()
    const out: Conv[] = []
    for (const dm of dms) {
      try {
        const peerInbox = await dm.peerInboxId?.()
        const msgs = await dm.messages({ limit: 1 })
        const last = msgs[0]
        out.push({
          id: dm.id,
          peerAddress: peerInbox || dm.id.slice(0, 10),
          lastMessage: last?.content?.toString() || '(no messages)',
          lastSentAt: last ? Number(last.sentAtNs / 1_000_000n) : 0,
        })
      } catch {}
    }
    out.sort((a, b) => b.lastSentAt - a.lastSentAt)
    setConversations(out)
  }

  const openConversation = async (id: string) => {
    const client = clientRef.current
    if (!client) return
    setActiveId(id); setMessages([])
    const dm = await client.conversations.getConversationById(id)
    activeConvRef.current = dm
    if (!dm) return
    const raw = await dm.messages()
    const mapped: Msg[] = raw.map((m: any) => ({
      id: m.id,
      sender: m.senderInboxId || '?',
      content: typeof m.content === 'string' ? m.content : '(unsupported)',
      sentAt: Number(m.sentAtNs / 1_000_000n),
    })).sort((a: Msg, b: Msg) => a.sentAt - b.sentAt)
    setMessages(mapped)
    if (streamRef.current) try { streamRef.current.return?.() } catch {}
    streamRef.current = dm.streamMessages()
    ;(async () => {
      try {
        for await (const m of streamRef.current as AsyncIterable<any>) {
          setMessages(prev => [...prev, {
            id: m.id, sender: m.senderInboxId || '?',
            content: typeof m.content === 'string' ? m.content : '(unsupported)',
            sentAt: Number(m.sentAtNs / 1_000_000n),
          }])
        }
      } catch {}
    })()
  }

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])

  const send = async () => {
    const dm = activeConvRef.current
    if (!dm || !draft.trim()) return
    setSending(true)
    try { await dm.send(draft); setDraft('') } catch (e: any) { alert(e?.message || 'Send failed') }
    setSending(false)
  }

  const startNew = async () => {
    if (!newPeer || !address || !clientRef.current) return
    const peer = newPeer.trim().toLowerCase()
    if (!/^0x[a-f0-9]{40}$/.test(peer)) { alert('Enter a valid 0x address'); return }
    if (peer === address.toLowerCase()) { alert("You can't message yourself"); return }
    setSending(true)
    try {
      if (!paidPeers.has(peer)) {
        const hash = await writeContractAsync({
          address: TOOLS_ADDRESS, abi: TOOLS_ABI, functionName: 'log',
          args: [`dm:${peer}`], value: fixedFee,
        })
        logTx(hash, 'dm-open')
        markPeerPaid(peer)
      }
      const client = clientRef.current
      const canMessage = await client.canMessage([{ identifier: peer, identifierKind: 0 }])
      const reachable = canMessage.get(peer) ?? canMessage.get(peer.toLowerCase())
      if (!reachable) {
        alert("This address hasn't activated XMTP yet. They need to open the Messages tab and connect first.")
        setSending(false); return
      }
      const dm = await client.conversations.newDmWithIdentifier({ identifier: peer, identifierKind: 0 })
      setShowNew(false); setNewPeer('')
      await refreshConversations()
      await openConversation(dm.id)
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Could not open conversation')
    }
    setSending(false)
  }

  if (!address) {
    return <div className="p-8 text-center text-[#8A919E]">Connect your wallet to use messages.</div>
  }

  if (status === 'idle' || status === 'error') {
    return (
      <div className="p-8 text-center">
        <div className="text-4xl mb-3">💬</div>
        <h3 className="font-black text-xl mb-2 text-[#0A0B0D]">XMTP Messaging</h3>
        <p className="text-sm text-[#5B6271] mb-4">End-to-end encrypted, decentralized.</p>
        {error && <p className="text-xs text-red-500 mb-3 break-words">{error}</p>}
        <button onClick={connect} className="bg-[#0052FF] hover:bg-[#1652F0] text-white px-6 py-2.5 rounded-xl font-bold transition-colors">
          Connect to XMTP
        </button>
      </div>
    )
  }

  if (status === 'connecting') {
    return <div className="p-8 text-center text-[#5B6271]">Connecting to XMTP… sign in your wallet</div>
  }

  return (
    <div className="flex h-[calc(100vh-120px)]">
      {/* Conversation list */}
      <div className="w-72 border-r border-[#EEF1F5] overflow-y-auto">
        <div className="p-3 border-b border-[#EEF1F5] flex items-center justify-between">
          <h3 className="font-black text-[#0A0B0D]">Conversations</h3>
          <button onClick={() => setShowNew(true)} className="bg-[#0052FF] hover:bg-[#1652F0] text-white px-3 py-1.5 rounded-lg text-xs font-bold">+ New</button>
        </div>
        {conversations.length === 0 ? (
          <p className="p-4 text-xs text-[#8A919E] text-center">No conversations yet</p>
        ) : conversations.map(c => (
          <button key={c.id} onClick={() => openConversation(c.id)}
            className={`w-full text-left p-3 border-b border-[#F7F9FC] hover:bg-[#F7F9FC] transition-colors ${activeId === c.id ? 'bg-[#E6EEFF]' : ''}`}>
            <p className="font-bold text-sm text-[#0A0B0D] truncate">{c.peerAddress.slice(0, 8)}…{c.peerAddress.slice(-4)}</p>
            <p className="text-xs text-[#5B6271] truncate mt-0.5">{c.lastMessage}</p>
          </button>
        ))}
      </div>

      {/* Active conversation */}
      <div className="flex-1 flex flex-col">
        {!activeId ? (
          <div className="flex-1 flex items-center justify-center text-[#8A919E] text-sm">Select a conversation</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map(m => {
                const mine = address && m.sender && clientRef.current?.inboxId && m.sender === clientRef.current.inboxId
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
            <div className="border-t border-[#EEF1F5] p-3 flex gap-2">
              <input value={draft} onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder="Type a message…"
                className="flex-1 bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-[#0052FF]" />
              <button onClick={send} disabled={sending || !draft.trim()}
                className="bg-[#0052FF] hover:bg-[#1652F0] text-white px-5 py-2 rounded-xl font-bold text-sm disabled:opacity-40 transition-colors">
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
            <h3 className="font-black text-lg mb-2 text-[#0A0B0D]">New Conversation</h3>
            <p className="text-xs text-[#5B6271] mb-3">Starting a new conversation costs <b>$0.04</b> (one-time). All messages after are free.</p>
            <input value={newPeer} onChange={e => setNewPeer(e.target.value)} placeholder="0x… address"
              className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-[#0052FF] mb-3" />
            <div className="flex gap-2">
              <button onClick={() => setShowNew(false)} className="flex-1 bg-[#F0F2F5] text-[#0A0B0D] py-2.5 rounded-xl font-bold text-sm">Cancel</button>
              <button onClick={startNew} disabled={sending || !newPeer}
                className="flex-1 bg-[#0052FF] hover:bg-[#1652F0] text-white py-2.5 rounded-xl font-bold text-sm disabled:opacity-40">
                {sending ? '…' : (paidPeers.has(newPeer.trim().toLowerCase()) ? 'Open' : 'Pay & Open')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
