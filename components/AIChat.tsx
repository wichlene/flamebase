'use client'

import { useEffect, useRef, useState } from 'react'

type Message = { role: 'user' | 'assistant'; content: string }

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
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return
    const userMsg: Message = { role: 'user', content }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, type: 'chat' }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.content || 'Sorry, something went wrong.',
      }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Try again.' }])
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
          <p className="text-xs text-[#5B6271]">Llama 3 · Groq · Free</p>
        </div>
        <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full border border-green-200">FREE</span>
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
          placeholder="Ask anything…"
          className="flex-1 bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0052FF]"
        />
        <button onClick={() => send()} disabled={loading || !input.trim()}
          className="bg-[#0052FF] hover:bg-[#1652F0] text-white px-5 py-2 rounded-xl font-bold text-sm disabled:opacity-40 transition-colors">
          Send
        </button>
      </div>
    </div>
  )
}
