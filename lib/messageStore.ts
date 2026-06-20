// Signature-free messaging store.
//
// Messages are keyed by the connected wallet address (connecting a wallet does
// NOT require a signature — only XMTP did). Storage is Upstash Redis in
// production (configured via the Vercel "Upstash Redis" marketplace
// integration, which injects KV_REST_API_URL / KV_REST_API_TOKEN). When those
// env vars are absent (local dev), it falls back to an in-memory store so the
// app still works without any setup.

export type StoredMsg = { id: string; from: string; to: string; text: string; ts: number }
export type ConvSummary = { convId: string; peer: string; lastMessage: string; lastSentAt: number }

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ''
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
const useRedis = Boolean(REDIS_URL && REDIS_TOKEN)

// Exposed so API routes can tell the client storage isn't durable yet
// (the in-memory fallback is per-instance and won't reach other users).
export const isDurable = useRedis

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

// ── in-memory fallback (local dev only — not shared across serverless invocations) ──
const memLists: Record<string, string[]> = {}
const memZ: Record<string, Record<string, number>> = {}

const isAddr = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s)

export function convId(a: string, b: string): string {
  return [a.toLowerCase(), b.toLowerCase()].sort().join('_')
}

export function peerOf(cid: string, me: string): string {
  const parts = cid.split('_')
  return parts[0] === me.toLowerCase() ? parts[1] : parts[0]
}

export async function addMessage(fromRaw: string, toRaw: string, textRaw: string): Promise<StoredMsg> {
  const from = fromRaw.toLowerCase()
  const to = toRaw.toLowerCase()
  const text = textRaw.slice(0, 4000)
  const ts = Date.now()
  const msg: StoredMsg = { id: `${ts}-${Math.random().toString(36).slice(2, 8)}`, from, to, text, ts }
  const cid = convId(from, to)
  if (useRedis) {
    await redis(['RPUSH', `fb:conv:${cid}`, JSON.stringify(msg)])
    await redis(['ZADD', `fb:uc:${from}`, ts, cid])
    await redis(['ZADD', `fb:uc:${to}`, ts, cid])
  } else {
    ;(memLists[`fb:conv:${cid}`] ||= []).push(JSON.stringify(msg))
    ;(memZ[`fb:uc:${from}`] ||= {})[cid] = ts
    ;(memZ[`fb:uc:${to}`] ||= {})[cid] = ts
  }
  return msg
}

export async function getThread(cid: string): Promise<StoredMsg[]> {
  let raw: string[]
  if (useRedis) raw = (await redis(['LRANGE', `fb:conv:${cid}`, 0, -1])) || []
  else raw = memLists[`fb:conv:${cid}`] || []
  return raw.map(s => { try { return JSON.parse(s) as StoredMsg } catch { return null } }).filter(Boolean) as StoredMsg[]
}

export async function getConversations(addrRaw: string): Promise<ConvSummary[]> {
  const addr = addrRaw.toLowerCase()
  let cids: string[]
  if (useRedis) {
    cids = (await redis(['ZRANGE', `fb:uc:${addr}`, 0, -1, 'REV'])) || []
  } else {
    const z = memZ[`fb:uc:${addr}`] || {}
    cids = Object.keys(z).sort((a, b) => z[b] - z[a])
  }
  const out: ConvSummary[] = []
  for (const cid of cids) {
    const thread = await getThread(cid)
    const last = thread[thread.length - 1]
    out.push({ convId: cid, peer: peerOf(cid, addr), lastMessage: last?.text || '', lastSentAt: last?.ts || 0 })
  }
  return out
}

export { isAddr }
