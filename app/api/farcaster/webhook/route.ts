import { NextRequest, NextResponse } from 'next/server'
import { parseWebhookEvent, verifyAppKeyWithNeynar, type VerifyAppKey } from '@farcaster/miniapp-node'
import { saveFcToken, removeFcToken, getAddrForFid } from '../../../../lib/notifyStore'

// Farcaster / Base App calls this (the manifest's `webhookUrl`) when a user
// adds FlameBase or toggles notifications. The body is a JSON Farcaster
// Signature: { header, payload, signature } — all base64url JSON. We read the
// FID from the header and the event + notification token from the payload.
export const dynamic = 'force-dynamic'

// Full JFS verification (Ed25519 signature + onchain app-key-belongs-to-FID
// check via a Farcaster hub) needs a hub endpoint. @farcaster/miniapp-node's
// only battle-tested, always-reachable option is Neynar's hosted hub, gated
// behind a free NEYNAR_API_KEY. Without that key configured, fall back to
// the previous partial mitigation (only accept updates for a FID that
// already has a signature-verified address link via /api/farcaster/link) —
// real but narrower protection: a forged call can't hijack an arbitrary FID,
// only one that's a legitimate FlameBase user AND whose fid the attacker
// already knows. Set NEYNAR_API_KEY (free tier at neynar.com) to close that
// remaining gap completely.
const verifyAppKey: VerifyAppKey | null = process.env.NEYNAR_API_KEY
  ? verifyAppKeyWithNeynar
  : null

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (verifyAppKey) {
      try {
        const { fid, event } = await parseWebhookEvent(body, verifyAppKey)
        return handleEvent(fid, event.event, 'notificationDetails' in event ? event.notificationDetails : undefined)
      } catch (e: unknown) {
        return NextResponse.json({ ok: false, error: (e as Error)?.message || 'invalid signature' }, { status: 401 })
      }
    }

    // Fallback path: no real signature verification, only the partial
    // "already linked" mitigation below.
    const header = decode(body.header) as { fid?: number }
    const payload = decode(body.payload) as {
      event?: string
      notificationDetails?: { url?: string; token?: string }
    }
    const fid = header?.fid
    if (!fid) return NextResponse.json({ ok: false, error: 'no fid' }, { status: 400 })
    if (!payload?.event) return NextResponse.json({ ok: false, error: 'no event' }, { status: 400 })

    if (!(await getAddrForFid(fid))) {
      return NextResponse.json({ ok: false, error: 'fid not linked to a known address' }, { status: 403 })
    }
    return handleEvent(fid, payload.event, payload.notificationDetails)
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'bad request' }, { status: 400 })
  }
}

async function handleEvent(
  fid: number,
  event: string,
  notificationDetails?: { url?: string; token?: string },
): Promise<NextResponse> {
  if ((event === 'miniapp_added' || event === 'notifications_enabled') && notificationDetails?.url && notificationDetails?.token) {
    await saveFcToken(fid, { url: notificationDetails.url, token: notificationDetails.token })
  } else if (event === 'miniapp_removed' || event === 'notifications_disabled') {
    await removeFcToken(fid)
  }
  return NextResponse.json({ ok: true })
}

function decode(b64url: string): unknown {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const json = Buffer.from(b64, 'base64').toString('utf8')
  return JSON.parse(json)
}
