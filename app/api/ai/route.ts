import { NextResponse } from 'next/server'
import { safeJson } from '../../../lib/safeJson'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
// Groq deprecated llama-3.3-70b-versatile (2026-06-17); openai/gpt-oss-120b is its replacement.
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

const SYSTEM_PROMPTS: Record<string, string> = {
  chat: `You are FlameBase AI — an assistant for a Web3 social media platform built on Base blockchain.
Help users with: posting tips, crypto/Web3 questions, Base network info, and general questions.
Keep answers concise and friendly. Use emojis occasionally. Never ask for private keys or seed phrases.`,

  improve: `You are a social media post optimizer. Improve the given text to be more engaging, punchy, and compelling.
Rules:
- Keep it under 280 characters if possible
- Keep the original meaning and tone
- Make it more attention-grabbing
- Return ONLY the improved text, no explanations, no quotes`,
}

export async function POST(request: Request) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 })
  }

  try {
    const { messages, type = 'chat' } = await request.json()
    if (!Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages must be an array' }, { status: 400 })
    }
    const systemPrompt = SYSTEM_PROMPTS[type] || SYSTEM_PROMPTS.chat

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        max_tokens: type === 'improve' ? 200 : 600,
        temperature: type === 'improve' ? 0.7 : 0.8,
      }),
      signal: AbortSignal.timeout(20000),
    })

    const data = await safeJson<any>(response)
    if (!response.ok) {
      console.error('Groq error', data)
      return NextResponse.json({ error: data?.error?.message || 'AI error' }, { status: 500 })
    }

    return NextResponse.json({ content: data.choices?.[0]?.message?.content || '' })
  } catch (e: any) {
    console.error('AI route error', e)
    return NextResponse.json({ error: e?.message || 'Request failed' }, { status: 500 })
  }
}
