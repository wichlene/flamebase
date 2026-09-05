import { NextRequest, NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { getTalentBuilderScore } from '../../../lib/talentScore'

// Real Talent Protocol Builder Score, read straight off the EAS attestation
// on Base — see lib/talentScore.ts for how. Cached per-address (first read
// after a fresh attestation may take a few seconds while it scans for the
// attestation's UID; every read after that is instant).
export const dynamic = 'force-dynamic'
export const maxDuration = 45

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address') || ''
  if (!isAddress(address)) {
    return NextResponse.json({ error: 'valid address required' }, { status: 400 })
  }
  try {
    const result = await getTalentBuilderScore(address)
    return NextResponse.json(result || { score: null })
  } catch (e) {
    console.error('talent-score error', e)
    return NextResponse.json({ score: null })
  }
}
