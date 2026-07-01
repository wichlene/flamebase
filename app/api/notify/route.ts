import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { getSubscriptions, removeSubscription } from '../../../lib/pushStore'

export const runtime = 'nodejs'

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || ''
const configured = Boolean(VAPID_PUBLIC && VAPID_PRIVATE)
if (configured) {
  webpush.setVapidDetails('mailto:hello@flamebase.xyz', VAPID_PUBLIC, VAPID_PRIVATE)
}

const TITLES: Record<string, string> = {
  like: '🔥 New like',
  comment: '💬 New comment',
  tip: '💸 You got tipped',
  follow: '👥 New follower',
  message: '✉️ New message',
}

// Send a Web Push notification to every device registered for `to`. Triggered
// client-side by the actor at the moment they like/comment/tip/follow, so no
// on-chain indexer is needed for delivery.
export async function POST(request: Request) {
  if (!configured) {
    // Silently succeed so the caller (fire-and-forget) never surfaces an error
    // when push simply isn't configured yet.
    return NextResponse.json({ ok: false, reason: 'push not configured' })
  }
  try {
    const { to, type, actor, preview } = await request.json()
    if (!to || typeof to !== 'string') {
      return NextResponse.json({ error: 'to required' }, { status: 400 })
    }
    const subs = await getSubscriptions(to)
    if (subs.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    const who = typeof actor === 'string' && actor ? actor : 'Someone'
    const body = preview ? `${who} · ${String(preview).slice(0, 80)}` : who
    const payload = JSON.stringify({
      title: TITLES[type] || 'FlameBase 🔥',
      body,
      url: 'https://flamebase.xyz',
    })

    let sent = 0
    await Promise.all(subs.map(async sub => {
      try {
        await webpush.sendNotification(sub as any, payload)
        sent++
      } catch (err: any) {
        // 404/410 mean the subscription is dead — prune it so we stop trying.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await removeSubscription(to, sub.endpoint).catch(() => {})
        }
      }
    }))
    return NextResponse.json({ ok: true, sent })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
