import webpush from 'web-push'
import {
  getPushSubs, removePushSub, type PushSub,
  getFidForAddr, getFcToken, removeFcToken,
} from './notifyStore'

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN || 'https://flamebase.xyz'

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

// Deliver a Farcaster / Base App notification (shows up in the user's in-app
// Notifications tab). Resolves address → FID → stored token, then POSTs to the
// per-user notification URL Farcaster gave us. Returns 1 on success, else 0.
export async function sendFarcasterTo(addr: string, n: Notif): Promise<number> {
  const fid = await getFidForAddr(addr)
  if (!fid) return 0
  const tok = await getFcToken(fid)
  if (!tok) return 0

  // Farcaster limits: title ≤ 32, body ≤ 128, targetUrl on the app domain.
  const targetUrl = APP_ORIGIN + (n.url && n.url.startsWith('/') ? n.url : '/')
  const notificationId = `${n.tag || 'fb'}-${Date.now()}`.slice(0, 128)
  try {
    const res = await fetch(tok.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notificationId,
        title: n.title.slice(0, 32),
        body: n.body.slice(0, 128),
        targetUrl,
        tokens: [tok.token],
      }),
    })
    const data = await res.json().catch(() => ({})) as { invalidTokens?: string[] }
    // Prune a token Farcaster reports as invalid so we stop trying it.
    if (Array.isArray(data?.invalidTokens) && data.invalidTokens.includes(tok.token)) {
      await removeFcToken(fid).catch(() => {})
      return 0
    }
    return res.ok ? 1 : 0
  } catch {
    return 0
  }
}

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
