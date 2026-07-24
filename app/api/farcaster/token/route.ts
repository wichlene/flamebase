import { NextRequest, NextResponse } from 'next/server'
import { saveFcToken, getFidForAddr, isAddr } from '../../../../lib/notifyStore'
import { verifyWalletAuth } from '../../../../lib/walletAuth'

// Direct token capture from the mini-app context. The manifest webhook only
// fires when a user *newly* adds the app / toggles notifications — users who
// already had FlameBase added (before webhookUrl existed) never trigger it, but
// their notification token is present in `sdk.context.client.notificationDetails`.
// The client posts it here so we can reach them too.
//
// Requires a signature proving control of `address`, bound to this exact
// fid+url+token — otherwise a signature obtained for one token could be
// replayed with a different (attacker-controlled) url/token, redirecting the
// victim's notification content to an attacker endpoint. Also requires that
// address to already be linked (via /api/farcaster/link) to the claimed fid.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { fid, address, url, token, timestamp, signature } = await req.json()
    const f = Number(fid)
    if (!f || !url || !token || !isAddr(address || '')) {
      return NextResponse.json({ ok: false, error: 'fid + address + url + token required' }, { status: 400 })
    }
    if (!(await verifyWalletAuth('token', address, timestamp, signature, `${f}:${url}:${token}`))) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
    const linkedFid = await getFidForAddr(address)
    if (linkedFid !== f) {
      return NextResponse.json({ ok: false, error: 'address is not linked to this fid' }, { status: 403 })
    }
    await saveFcToken(f, { url, token })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'failed' }, { status: 500 })
  }
}
