import { NextResponse } from 'next/server'
import { saveSubscription, removeSubscription } from '../../../../lib/pushStore'

export const runtime = 'nodejs'

// Store (or remove) a browser's Web Push subscription for a wallet address so
// /api/notify can reach it later. No signature required — same trust model as
// the rest of the address-keyed features here.
export async function POST(request: Request) {
  try {
    const { address, subscription, action } = await request.json()
    if (!address || typeof address !== 'string') {
      return NextResponse.json({ error: 'address required' }, { status: 400 })
    }
    if (action === 'unsubscribe') {
      if (subscription?.endpoint) await removeSubscription(address, subscription.endpoint)
      return NextResponse.json({ ok: true })
    }
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'valid subscription required' }, { status: 400 })
    }
    await saveSubscription(address, {
      endpoint: subscription.endpoint,
      keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
    })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
