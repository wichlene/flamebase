import webpush from 'web-push'
import { getPushSubs, removePushSub, type PushSub } from './notifyStore'

// Web-Push sender. VAPID keys are generated once (npx web-push generate-vapid-keys)
// and set in the environment. Without them, sending is a no-op (so local dev and
// preview deploys don't crash — they just don't push).
const PUB = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const PRIV = process.env.VAPID_PRIVATE_KEY || ''
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@flamebase.xyz'

let configured = false
function ensure(): boolean {
  if (configured) return true
  if (!PUB || !PRIV) return false
  webpush.setVapidDetails(SUBJECT, PUB, PRIV)
  configured = true
  return true
}

export type Notif = { title: string; body: string; url?: string; tag?: string }

// Push to every device the address has subscribed. Returns how many were
// delivered. Expired/gone subscriptions (404/410) are pruned automatically.
export async function sendPushTo(addr: string, n: Notif): Promise<number> {
  if (!ensure()) return 0
  const subs = await getPushSubs(addr)
  if (subs.length === 0) return 0
  const payload = JSON.stringify(n)
  let sent = 0
  await Promise.all(
    subs.map(async (sub: PushSub) => {
      try {
        await webpush.sendNotification(sub as unknown as webpush.PushSubscription, payload)
        sent++
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) await removePushSub(addr, sub.endpoint).catch(() => {})
      }
    }),
  )
  return sent
}
