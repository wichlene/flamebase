import { NextRequest, NextResponse } from 'next/server'
import { saveFcToken, removeFcToken } from '../../../../lib/notifyStore'

// Farcaster / Base App calls this (the manifest's `webhookUrl`) when a user
// adds FlameBase or toggles notifications. The body is a JSON Farcaster
// Signature: { header, payload, signature } — all base64url JSON. We read the
// FID from the header and the event + notification token from the payload.
//
// Note: signature verification (against the FID's app key) is intentionally
// left as a hardening TODO — an unverified token can only ever receive its own
// notifications, so the blast radius is a spoofed enable/disable, not data
// exposure. Add verification before relying on this for anything sensitive.
export const dynamic = 'force-dynamic'

function decode(b64url: string): unknown {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const json = Buffer.from(b64, 'base64').toString('utf8')
  return JSON.parse(json)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const header = decode(body.header) as { fid?: number }
    const payload = decode(body.payload) as {
      event?: string
      notificationDetails?: { url?: string; token?: string }
    }
    const fid = header?.fid
    if (!fid) return NextResponse.json({ ok: false, error: 'no fid' }, { status: 400 })

    const event = payload?.event
    const nd = payload?.notificationDetails

    if ((event === 'miniapp_added' || event === 'notifications_enabled') && nd?.url && nd?.token) {
      await saveFcToken(fid, { url: nd.url, token: nd.token })
    } else if (event === 'miniapp_removed' || event === 'notifications_disabled') {
      await removeFcToken(fid)
    }
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'bad request' }, { status: 400 })
  }
}
