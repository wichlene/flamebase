// Caches address -> Talent Protocol EAS attestation UID, so repeat profile
// views don't re-scan the chain. Same minimal Upstash Redis REST pattern as
// leaderboardStore.ts/notifyStore.ts, with an in-memory fallback for local dev.

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

export async function getAttestationUID(address: string): Promise<string | null> {
  const key = `fb:talent:uid:${address.toLowerCase()}`
  if (useRedis) return (await redis(['GET', key])) || null
  return mem[key] || null
}

export async function setAttestationUID(address: string, uid: string): Promise<void> {
  const key = `fb:talent:uid:${address.toLowerCase()}`
  if (useRedis) await redis(['SET', key, uid])
  else mem[key] = uid
}
