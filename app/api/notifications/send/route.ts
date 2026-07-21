import { NextRequest, NextResponse } from 'next/server'
import { sendPushTo, sendFarcasterTo } from '../../../../lib/notifySend'

// Internal / test send endpoint. Fans out to BOTH channels (web-push +
// Farcaster). Protected by NOTIFY_SECRET (header x-notify-secret or ?key=).
//
// Browser test (fill in your address):
//   https://flamebase.xyz/api/notifications/send?key=<SECRET>&to=0x...&title=Test&body=hi
function authorized(req: NextRequest): boolean {
  const key = req.headers.get('x-notify-secret') || req.nextUrl.searchParams.get('key') || ''
  return Boolean(process.env.NOTIFY_SECRET) && key === process.env.NOTIFY_SECRET
}

async function run(to: string, title: string, body: string, url?: string, tag?: string) {
  const [push, farcaster] = await Promise.all([
    sendPushTo(to, { title, body, url, tag }),
    sendFarcasterTo(to, { title, body, url, tag }),
  ])
  return { push, farcaster }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const q = req.nextUrl.searchParams
  const to = q.get('to') || ''
  const title = q.get('title') || 'FlameBase test'
  const body = q.get('body') || 'It works 🎉'
  if (!to) return NextResponse.json({ ok: false, error: 'to required' }, { status: 400 })
  const sent = await run(to, title, body, q.get('url') || '/', q.get('tag') || undefined)
  return NextResponse.json({ ok: true, sent })
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    const { to, title, body, url, tag } = await req.json()
    if (!to || !title) return NextResponse.json({ ok: false, error: 'to + title required' }, { status: 400 })
    const sent = await run(to, title, body || '', url, tag)
    return NextResponse.json({ ok: true, sent })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'failed' }, { status: 500 })
  }
}
