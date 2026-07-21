import { NextRequest, NextResponse } from 'next/server'
import { savePushSub, removePushSub, isAddr } from '../../../../lib/notifyStore'

// The client posts its Web-Push subscription here after the user grants
// permission. Keyed by the connected wallet address so the on-chain watcher can
// later reach the right person when something happens to their post.
export async function POST(req: NextRequest) {
  try {
    const { address, subscription } = await req.json()
    if (!isAddr(address || '') || !subscription?.endpoint || !subscription?.keys?.auth) {
      return NextResponse.json({ ok: false, error: 'bad request' }, { status: 400 })
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
    const { address, endpoint } = await req.json()
    await removePushSub(address, endpoint)
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'failed' }, { status: 500 })
  }
}
