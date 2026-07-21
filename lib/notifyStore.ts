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

export { isAddr }
