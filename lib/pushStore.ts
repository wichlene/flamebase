// Web Push subscription store, keyed by wallet address.
//
// Subscriptions live in an Upstash Redis hash per address (field = the push
// endpoint, so re-subscribing the same browser overwrites instead of
// duplicating). Falls back to an in-memory map in local dev when Redis env
// vars are absent — good enough to exercise the flow without any setup.

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

const mem: Record<string, Record<string, string>> = {}
const key = (addr: string) => `push:subs:${addr.toLowerCase()}`
const isAddr = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s)

export async function saveSubscription(addr: string, sub: PushSub): Promise<void> {
  if (!isAddr(addr) || !sub?.endpoint) return
  const val = JSON.stringify(sub)
  if (useRedis) { await redis(['HSET', key(addr), sub.endpoint, val]); return }
  ;(mem[key(addr)] ||= {})[sub.endpoint] = val
}

export async function removeSubscription(addr: string, endpoint: string): Promise<void> {
  if (!isAddr(addr) || !endpoint) return
  if (useRedis) { await redis(['HDEL', key(addr), endpoint]); return }
  delete mem[key(addr)]?.[endpoint]
}

export async function getSubscriptions(addr: string): Promise<PushSub[]> {
  if (!isAddr(addr)) return []
  let vals: string[]
  if (useRedis) {
    vals = (await redis(['HVALS', key(addr)])) || []
  } else {
    vals = Object.values(mem[key(addr)] || {})
  }
  const out: PushSub[] = []
  for (const v of vals) {
    try { out.push(JSON.parse(v)) } catch {}
  }
  return out
}
