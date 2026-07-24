'use client'

import { authMessage } from './walletAuth'

// Client-side Web-Push helpers: register the service worker, ask permission,
// subscribe with our VAPID public key, and hand the subscription to the server.

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

// Matches wagmi's useSignMessage().signMessageAsync signature closely enough
// without importing wagmi into this plain lib file.
type SignMessageAsync = (args: { message: string }) => Promise<string>

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

export function notifPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

// Full opt-in flow. Idempotent — safe to call again to keep the server copy of
// the subscription fresh. Returns { ok, reason } so the caller can react.
// Requires a wallet signature (see lib/walletAuth.ts) proving control of
// `address` — the server rejects subscribe requests without one, so a random
// caller can't register their own device under someone else's address.
export async function enablePush(address: string, signMessageAsync: SignMessageAsync): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' }
  if (!VAPID_PUBLIC) return { ok: false, reason: 'no-vapid' }

  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return { ok: false, reason: 'denied' }

  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
    })
  }

  const timestamp = Date.now()
  let signature: string
  try {
    // Bind the signature to this specific subscription endpoint, not just
    // "address signed something" — otherwise a replayed signature could be
    // submitted with a different (attacker-controlled) subscription.
    signature = await signMessageAsync({ message: authMessage('subscribe', address, timestamp, sub.endpoint) })
  } catch {
    return { ok: false, reason: 'sign-rejected' }
  }

  const res = await fetch('/api/notifications/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address, subscription: sub.toJSON(), timestamp, signature }),
  })
  if (!res.ok) return { ok: false, reason: 'save-failed' }
  return { ok: true }
}
