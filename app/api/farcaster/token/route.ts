import { NextRequest, NextResponse } from 'next/server'
import { saveFcToken } from '../../../../lib/notifyStore'

// Direct token capture from the mini-app context. The manifest webhook only
// fires when a user *newly* adds the app / toggles notifications — users who
// already had FlameBase added (before webhookUrl existed) never trigger it, but
// their notification token is present in `sdk.context.client.notificationDetails`.
// The client posts it here so we can reach them too.
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { fid, url, token } = await req.json()
    const f = Number(fid)
    if (!f || !url || !token) {
      return NextResponse.json({ ok: false, error: 'fid + url + token required' }, { status: 400 })
    }
    await saveFcToken(f, { url, token })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'failed' }, { status: 500 })
  }
}
