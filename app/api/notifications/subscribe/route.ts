import { NextRequest, NextResponse } from 'next/server'
import { savePushSub, removePushSub, isAddr } from '../../../../lib/notifyStore'
import { verifyWalletAuth } from '../../../../lib/walletAuth'

// The client posts its Web-Push subscription here after the user grants
// permission. Keyed by the connected wallet address so the on-chain watcher can
// later reach the right person when something happens to their post.
//
// Requires a signature proving control of `address`, bound to this exact
// subscription endpoint — otherwise a signature obtained for one subscription
// could be replayed with a different (attacker-controlled) endpoint, letting
// someone register their own device under a victim's address.
export async function POST(req: NextRequest) {
  try {
    const { address, subscription, timestamp, signature } = await req.json()
    if (!isAddr(address || '') || !subscription?.endpoint || !subscription?.keys?.auth) {
      return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 })
    }
    if (!(await verifyWalletAuth('subscribe', address, timestamp, signature, subscription.endpoint))) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
    await savePushSub(address, subscription)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'failed' }, { status: 500 })
  }
}

// Called when the user turns notifications off (or the browser reports the
// subscription changed) so we stop pushing to a dead endpoint.
export async function DELETE(req: NextRequest) {
  try {
    const { address, endpoint, timestamp, signature } = await req.json()
    if (!isAddr(address || '')) {
      return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 })
    }
    if (!(await verifyWalletAuth('unsubscribe', address, timestamp, signature, endpoint || ''))) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
    await removePushSub(address, endpoint)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'failed' }, { status: 500 })
  }
}
