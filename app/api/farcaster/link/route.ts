import { NextRequest, NextResponse } from 'next/server'
import { linkAddrFid, isAddr } from '../../../../lib/notifyStore'
import { verifyWalletAuth } from '../../../../lib/walletAuth'

// The mini-app client posts its { fid, address } here so the on-chain watcher
// (which only sees wallet addresses in events) can map a post author back to a
// Farcaster FID and deliver an in-app notification.
//
// Requires a signature proving control of `address` — otherwise anyone could
// POST an arbitrary victim address here and redirect that victim's outgoing
// notifications to their own FID.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { fid, address, timestamp, signature } = await req.json()
    const f = Number(fid)
    if (!f || !isAddr(address || '')) {
      return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 })
    }
    if (!(await verifyWalletAuth('link', address, timestamp, signature))) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
    await linkAddrFid(address, f)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'failed' }, { status: 500 })
  }
}
