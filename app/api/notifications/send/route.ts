import { NextRequest, NextResponse } from 'next/server'
import { sendPushTo } from '../../../../lib/notifySend'

// Internal send endpoint — used by the on-chain watcher (next slice) and for
// manual testing. Protected by NOTIFY_SECRET so nobody can spam users' devices.
//
//   curl -X POST https://flamebase.xyz/api/notifications/send \
//     -H 'content-type: application/json' \
//     -H 'x-notify-secret: <NOTIFY_SECRET>' \
//     -d '{"to":"0xYourAddr","title":"gm ☀️","body":"Test from FlameBase","url":"/"}'
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-notify-secret')
  if (!process.env.NOTIFY_SECRET || secret !== process.env.NOTIFY_SECRET) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  try {
    const { to, title, body, url, tag } = await req.json()
    if (!to || !title) {
      return NextResponse.json({ ok: false, error: 'to + title required' }, { status: 400 })
    }
    const sent = await sendPushTo(to, { title, body: body || '', url, tag })
    return NextResponse.json({ ok: true, sent })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'failed' }, { status: 500 })
  }
}
