import { NextResponse } from 'next/server'
import { getAllTokens } from '../../../lib/b20Store'

// Public read endpoint for the Launchpad's DEX token list — pre-scanned by
// app/api/b20/scan, so the client does one fast fetch instead of hundreds of
// chunked eth_getLogs calls over a public RPC from the visitor's own device.
export const dynamic = 'force-dynamic'

export async function GET() {
  const tokens = await getAllTokens()
  return NextResponse.json({ ok: true, tokens })
}
