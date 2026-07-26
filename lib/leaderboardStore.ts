// Leaderboard store — a running tally of how many times each address has
// acted on FlameBase (post/like/comment/tip/checkin/log/greet/vote/propose/
// follow/deploy — every event FlameBase's own contracts emit for a user
// action), built incrementally by app/api/leaderboard/scan. Same Upstash
// Redis REST pattern as notifyStore.ts, with an in-memory fallback for local
// dev so the app keeps working with zero setup.

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ''
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
const useRedis = Boolean(REDIS_URL && REDIS_TOKEN)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

const memScores: Record<string, number> = {}
const mem: Record<string, string> = {}
let memLockUntil = 0

async function getNum(key: string): Promise<bigint | null> {
  let v: string | null = null
  if (useRedis) v = await redis(['GET', key])
  else v = mem[key] ?? null
  return v ? BigInt(v) : null
}
async function setNum(key: string, block: bigint): Promise<void> {
  const v = block.toString()
  if (useRedis) await redis(['SET', key, v])
  else mem[key] = v
}

// Two-cursor design so live activity is never starved by a slow historical
// backfill: `head` is the highest block whose forward range has been fully
// captured (advances every run to whatever the current chain tip is, so new
// actions always show up within one run). `tail` is the lowest block
// captured so far walking BACKWARD from where `head` started — it creeps
// down toward `floor` (the original ~2-month backfill target, computed once
// so it doesn't drift as time passes) filling in history behind the live
// edge, instead of crawling forward from 2 months ago and leaving recent
// activity invisible until it catches all the way up.
export const getHead = () => getNum('fb:lb:head')
export const setHead = (b: bigint) => setNum('fb:lb:head', b)
export const getTail = () => getNum('fb:lb:tail')
export const setTail = (b: bigint) => setNum('fb:lb:tail', b)
export const getFloor = () => getNum('fb:lb:floor')
export const setFloor = (b: bigint) => setNum('fb:lb:floor', b)

// Increments each address's total action count by however many times it
// shows up in this batch. Upstash's REST API has no bulk ZINCRBY, so this
// collapses to one call per unique address in the batch.
export async function bumpScores(addrs: string[]): Promise<void> {
  const counts: Record<string, number> = {}
  for (const raw of addrs) {
    const a = raw.toLowerCase()
    counts[a] = (counts[a] || 0) + 1
  }
  const entries = Object.entries(counts)
  if (entries.length === 0) return
  if (useRedis) {
    await Promise.all(entries.map(([addr, n]) => redis(['ZINCRBY', 'fb:lb:total', n, addr])))
  } else {
    for (const [addr, n] of entries) memScores[addr] = (memScores[addr] || 0) + n
  }
}

export async function getTop(n: number): Promise<{ addr: string; score: number }[]> {
  if (useRedis) {
    const flat: string[] = (await redis(['ZREVRANGE', 'fb:lb:total', 0, n - 1, 'WITHSCORES'])) || []
    const out: { addr: string; score: number }[] = []
    for (let i = 0; i < flat.length; i += 2) out.push({ addr: flat[i], score: Number(flat[i + 1]) })
    return out
  }
  return Object.entries(memScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([addr, score]) => ({ addr, score }))
}

// Serializes overlapping scan runs the same way notifyStore's does — a
// slow run still in flight when the next cron tick fires must not reprocess
// (and double-count) the same block range. TTL comfortably exceeds the
// scan route's own maxDuration (60s).
export async function acquireScanLock(ttlSec = 120): Promise<boolean> {
  if (useRedis) {
    const res = await redis(['SET', 'fb:lb:scanlock', '1', 'NX', 'EX', ttlSec])
    return res === 'OK'
  }
  if (Date.now() < memLockUntil) return false
  memLockUntil = Date.now() + ttlSec * 1000
  return true
}

export async function releaseScanLock(): Promise<void> {
  if (useRedis) await redis(['DEL', 'fb:lb:scanlock'])
  else memLockUntil = 0
}
