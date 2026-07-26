import { NextRequest, NextResponse } from 'next/server'
import { getTop } from '../../../lib/leaderboardStore'

// Public read endpoint for the "Top Supporters" widget — total on-chain
// action count per address, built by app/api/leaderboard/scan.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const requested = Number(req.nextUrl.searchParams.get('n'))
  const n = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 25) : 5
  const leaderboard = await getTop(n)
  return NextResponse.json({ ok: true, leaderboard })
}
