import { NextRequest, NextResponse } from 'next/server'
import { saveFcToken, removeFcToken, getAddrForFid } from '../../../../lib/notifyStore'

// Farcaster / Base App calls this (the manifest's `webhookUrl`) when a user
// adds FlameBase or toggles notifications. The body is a JSON Farcaster
// Signature: { header, payload, signature } — all base64url JSON. We read the
// FID from the header and the event + notification token from the payload.
//
// SECURITY NOTE: signature verification (against the FID's registered Farcaster
// signer key) is NOT implemented — this is a real gap, not a cosmetic one: an
// unauthenticated POST here can overwrite the {url, token} destination for any
// FID, redirecting that FID's live notification content (actor names, tip
// amounts, comment previews) to an attacker-controlled endpoint. As a partial
// mitigation, we only accept an update for FIDs that already have a
// signature-verified address link (established via /api/farcaster/link, which
// DOES require a wallet signature AND a Quick Auth-verified fid) — so a forged
// call can't hijack an arbitrary/unknown FID, only one that's a legitimate
// FlameBase user AND whose fid the attacker already knows. Applied to BOTH the
// add/enable branch AND the remove/disable branch — a forged "remove" event
// used to be accepted unconditionally for ANY fid, letting an attacker
// silently unsubscribe a real, legitimately-registered user's notifications
// with nothing more than their public fid. Full JFS verification is still
// needed to close this completely; treat it as a hardening TODO.
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

    if (event === 'miniapp_added' || event === 'notifications_enabled' || event === 'miniapp_removed' || event === 'notifications_disabled') {
      if (!(await getAddrForFid(fid))) {
        return NextResponse.json({ ok: false, error: 'fid not linked to a known address' }, { status: 403 })
      }
    }

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
