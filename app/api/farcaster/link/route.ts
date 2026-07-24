import { NextRequest, NextResponse } from 'next/server'
import { linkAddrFid, isAddr } from '../../../../lib/notifyStore'
import { verifyWalletAuth } from '../../../../lib/walletAuth'

// The mini-app client posts its { fid, address } here so the on-chain watcher
// (which only sees wallet addresses in events) can map a post author back to a
// Farcaster FID and deliver an in-app notification.
//
// Requires a signature proving control of `address`, bound to this exact fid
// — otherwise a signature obtained for one fid could be replayed with a
// different (attacker-chosen) fid in the body, silently rerouting the
// victim's outgoing notifications to the attacker's Farcaster inbox.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { fid, address, timestamp, signature } = await req.json()
    const f = Number(fid)
    if (!f || !isAddr(address || '')) {
      return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 })
    }
    if (!(await verifyWalletAuth('link', address, timestamp, signature, String(f)))) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
    await linkAddrFid(address, f)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'failed' }, { status: 500 })
  }
}
