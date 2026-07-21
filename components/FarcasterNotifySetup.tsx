'use client'

import { useEffect } from 'react'
import { useAccount } from 'wagmi'
import { sdk } from '@farcaster/miniapp-sdk'

// Runs only inside Base App / Farcaster. Two jobs:
//  1. Map the connected wallet → FID so the on-chain watcher can reach this user.
//  2. Prompt them to add FlameBase (once), which enables notifications and makes
//     Farcaster POST us their notification token via the manifest webhook.
export default function FarcasterNotifySetup() {
  const { address, isConnected } = useAccount()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        if (!(await sdk.isInMiniApp())) return
        const ctx = await sdk.context
        const fid = ctx?.user?.fid
        if (cancelled || !fid) return

        // Link fid ↔ address (needs the wallet connected).
        if (isConnected && address) {
          fetch('/api/farcaster/link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fid, address }),
          }).catch(() => {})
        }

        // Prompt to add the app once (enables notifications). Skip if already added.
        const already = ctx?.client?.added
        const promptedKey = 'fb_addminiapp_prompted'
        if (!already && typeof window !== 'undefined' && !sessionStorage.getItem(promptedKey)) {
          sessionStorage.setItem(promptedKey, '1')
          sdk.actions.addMiniApp().catch(() => {})
        }
      } catch {
        // Not in a mini app / SDK unavailable — no-op.
      }
    })()
    return () => { cancelled = true }
  }, [isConnected, address])

  return null
}
