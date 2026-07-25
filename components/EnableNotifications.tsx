'use client'

import { useEffect, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { enablePush, notifPermission } from '../lib/pushClient'

// Small floating opt-in pill. Shows only when the user is connected and hasn't
// decided on notifications yet. Once granted, it silently keeps the server copy
// of the subscription fresh and renders nothing.
export default function EnableNotifications() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>('default')
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => { setPerm(notifPermission()) }, [])

  // Already granted → refresh the subscription on the server (endpoints rotate).
  // This now requires a wallet signature, so only do it once per session per
  // address rather than silently prompting on every mount.
  useEffect(() => {
    if (perm !== 'granted' || !isConnected || !address) return
    const key = `fb_push_synced_${address.toLowerCase()}`
    if (typeof window !== 'undefined' && sessionStorage.getItem(key)) return
    enablePush(address, (args) => signMessageAsync(args))
      .then((r) => { if (r.ok && typeof window !== 'undefined') sessionStorage.setItem(key, '1') })
      .catch(() => {})
  }, [perm, isConnected, address, signMessageAsync])

  if (dismissed) return null
  if (!isConnected || !address) return null
  if (perm === 'unsupported' || perm === 'granted' || perm === 'denied') return null

  return (
    <div style={{ position: 'fixed', right: 16, bottom: 'calc(var(--bottom-nav-h, 64px) + 16px)', zIndex: 9999, display: 'flex', gap: 8, alignItems: 'center' }}>
      <button
        onClick={async () => {
          setBusy(true)
          const r = await enablePush(address, (args) => signMessageAsync(args))
          setBusy(false)
          setPerm(notifPermission())
          if (r.ok) setDismissed(true)
        }}
        disabled={busy}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#0052FF', color: '#fff', border: 'none',
          borderRadius: 9999, padding: '10px 16px', fontSize: 14, fontWeight: 600,
          boxShadow: '0 4px 14px rgba(0,82,255,.4)', cursor: busy ? 'default' : 'pointer',
        }}
      >
        🔔 {busy ? 'Enabling…' : 'Enable notifications'}
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          background: 'rgba(0,0,0,.55)', color: '#fff', border: 'none',
          borderRadius: 9999, width: 28, height: 28, fontSize: 16, cursor: 'pointer', lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}
