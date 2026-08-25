// Parse a fetch Response body as JSON without ever throwing.
//
// Why this exists: `await res.json()` throws a SyntaxError whenever the body
// isn't JSON — and plenty of real responses aren't. Vercel rejects oversized
// request bodies at the edge with a plain-text "Request Entity Too Large",
// gateways return HTML on 502/504, and rate-limited third-party APIs return
// prose. Every one of those turned into a nonsense
// `Unexpected token 'R', "Request En"... is not valid JSON` surfaced to the
// user, usually mislabelled as something unrelated (a failed transaction).
//
// Read the body as text first, then try to parse. Callers get `null` for
// "wasn't JSON" and can fall back to res.status/res.ok for a real message.
export async function safeJson<T = any>(res: Response): Promise<T | null> {
  let text: string
  try {
    text = await res.text()
  } catch {
    return null
  }
  if (!text) return null
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}

// The same idea for a body you've already read as text.
export function parseJson<T = any>(text: string): T | null {
  try {
    return JSON.parse(text) as T
  } catch {
    return null
  }
}
