import { NextRequest, NextResponse } from 'next/server'
import { withX402 } from '@x402/next'
import {
  getX402Server,
  builderCodeExtension,
  X402_PAY_TO,
  X402_NETWORK,
  x402SyncOnStart,
} from '../../../lib/x402'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
// Premium tier uses the larger model and a higher token budget than the free
// /api/ai route.
const MODEL = 'llama-3.3-70b-versatile'

const SYSTEM_PROMPT = `You are FlameBase AI Premium — an expert assistant for a Web3 social platform on Base.
Give in-depth, well-structured answers about crypto, Base, on-chain strategy, and content.
Never ask for private keys or seed phrases.`

// The actual work: only runs after the x402 payment is verified.
async function handler(request: NextRequest): Promise<NextResponse> {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 })
  }
  try {
    const { messages } = await request.json()
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...(messages ?? [])],
        max_tokens: 1500,
        temperature: 0.8,
      }),
    })
    const data = await response.json()
    if (!response.ok) {
      return NextResponse.json({ error: data?.error?.message || 'AI error' }, { status: 500 })
    }
    return NextResponse.json({ content: data.choices?.[0]?.message?.content || '' })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Request failed' }, { status: 500 })
  }
}

// Wrap the handler with x402 payment protection. An unpaid request gets HTTP
// 402 with the payment requirements; the handler (and settlement) only runs
// after a valid payment. The builder-code extension attributes every
// settlement to FlameBase on-chain.
export const POST = withX402(
  handler,
  {
    accepts: {
      scheme: 'exact',
      payTo: X402_PAY_TO,
      price: '$0.01',
      network: X402_NETWORK,
    },
    description: 'FlameBase AI Premium - one in-depth AI completion',
    mimeType: 'application/json',
    extensions: builderCodeExtension(),
  },
  getX402Server(),
  undefined,
  undefined,
  x402SyncOnStart,
)
