'use client'

import { useEffect, useRef, useState } from 'react'
import { useAccount, useWalletClient, usePublicClient } from 'wagmi'
import { askPremium, type AgentReply } from '../lib/premiumAI'
import { executeAction, describeAction, validateAction, AgentActionError, type AgentAction } from '../lib/agentExec'

type ActionState = 'pending' | 'running' | 'done' | 'cancelled' | 'error'
type Message = {
  role: 'user' | 'assistant'
  content: string
  paymentTx?: string // premium $0.01 fee settlement tx
  action?: AgentAction
  actionState?: ActionState
  actionTx?: string // executed action tx
  actionError?: string
}

const SUGGESTIONS = [
  'Send 0.001 ETH to 0x…',
  'Like the latest post',
  'Post: gm FlameBase ☀️',
  'Do my daily check-in',
]

function friendlyError(e: unknown): string {
  // Our own intentional, actionable errors are shown as-is.
  if (e instanceof AgentActionError) return `⚠️ ${e.message}`
  const msg = e instanceof Error ? e.message : ''
  if (/reject|denied|cancel|user rejected/i.test(msg)) return '❌ Cancelled in wallet.'
  if (/insufficient|balance|exceeds/i.test(msg)) return '💸 Not enough balance for this on Base.'
  return 'Something went wrong. Try again.'
}

export default function AIChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hey! I'm FlameBase Agent 🤖 I can answer questions AND do on-chain actions on Base — send ETH/USDC, like/tip/comment/post, check in, deploy a token, or run a DAO proposal/vote. Just tell me what to do!",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const { isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const publicClient = usePublicClient()

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const push = (m: Message) => setMessages(prev => [...prev, m])
  const updateAt = (i: number, patch: Partial<Message>) =>
    setMessages(prev => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))

  const handleReply = (reply: AgentReply, paymentTx?: string) => {
    if (reply.type === 'error') {
      push({ role: 'assistant', content: reply.content || 'Sorry, something went wrong.', paymentTx })
    } else if (reply.type === 'action') {
      const action: AgentAction = { tool: reply.tool, args: reply.args }
      const err = validateAction(action)
      if (err) {
        push({ role: 'assistant', content: `${reply.note ? reply.note + '\n\n' : ''}⚠️ ${err}`, paymentTx })
      } else {
        push({
          role: 'assistant',
          content: reply.note || `I'll do this for you:`,
          action,
          actionState: 'pending',
          paymentTx,
        })
      }
    } else {
      push({ role: 'assistant', content: reply.content || 'Sorry, something went wrong.', paymentTx })
    }
  }

  const send = async (text?: string) => {
    const content = (text ?? input).trim()
    if (!content || loading) return

    if (!isConnected || !walletClient) {
      push({ role: 'assistant', content: '🔌 Connect your wallet first — the agent runs on x402 ($0.01 USDC per message on Base).' })
      return
    }

    const next = [...messages, { role: 'user' as const, content }]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const history = next.map(({ role, content }) => ({ role, content }))
      const r = await askPremium(walletClient, history)
      if (r.reply) {
        handleReply(r.reply, r.paymentTx)
      } else {
        // The wallet signed but the $0.01 couldn't be settled (most often: no
        // USDC on Base, or a facilitator hiccup) — show the real reason if we
        // have one instead of guessing.
        push({
          role: 'assistant',
          content: r.error
            ? `⚠️ Payment didn't go through: ${r.error}`
            : "⚠️ Payment didn't go through. Make sure you have a little USDC on Base, then try again.",
        })
      }
    } catch (e: unknown) {
      push({ role: 'assistant', content: friendlyError(e) })
    }
    setLoading(false)
  }

  const confirmAction = async (i: number) => {
    const m = messages[i]
    if (!m.action) return
    if (!isConnected || !walletClient || !publicClient) {
      updateAt(i, { actionError: 'Connect your wallet first.' })
      return
    }
    updateAt(i, { actionState: 'running', actionError: undefined })
    try {
      const hash = await executeAction(m.action, walletClient, publicClient)
      updateAt(i, { actionState: 'done', actionTx: hash })
    } catch (e) {
      updateAt(i, { actionState: 'error', actionError: friendlyError(e) })
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#EEF1F5] flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#7B3FE4] to-[#0052FF] flex items-center justify-center text-xl flex-shrink-0">
          🤖
        </div>
        <div className="flex-1">
          <h2 className="font-black text-[#0A0B0D]">FlameBase Agent</h2>
          <p className="text-xs text-[#5B6271]">Pay-per-use on-chain agent · powered by x402</p>
        </div>
        {/* x402 badge — every message is a $0.01 USDC micropayment on Base */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <span className="flex items-center gap-1.5 bg-gradient-to-r from-[#7B3FE4] to-[#0052FF] text-white text-xs font-black px-3 py-1.5 rounded-full shadow">
            <span>⚡</span>
            <span>402</span>
          </span>
          <span className="text-[10px] text-[#8A919E] font-bold">$0.01 / message</span>
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

              {/* Premium fee receipt */}
              {m.paymentTx && (
                <a href={`https://basescan.org/tx/${m.paymentTx}`} target="_blank" rel="noopener noreferrer"
                  className="block mt-2 text-[11px] font-semibold text-[#7B3FE4] hover:underline">
                  ✨ Paid $0.01 · view tx ↗
                </a>
              )}

              {/* Action card */}
              {m.action && (
                <div className="mt-3 bg-white border border-[#E4E7EB] rounded-xl p-3">
                  <p className="text-xs font-bold text-[#0A0B0D] mb-2">⚡ {describeAction(m.action)}</p>
                  {(!m.actionState || m.actionState === 'pending') && (
                    <div className="flex gap-2">
                      <button onClick={() => confirmAction(i)}
                        className="flex-1 bg-[#0052FF] hover:bg-[#1652F0] text-white text-xs font-bold py-2 rounded-lg transition-colors">
                        Confirm & Send
                      </button>
                      <button onClick={() => updateAt(i, { actionState: 'cancelled' })}
                        className="px-3 bg-[#F0F2F5] hover:bg-[#E4E7EB] text-[#5B6271] text-xs font-bold py-2 rounded-lg transition-colors">
                        Cancel
                      </button>
                    </div>
                  )}
                  {m.actionState === 'running' && <p className="text-xs text-[#8A919E]">⏳ Confirm in your wallet…</p>}
                  {m.actionState === 'done' && (
                    <a href={`https://basescan.org/tx/${m.actionTx}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-bold text-green-600 hover:underline">✅ Done · view tx ↗</a>
                  )}
                  {m.actionState === 'cancelled' && <p className="text-xs text-[#8A919E]">Cancelled.</p>}
                  {m.actionState === 'error' && (
                    <div>
                      <p className="text-xs text-red-500 mb-2">{m.actionError}</p>
                      <button onClick={() => confirmAction(i)} className="text-xs font-bold text-[#0052FF] hover:underline">Retry</button>
                    </div>
                  )}
                </div>
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
          placeholder="Ask or command ($0.01 USDC)…"
          className="flex-1 bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#0052FF]"
        />
        <button onClick={() => send()} disabled={loading || !input.trim()}
          className="text-white px-5 py-2 rounded-xl font-bold text-sm disabled:opacity-40 transition-colors bg-gradient-to-r from-[#7B3FE4] to-[#0052FF]">
          Pay & Ask
        </button>
      </div>
    </div>
  )
}
