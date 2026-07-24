'use client'

import { useEffect } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { sdk } from '@farcaster/miniapp-sdk'
import { authMessage } from '../lib/walletAuth'

// Runs only inside Base App / Farcaster. Two jobs:
//  1. Map the connected wallet → FID so the on-chain watcher can reach this user.
//  2. Prompt them to add FlameBase (once), which enables notifications and makes
//     Farcaster POST us their notification token via the manifest webhook.
//
// Both /api/farcaster/link and /api/farcaster/token require a wallet signature
// proving control of `address` — without it, anyone could POST an arbitrary
// victim address+fid pair directly and hijack that victim's notifications.
export default function FarcasterNotifySetup() {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!(await sdk.isInMiniApp())) return
        const ctx = await sdk.context
        const fid = ctx?.user?.fid
        if (cancelled || !fid || !isConnected || !address) return

        const sign = async (action: string) => {
          const timestamp = Date.now()
          const signature = await signMessageAsync({ message: authMessage(action, address, timestamp) })
          return { timestamp, signature }
        }

        // Link fid ↔ address — once per session per address (the signature
        // prompt would otherwise re-fire on every mini-app launch).
        const linkedKey = `fb_fc_linked_${address.toLowerCase()}`
        if (typeof window !== 'undefined' && !sessionStorage.getItem(linkedKey)) {
          try {
            const { timestamp, signature } = await sign('link')
            const res = await fetch('/api/farcaster/link', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fid, address, timestamp, signature }),
            })
            if (res.ok) sessionStorage.setItem(linkedKey, '1')
          } catch { /* user declined the signature — try again next mount */ }
        }

        const postToken = async (url: string, token: string) => {
          try {
            const { timestamp, signature } = await sign('token')
            await fetch('/api/farcaster/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fid, address, url, token, timestamp, signature }),
            })
          } catch { /* user declined the signature */ }
        }

        // If the app is already added with notifications on, the token lives in
        // the context — capture it directly (the webhook won't re-fire for
        // already-added users).
        const nd = (ctx?.client as { notificationDetails?: { url?: string; token?: string } })?.notificationDetails
        if (nd?.url && nd?.token) await postToken(nd.url, nd.token)

        // Not added yet → prompt once (persisted — a session-scoped gate would
        // re-prompt on every fresh mini-app launch, not just once ever).
        const already = ctx?.client?.added
        const promptedKey = 'fb_addminiapp_prompted'
        if (!already && typeof window !== 'undefined' && !localStorage.getItem(promptedKey)) {
          localStorage.setItem(promptedKey, '1')
          try {
            const r = (await sdk.actions.addMiniApp()) as {
              notificationDetails?: { url?: string; token?: string }
            }
            const d = r?.notificationDetails
            if (d?.url && d?.token) await postToken(d.url, d.token)
          } catch { /* user declined / already added */ }
        }
      } catch {
        // Not in a mini app / SDK unavailable — no-op.
      }
    })()
    return () => { cancelled = true }
  }, [isConnected, address, signMessageAsync])

  return null
}
