// Notification subscription store — keyed by lowercased wallet address.
//
// Holds each user's Web-Push subscriptions so the server can reach them when
// the app is closed (Chrome / Android / installed PWA). Same Upstash Redis
// pattern as messageStore.ts, with an in-memory fallback for local dev so the
// app keeps working with zero setup.

export type PushSub = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ''
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
const useRedis = Boolean(REDIS_URL && REDIS_TOKEN)

async function redis(cmd: (string | number)[]): Promise<any> {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || (data && data.error)) throw new Error((data && data.error) || `redis ${res.status}`)
  return data.result
}

// addr -> { endpoint -> JSON(sub) }
const memSubs: Record<string, Record<string, string>> = {}

const isAddr = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s)

// Store one subscription, deduped by its endpoint (a device re-subscribing with
// the same endpoint just overwrites).
export async function savePushSub(addrRaw: string, sub: PushSub): Promise<void> {
  const addr = addrRaw.toLowerCase()
  if (!isAddr(addr) || !sub?.endpoint || !sub?.keys?.auth) return
  const val = JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys })
  if (useRedis) await redis(['HSET', `fb:push:${addr}`, sub.endpoint, val])
  else (memSubs[`fb:push:${addr}`] ||= {})[sub.endpoint] = val
}

export async function removePushSub(addrRaw: string, endpoint: string): Promise<void> {
  const addr = addrRaw.toLowerCase()
  if (!isAddr(addr) || !endpoint) return
  if (useRedis) await redis(['HDEL', `fb:push:${addr}`, endpoint])
  else delete memSubs[`fb:push:${addr}`]?.[endpoint]
}

export async function getPushSubs(addrRaw: string): Promise<PushSub[]> {
  const addr = addrRaw.toLowerCase()
  if (!isAddr(addr)) return []
  let vals: string[] = []
  if (useRedis) {
    // Upstash HGETALL returns a flat [field, value, field, value, …] array.
    const h = (await redis(['HGETALL', `fb:push:${addr}`])) || []
    for (let i = 1; i < h.length; i += 2) vals.push(h[i])
  } else {
    vals = Object.values(memSubs[`fb:push:${addr}`] || {})
  }
  return vals
    .map(s => { try { return JSON.parse(s) as PushSub } catch { return null } })
    .filter(Boolean) as PushSub[]
}

// ── Farcaster (Base App) notification tokens ───────────────────────────────
// A user's per-app notification token+url arrives via the manifest webhook when
// they add FlameBase / enable notifications. Keyed by FID. Separately we map
// wallet address → FID (captured client-side from the mini-app context) so the
// on-chain watcher, which only knows addresses, can reach the right FID.
export type FcToken = { url: string; token: string }

export async function saveFcToken(fid: number, t: FcToken): Promise<void> {
  if (!fid || !t?.url || !t?.token) return
  const v = JSON.stringify(t)
  if (useRedis) await redis(['SET', `fb:fctok:${fid}`, v])
  else memFc[`${fid}`] = v
}

export async function removeFcToken(fid: number): Promise<void> {
  if (!fid) return
  if (useRedis) await redis(['DEL', `fb:fctok:${fid}`])
  else delete memFc[`${fid}`]
}

export async function getFcToken(fid: number): Promise<FcToken | null> {
  let v: string | null = null
  if (useRedis) v = await redis(['GET', `fb:fctok:${fid}`])
  else v = memFc[`${fid}`] || null
  if (!v) return null
  try { return JSON.parse(v) as FcToken } catch { return null }
}

export async function linkAddrFid(addrRaw: string, fid: number): Promise<void> {
  const addr = addrRaw.toLowerCase()
  if (!isAddr(addr) || !fid) return
  if (useRedis) await redis(['SET', `fb:addr2fid:${addr}`, String(fid)])
  else memAddr2Fid[addr] = fid
}

export async function getFidForAddr(addrRaw: string): Promise<number | null> {
  const addr = addrRaw.toLowerCase()
  if (!isAddr(addr)) return null
  let v: string | null = null
  if (useRedis) v = await redis(['GET', `fb:addr2fid:${addr}`])
  else v = memAddr2Fid[addr] != null ? String(memAddr2Fid[addr]) : null
  return v ? Number(v) : null
}

const memFc: Record<string, string> = {}
const memAddr2Fid: Record<string, number> = {}

// Debug: dump everything that's registered, so we can see which address/FID a
// user's notifications actually landed under (users have multiple wallets).
export async function debugDump(): Promise<{
  addrLinks: { addr: string; fid: number }[]
  fcTokenFids: number[]
  pushAddrs: string[]
}> {
  if (!useRedis) {
    return {
      addrLinks: Object.entries(memAddr2Fid).map(([addr, fid]) => ({ addr, fid })),
      fcTokenFids: Object.keys(memFc).map(Number),
      pushAddrs: Object.keys(memSubs).map(k => k.replace('fb:push:', '')),
    }
  }
  const linkKeys: string[] = (await redis(['KEYS', 'fb:addr2fid:*'])) || []
  const addrLinks: { addr: string; fid: number }[] = []
  for (const k of linkKeys) {
    const fid = await redis(['GET', k])
    addrLinks.push({ addr: k.replace('fb:addr2fid:', ''), fid: Number(fid) })
  }
  const fcKeys: string[] = (await redis(['KEYS', 'fb:fctok:*'])) || []
  const pushKeys: string[] = (await redis(['KEYS', 'fb:push:*'])) || []
  return {
    addrLinks,
    fcTokenFids: fcKeys.map(k => Number(k.replace('fb:fctok:', ''))),
    pushAddrs: pushKeys.map(k => k.replace('fb:push:', '')),
  }
}

// ── Watcher cursor (last on-chain block scanned for notifiable events) ──
export async function getCursor(): Promise<bigint | null> {
  let v: string | null = null
  if (useRedis) v = await redis(['GET', 'fb:notif:cursor'])
  else v = memCursor
  return v ? BigInt(v) : null
}

export async function setCursor(block: bigint): Promise<void> {
  const v = block.toString()
  if (useRedis) await redis(['SET', 'fb:notif:cursor', v])
  else memCursor = v
}

let memCursor: string | null = null

export { isAddr }
