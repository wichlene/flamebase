'use client'

import { useEffect, useState } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { sdk } from '@farcaster/miniapp-sdk'
import { authMessage } from '../lib/walletAuth'

// Runs only inside Base App / Farcaster. Maps the connected wallet → FID (so
// the on-chain watcher can reach this user) and registers their notification
// token — both require a signature proving control of `address` (otherwise
// anyone could POST an arbitrary victim address+fid pair and hijack their
// notifications).
//
// IMPORTANT: the signing step is gated behind an explicit button tap, not
// auto-fired in a useEffect. Wallets commonly refuse (or silently drop) a
// signMessage request that isn't the direct result of a user gesture — an
// automatic background sign call can fail with zero visible error, which is
// exactly what made this look broken with no diagnosable cause.
type NotifDetails = { url: string; token: string }

export default function FarcasterNotifySetup() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [inMiniApp, setInMiniApp] = useState(false)
  const [fid, setFid] = useState<number | null>(null)
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [dismissed, setDismissed] = useState(false)
  // Set only by the notificationsEnabled/miniAppAdded host events below —
  // never auto-signed from there (signMessage silently fails when it isn't
  // the direct result of a user gesture, see the note above enable()). When
  // this is populated the button switches to a one-tap "Finish setup" that
  // reuses these details instead of calling addMiniApp() again.
  const [pendingNd, setPendingNd] = useState<NotifDetails | null>(null)

  // Detection only — no signing here, so nothing to silently fail on.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ok = await sdk.isInMiniApp()
        if (cancelled) return
        setInMiniApp(ok)
        if (!ok) return
        const ctx = await sdk.context
        if (cancelled) return
        setFid(ctx?.user?.fid ?? null)
      } catch { /* not in a mini app / SDK unavailable */ }
    })()
    return () => { cancelled = true }
  }, [])

  // If the user grants notification permission from OUTSIDE our button (the
  // host's own native prompt, or its app-settings screen after our error
  // told them to go check it), the host tells us via these events instead of
  // a return value we're waiting on. Surface a one-tap "Finish setup" rather
  // than leaving the stale error banner up until they happen to hit "Try
  // again" again — but don't auto-sign from here, that's not a user gesture.
  useEffect(() => {
    if (!inMiniApp) return
    const onDetails = (nd?: NotifDetails) => {
      if (!nd?.url || !nd?.token) return
      setPendingNd(nd)
      setStatus('idle')
      setErrorMsg('')
    }
    const onEnabled = (payload: { notificationDetails: NotifDetails }) => onDetails(payload?.notificationDetails)
    const onAdded = (payload: { notificationDetails?: NotifDetails }) => onDetails(payload?.notificationDetails)
    sdk.on('notificationsEnabled', onEnabled)
    sdk.on('miniAppAdded', onAdded)
    return () => { sdk.off('notificationsEnabled', onEnabled); sdk.off('miniAppAdded', onAdded) }
  }, [inMiniApp])

  // `status` was previously never reset, so switching to a different
  // connected address after completing setup for one address left the
  // button permanently hidden ('done') for every subsequent address, with no
  // way to link/register the new one short of a full page reload.
  useEffect(() => {
    setStatus('idle')
    setErrorMsg('')
    setDismissed(false)
    setPendingNd(null)
  }, [address])

  const enable = async () => {
    if (!address || !fid) return
    setStatus('working')
    setErrorMsg('')
    try {
      // Bind each signature to the SPECIFIC data it authorizes (not just
      // "address signed something for this action") — otherwise a signature
      // obtained for one fid/token could be replayed with a different,
      // attacker-controlled fid/url/token in the request body.
      const sign = async (action: string, payload: string) => {
        const timestamp = Date.now()
        const signature = await signMessageAsync({ message: authMessage(action, address, timestamp, payload) })
        return { timestamp, signature }
      }

      // 1. Link fid ↔ address. The wallet signature above only proves
      // control of `address` — it does NOT prove `address`'s owner actually
      // controls fid `fid` (anyone can sign a message claiming any fid
      // number). Quick Auth is Farcaster's own cryptographic proof of FID
      // ownership, verified server-side against Farcaster's auth server.
      const { token: quickAuthToken } = await sdk.quickAuth.getToken()
      const { timestamp: lt, signature: ls } = await sign('link', String(fid))
      const linkRes = await fetch('/api/farcaster/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid, address, timestamp: lt, signature: ls, quickAuthToken }),
      })
      if (!linkRes.ok) {
        const d = await linkRes.json().catch(() => ({}))
        throw new Error(`Linking failed: ${d?.error || linkRes.status}`)
      }

      // 2. Get (or request) the notification token, then register it.
      // A previous host event may already have handed us valid details
      // (see the notificationsEnabled/miniAppAdded listener above) — reuse
      // those instead of calling addMiniApp() again.
      const ctx = await sdk.context
      let nd: NotifDetails | undefined = pendingNd ?? (ctx?.client as { notificationDetails?: NotifDetails })?.notificationDetails
      if (!nd?.url || !nd?.token) {
        const r = (await sdk.actions.addMiniApp()) as { notificationDetails?: NotifDetails }
        nd = r?.notificationDetails
      }
      if (!nd?.url || !nd?.token) {
        // Once the app is already added, hosts like Base App don't re-prompt
        // for notification permission on a repeat addMiniApp() call — there
        // is no SDK method to force it. The only fix is the user flipping it
        // on in the host's own UI (the ••• menu at the top of the mini-app
        // frame → Notifications), which is exactly why the listener above
        // exists: the moment they do, we pick it up without another click.
        throw new Error('Farcaster/Base App didn’t grant notification permission. Tap the ••• menu at the top of this screen → Notifications → turn it on for FlameBase, then come back here.')
      }

      const { timestamp: tt, signature: ts } = await sign('token', `${fid}:${nd.url}:${nd.token}`)
      const tokenRes = await fetch('/api/farcaster/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid, address, url: nd.url, token: nd.token, timestamp: tt, signature: ts }),
      })
      if (!tokenRes.ok) {
        const d = await tokenRes.json().catch(() => ({}))
        throw new Error(`Token registration failed: ${d?.error || tokenRes.status}`)
      }

      setStatus('done')
      setPendingNd(null)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      const rejected = /user rejected|denied|declined/i.test(msg)
      setErrorMsg(rejected ? 'Signature request was rejected.' : msg)
      setStatus('error')
    }
  }

  if (!inMiniApp || !isConnected || !address || !fid || dismissed || status === 'done') return null

  return (
    <div style={{ position: 'fixed', left: 16, bottom: 'calc(var(--bottom-nav-h, 64px) + 16px)', zIndex: 9999, maxWidth: 280, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {status === 'error' && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 12, padding: '8px 12px', fontSize: 12, fontWeight: 600 }}>
          ⚠️ {errorMsg}
        </div>
      )}
      {pendingNd && status !== 'error' && (
        <div style={{ background: '#DCFCE7', color: '#166534', borderRadius: 12, padding: '8px 12px', fontSize: 12, fontWeight: 600 }}>
          ✓ Permission detected — tap to finish setup.
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={enable}
          disabled={status === 'working'}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#0052FF', color: '#fff', border: 'none',
            borderRadius: 9999, padding: '10px 16px', fontSize: 13, fontWeight: 600,
            boxShadow: '0 4px 14px rgba(0,82,255,.4)', cursor: status === 'working' ? 'default' : 'pointer',
          }}
        >
          🔔 {status === 'working' ? 'Enabling…' : pendingNd ? 'Finish setup' : status === 'error' ? 'Try again' : 'Enable Farcaster notifications'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          style={{
            background: 'rgba(0,0,0,.55)', color: '#fff', border: 'none',
            borderRadius: 9999, width: 26, height: 26, fontSize: 15, cursor: 'pointer', lineHeight: 1, flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}
