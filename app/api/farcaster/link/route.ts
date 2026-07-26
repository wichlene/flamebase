import { NextRequest, NextResponse } from 'next/server'
import { linkAddrFid, isAddr } from '../../../../lib/notifyStore'
import { verifyWalletAuth } from '../../../../lib/walletAuth'
import { verifyFarcasterFid } from '../../../../lib/farcasterAuth'

// The mini-app client posts its { fid, address } here so the on-chain watcher
// (which only sees wallet addresses in events) can map a post author back to a
// Farcaster FID and deliver an in-app notification.
//
// Requires TWO independent proofs, not one:
// 1. A wallet signature bound to this exact fid, proving control of `address`.
// 2. A Farcaster Quick Auth JWT, proving `address`'s caller is genuinely
//    signed in AS that fid.
// (1) alone used to be treated as sufficient, but it only proves "this
// address signed a message that happens to mention fid F" — literally
// anyone can sign a message claiming ANY fid, since the fid is just a plain
// number in the payload. Nothing stopped an attacker from linking their own
// wallet to a victim's fid, which silently rerouted the victim's outgoing
// notifications (who tipped them, comment previews) to the attacker's own
// Farcaster inbox. Quick Auth's JWT `sub` claim is Farcaster's own
// server-verified fid — the caller cannot forge being signed in as someone
// else's fid client-side.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { fid, address, timestamp, signature, quickAuthToken } = await req.json()
    const f = Number(fid)
    if (!f || !isAddr(address || '')) {
      return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 })
    }
    if (!(await verifyWalletAuth('link', address, timestamp, signature, String(f)))) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
    if (!(await verifyFarcasterFid(quickAuthToken, f))) {
      return NextResponse.json({ ok: false, error: 'fid ownership not verified' }, { status: 401 })
    }
    await linkAddrFid(address, f)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'failed' }, { status: 500 })
  }
}
