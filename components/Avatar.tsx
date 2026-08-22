'use client'

import { useState } from 'react'

export type AvatarProfile = { username?: string; avatarHash?: string }

export const IPFS_GATEWAYS = [
  // Our own dedicated Pinata gateway — first because the shared public
  // gateway.pinata.cloud is deliberately throttled for non-paying/shared
  // traffic, which was making every image and video in the feed load slowly.
  // A dedicated gateway serves the exact same content without that limit.
  'https://salmon-just-krill-367.mypinata.cloud/ipfs/',
  'https://gateway.pinata.cloud/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://ipfs.io/ipfs/',
]

export default function Avatar({ addr, profiles, size = 'md' }: { addr: string; profiles: Record<string, AvatarProfile>; size?: 'sm' | 'md' | 'lg' }) {
  const p = profiles[addr.toLowerCase()]
  const [gwIdx, setGwIdx] = useState(0)
  const [failed, setFailed] = useState(false)
  const dims = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-20 h-20 text-2xl' : 'w-10 h-10 text-sm'
  if (p?.avatarHash && !failed) return (
    <img
      src={IPFS_GATEWAYS[gwIdx] + p.avatarHash}
      className={`${dims} rounded-full object-cover flex-shrink-0`}
      alt="avatar"
      onError={() => { if (gwIdx < IPFS_GATEWAYS.length - 1) { setGwIdx(i => i + 1) } else { setFailed(true) } }}
    />
  )
  return (
    <div className={`${dims} rounded-full bg-gradient-to-br from-[#0052FF] to-[#1652F0] flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {addr.slice(2, 4).toUpperCase()}
    </div>
  )
}
