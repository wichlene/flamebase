import { NextRequest, NextResponse } from 'next/server'
import { getFidForAddr, getFcToken, getPushSubs, getCursor } from '../../../../lib/notifyStore'

// Debug endpoint: shows exactly what's registered for an address so we can see
// where the pipeline breaks. Secret-protected.
//   /api/notifications/status?address=0x...   (header x-notify-secret)
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!process.env.NOTIFY_SECRET || req.headers.get('x-notify-secret') !== process.env.NOTIFY_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const address = req.nextUrl.searchParams.get('address') || ''
  const fid = await getFidForAddr(address)
  const fcToken = fid ? await getFcToken(fid) : null
  const pushSubs = await getPushSubs(address)
  const cursor = await getCursor()
  return NextResponse.json({
    ok: true,
    address: address.toLowerCase(),
    fid,                                   // null → address↔fid never linked (open FlameBase inside Base App)
    farcaster: fcToken ? 'registered' : 'none', // none → notification token not captured
    pushSubscriptions: pushSubs.length,    // 0 → never enabled web-push on a device
    watcherCursorBlock: cursor ? cursor.toString() : null, // null → watcher never ran
  })
}
