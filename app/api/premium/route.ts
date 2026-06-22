import { NextRequest, NextResponse } from 'next/server'
import { withX402 } from '@x402/next'
import {
  getX402Server,
  builderCodeExtension,
  X402_PAY_TO,
  X402_NETWORK,
  x402SyncOnStart,
} from '../../../lib/x402'
import { runAgent } from '../../../lib/agentCore'

// The actual work: only runs after the x402 payment is verified. Premium uses
// the agent (so it can propose on-chain actions too) with a larger answer budget.
async function handler(request: NextRequest): Promise<NextResponse> {
  try {
    const { messages } = await request.json()
    const reply = await runAgent(messages ?? [], { maxTokens: 1500 })
    return NextResponse.json(reply)
  } catch (e: any) {
    return NextResponse.json({ type: 'error', content: e?.message || 'Request failed' }, { status: 500 })
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
