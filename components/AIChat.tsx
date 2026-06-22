'use client'

import { useEffect, useRef, useState } from 'react'
import { useAccount, useWalletClient } from 'wagmi'
import { askPremium } from '../lib/premiumAI'

type Message = { role: 'user' | 'assistant'; content: string; txHash?: string }

const SUGGESTIONS = [
  'What is Base blockchain?',
  'How do I earn ETH on FlameBase?',
  'What are the post fees?',
  'Explain XMTP messaging',
]

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hey! I'm FlameBase AI 🤖 Powered by Llama 3 via Groq (free). Ask me anything about Web3, Base, or how to use this platform!",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [premium, setPremium] = useState(true)
  const endRef = useRef<HTMLDivElement>(null)
  const { isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return

    // Premium requires a connected wallet to sign the payment.
    if (premium && (!isConnected || !walletClient)) {
      setMessages(prev => [...prev, { role: 'assistant', content: '🔌 Connect your wallet first to use Premium AI (pays $0.01 USDC on Base).' }])
      return
    }

    const userMsg: Message = { role: 'user', content }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      if (premium) {
        const r = await askPremium(walletClient!, next.map(({ role, content }) => ({ role, content })))
        if (r.content) {
          setMessages(prev => [...prev, { role: 'assistant', content: r.content!, txHash: r.txHash }])
        } else {
          setMessages(prev => [...prev, { role: 'assistant', content: r.status === 402 ? '⚠️ Payment was required but did not complete.' : 'Sorry, something went wrong.' }])
        }
      } else {
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: next, type: 'chat' }),
        })
        const data = await res.json()
        setMessages(prev => [...prev, { role: 'assistant', content: data.content || 'Sorry, something went wrong.' }])
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      const friendly = /reject|denied|cancel/i.test(msg)
        ? '❌ Payment cancelled.'
        : /insufficient|balance|transfer amount exceeds/i.test(msg)
          ? '💸 Not enough USDC on Base in your wallet (need $0.01).'
          : 'Connection error. Try again.'
      setMessages(prev => [...prev, { role: 'assistant', content: friendly }])
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#EEF1F5] flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#7B3FE4] to-[#0052FF] flex items-center justify-center text-xl flex-shrink-0">
          🤖
        </div>
        <div className="flex-1">
          <h2 className="font-black text-[#0A0B0D]">FlameBase AI</h2>
          <p className="text-xs text-[#5B6271]">{premium ? 'Premium · deeper answers · $0.01' : 'Llama 3 · Groq · Free'}</p>
        </div>
        {/* FREE ⟷ PREMIUM toggle */}
        <div className="flex items-center bg-[#F0F2F5] rounded-full p-1 text-sm font-bold shadow-sm">
          <button onClick={() => setPremium(false)}
            className={`px-4 py-2 rounded-full transition-colors ${!premium ? 'bg-green-100 text-green-700' : 'text-[#8A919E]'}`}>
            FREE
          </button>
          <button onClick={() => setPremium(true)}
            className={`px-4 py-2 rounded-full transition-colors ${premium ? 'bg-gradient-to-r from-[#7B3FE4] to-[#0052FF] text-white shadow' : 'text-[#8A919E]'}`}>
            ✨ PREMIUM
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#7B3FE4] to-[#0052FF] flex items-center justify-center text-xs mr-2 mt-1 flex-shrink-0">
                🤖
              </div>
            )}
            <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-[#0052FF] text-white rounded-br-sm'
                : 'bg-[#F0F2F5] text-[#0A0B0D] rounded-bl-sm'
            }`}>
              {m.content}
              {m.txHash && (
                <a href={`https://basescan.org/tx/${m.txHash}`} target="_blank" rel="noopener noreferrer"
                  className="block mt-2 text-[11px] font-semibold text-[#0052FF] hover:underline">
                  ✨ Paid $0.01 · view tx ↗
                </a>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-[#7B3FE4] to-[#0052FF] flex items-center justify-center text-xs mr-2 mt-1 flex-shrink-0">
              🤖
            </div>
            <div className="bg-[#F0F2F5] px-4 py-3 rounded-2xl rounded-bl-sm">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-[#8A919E] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-[#8A919E] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-[#8A919E] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Quick suggestions — only shown on first message */}
      {messages.length === 1 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {SUGGESTIONS.map(s => (
            <button key={s} onClick={() => send(s)}
              className="bg-[#F0F4FF] hover:bg-[#E6EEFF] text-[#0052FF] text-xs font-semibold px-3 py-1.5 rounded-full border border-[#D6E2FF] transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-[#EEF1F5] p-3 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={premium ? 'Premium question ($0.01 USDC)…' : 'Ask anything…'}
          className="flex-1 bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0052FF]"
        />
        <button onClick={() => send()} disabled={loading || !input.trim()}
          className={`text-white px-5 py-2 rounded-xl font-bold text-sm disabled:opacity-40 transition-colors ${premium ? 'bg-gradient-to-r from-[#7B3FE4] to-[#0052FF]' : 'bg-[#0052FF] hover:bg-[#1652F0]'}`}>
          {premium ? 'Pay & Ask' : 'Send'}
        </button>
      </div>
    </div>
  )
}
