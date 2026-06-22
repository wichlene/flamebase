import { NextResponse } from 'next/server'
import { runAgent } from '../../../lib/agentCore'

// Free agentic AI: the model can propose on-chain actions (executed client-side
// with the user's wallet after confirmation).
export async function POST(request: Request) {
  try {
    const { messages } = await request.json()
    const reply = await runAgent(messages ?? [])
    return NextResponse.json(reply)
  } catch (e: any) {
    return NextResponse.json({ type: 'error', content: e?.message || 'Request failed' }, { status: 500 })
  }
}
