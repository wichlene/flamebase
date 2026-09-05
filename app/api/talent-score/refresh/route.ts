import { NextRequest, NextResponse } from 'next/server'
import { withX402 } from '@x402/next'
import { isAddress } from 'viem'
import {
  getX402Server,
  builderCodeExtension,
  X402_PAY_TO,
  X402_NETWORK,
  x402SyncOnStart,
} from '../../../../lib/x402'
import { refreshTalentBuilderScore, refreshCooldownRemainingMs } from '../../../../lib/talentScore'

export const dynamic = 'force-dynamic'
export const maxDuration = 45

// Force-rescans the chain for a newer Talent Protocol attestation — useful
// after the user re-attests an updated score on talentprotocol.com, since
// the free /api/talent-score read only ever scans once per address and
// caches the result. Gated to once every 3 days per address: returning a
// non-2xx here cancels x402 settlement (same rule as /api/premium), so a
// request inside the cooldown costs the user nothing.
async function handler(request: NextRequest): Promise<NextResponse> {
  const { address } = await request.json().catch(() => ({ address: undefined }))
  if (!isAddress(address)) {
    return NextResponse.json({ error: 'valid address required' }, { status: 400 })
  }

  const remainingMs = await refreshCooldownRemainingMs(address)
  if (remainingMs > 0) {
    const hours = Math.ceil(remainingMs / 3_600_000)
    return NextResponse.json({ error: `You can refresh again in ${hours}h` }, { status: 429 })
  }

  try {
    const result = await refreshTalentBuilderScore(address)
    return NextResponse.json(result || { score: null })
  } catch (e) {
    console.error('talent-score refresh error', e)
    return NextResponse.json({ error: 'Refresh failed' }, { status: 502 })
  }
}

export const POST = withX402(
  handler,
  {
    accepts: {
      scheme: 'exact',
      payTo: X402_PAY_TO,
      price: '$0.05',
      network: X402_NETWORK,
    },
    description: 'FlameBase - refresh onchain Talent Protocol Builder Score',
    mimeType: 'application/json',
    extensions: builderCodeExtension(),
  },
  getX402Server(),
  undefined,
  undefined,
  x402SyncOnStart,
)
