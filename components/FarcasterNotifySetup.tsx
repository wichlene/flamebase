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
export default function FarcasterNotifySetup() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [inMiniApp, setInMiniApp] = useState(false)
  const [fid, setFid] = useState<number | null>(null)
  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [dismissed, setDismissed] = useState(false)

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

  const enable = async () => {
    if (!address || !fid) return
    setStatus('working')
    setErrorMsg('')
    try {
      const sign = async (action: string) => {
        const timestamp = Date.now()
        const signature = await signMessageAsync({ message: authMessage(action, address, timestamp) })
        return { timestamp, signature }
      }

      // 1. Link fid ↔ address.
      const { timestamp: lt, signature: ls } = await sign('link')
      const linkRes = await fetch('/api/farcaster/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fid, address, timestamp: lt, signature: ls }),
      })
      if (!linkRes.ok) {
        const d = await linkRes.json().catch(() => ({}))
        throw new Error(`Linking failed: ${d?.error || linkRes.status}`)
      }

      // 2. Get (or request) the notification token, then register it.
      const ctx = await sdk.context
      let nd = (ctx?.client as { notificationDetails?: { url?: string; token?: string } })?.notificationDetails
      if (!nd?.url || !nd?.token) {
        const r = (await sdk.actions.addMiniApp()) as { notificationDetails?: { url?: string; token?: string } }
        nd = r?.notificationDetails
      }
      if (!nd?.url || !nd?.token) {
        throw new Error('Farcaster did not return a notification token — check notifications are allowed for FlameBase in your client settings.')
      }

      const { timestamp: tt, signature: ts } = await sign('token')
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      const rejected = /user rejected|denied|declined/i.test(msg)
      setErrorMsg(rejected ? 'Signature request was rejected.' : msg)
      setStatus('error')
    }
  }

  if (!inMiniApp || !isConnected || !address || !fid || dismissed || status === 'done') return null

  return (
    <div style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 9999, maxWidth: 280, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {status === 'error' && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 12, padding: '8px 12px', fontSize: 12, fontWeight: 600 }}>
          ⚠️ {errorMsg}
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
          🔔 {status === 'working' ? 'Enabling…' : status === 'error' ? 'Try again' : 'Enable Farcaster notifications'}
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
