// Persisted B20 token list — built incrementally by app/api/b20/scan instead
// of every visitor's browser re-scanning the chain from their own device.
// Same minimal Upstash Redis REST pattern as leaderboardStore.ts/
// notifyStore.ts, with an in-memory fallback for local dev.

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

const mem: Record<string, string> = {}
const memTokens: Record<string, string> = {}
let memLockUntil = 0

async function getNum(key: string): Promise<bigint | null> {
  const v = useRedis ? await redis(['GET', key]) : mem[key] ?? null
  return v ? BigInt(v) : null
}
async function setNum(key: string, block: bigint): Promise<void> {
  const v = block.toString()
  if (useRedis) await redis(['SET', key, v])
  else mem[key] = v
}

// Same two-cursor design as leaderboardStore.ts: `head` tracks live activity
// forward from wherever the first run started, `tail`/`floor` backfill
// history behind it without starving new tokens of visibility.
export const getHead = () => getNum('fb:b20:head')
export const setHead = (b: bigint) => setNum('fb:b20:head', b)
export const getTail = () => getNum('fb:b20:tail')
export const setTail = (b: bigint) => setNum('fb:b20:tail', b)
export const getFloor = () => getNum('fb:b20:floor')
export const setFloor = (b: bigint) => setNum('fb:b20:floor', b)

export type StoredB20Token = {
  token: string
  name: string
  symbol: string
  variant: number
  block: string // bigint as string — JSON-safe
  dec: number
}

export async function addTokens(tokens: StoredB20Token[]): Promise<void> {
  if (tokens.length === 0) return
  if (useRedis) {
    const cmd: (string | number)[] = ['HSET', 'fb:b20:tokens']
    for (const t of tokens) cmd.push(t.token.toLowerCase(), JSON.stringify(t))
    await redis(cmd)
  } else {
    for (const t of tokens) memTokens[t.token.toLowerCase()] = JSON.stringify(t)
  }
}

export async function getAllTokens(): Promise<StoredB20Token[]> {
  if (useRedis) {
    const flat: string[] = (await redis(['HGETALL', 'fb:b20:tokens'])) || []
    const out: StoredB20Token[] = []
    for (let i = 1; i < flat.length; i += 2) {
      try { out.push(JSON.parse(flat[i])) } catch { /* skip malformed entry */ }
    }
    return out
  }
  return Object.values(memTokens).map(v => JSON.parse(v))
}

export async function acquireScanLock(ttlSec = 120): Promise<boolean> {
  if (useRedis) {
    const res = await redis(['SET', 'fb:b20:scanlock', '1', 'NX', 'EX', ttlSec])
    return res === 'OK'
  }
  if (Date.now() < memLockUntil) return false
  memLockUntil = Date.now() + ttlSec * 1000
  return true
}

export async function releaseScanLock(): Promise<void> {
  if (useRedis) await redis(['DEL', 'fb:b20:scanlock'])
  else memLockUntil = 0
}
