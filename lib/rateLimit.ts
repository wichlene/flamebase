// Minimal per-IP rate limiter shared by public routes that proxy a paid or
// quota-limited external API (Groq, YouTube, Pixabay, Pinata) with no other
// auth gate. Same Upstash Redis REST pattern used throughout lib/*Store.ts.
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

// Fails OPEN (allows the request) if Redis is unavailable/misconfigured —
// availability over strictness, matching the caching helpers elsewhere.
export async function checkRateLimit(bucket: string, id: string, limit: number, windowSeconds: number): Promise<boolean> {
  if (!useRedis) return true
  try {
    const key = `fb:ratelimit:${bucket}:${id}`
    const count = Number(await redis(['INCR', key]))
    if (count === 1) await redis(['EXPIRE', key, windowSeconds])
    return count <= limit
  } catch {
    return true
  }
}

export function getClientIp(request: Request): string {
  const h = request.headers
  return h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'unknown'
}
