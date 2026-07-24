import { TwitterApi } from 'twitter-api-v2'

// Auto-poster for X: Groq writes a fresh, varied post each time (no hashtags,
// human tone), then we post it and remember it so the next one doesn't repeat.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ''
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
const useRedis = Boolean(REDIS_URL && REDIS_TOKEN)

async function redis(cmd: (string | number)[]): Promise<unknown> {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  return (data as { result?: unknown })?.result
}

const memHistory: string[] = []

async function recentPosts(): Promise<string[]> {
  if (useRedis) return ((await redis(['LRANGE', 'fb:xposts', 0, 14])) as string[]) || []
  return memHistory.slice(0, 15)
}
async function remember(text: string): Promise<void> {
  if (useRedis) {
    await redis(['LPUSH', 'fb:xposts', text])
    await redis(['LTRIM', 'fb:xposts', 0, 49])
  } else {
    memHistory.unshift(text)
    if (memHistory.length > 50) memHistory.length = 50
  }
}

// Rotating angle so consecutive posts come at the topic from different sides.
const ANGLES = [
  'why a fully on-chain social network matters (no database, the chain IS the feed)',
  'a concrete FlameBase feature: on-chain posts, ETH tips going 100% to the author, one-click token launch, or the on-chain DAO',
  'the x402 pay-per-use AI angle — an agent you pay a cent per message on Base',
  'Base ecosystem momentum and builder energy right now',
  'onchain ownership vs web2: own your posts, your followers, your tips',
  'a shipping-in-public builder update vibe',
  'agentic commerce on Base and where it is heading',
  'an invitation to try FlameBase or build on Base',
  'a short, punchy thought about the future of onchain social',
  'Coinbase Verified identity on-chain and why real identity + onchain is powerful',
]

export async function generatePost(): Promise<string> {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured')
  const recent = await recentPosts()
  const angle = ANGLES[Math.floor(Math.random() * ANGLES.length)]
  const sys =
    `You write short, punchy posts for X (Twitter) for FlameBase — a fully on-chain ` +
    `social network on Base where every post, like, comment and tip is a real transaction. ` +
    `Voice: confident builder, human, a little playful. Sometimes mention flamebase.xyz, not always.\n\n` +
    `HARD RULES:\n- ONE post only.\n- Under 260 characters.\n- NO hashtags whatsoever.\n` +
    `- At most one emoji (often zero).\n- No surrounding quotes.\n- Don't sound like a corporate ad.\n` +
    `- Vary sentence structure and opening word from post to post.\n\n` +
    `This post's angle: ${angle}.\n\n` +
    (recent.length
      ? `Do NOT repeat or closely paraphrase any of these recent posts:\n${recent.map(r => '- ' + r).join('\n')}`
      : '')
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: 'Write the post now. Output only the post text.' },
      ],
      // gpt-oss-120b spends part of its token budget on hidden reasoning before
      // the visible reply — 180 was too tight and left nothing for the actual
      // post, producing empty output. Give it real headroom.
      max_tokens: 600,
      temperature: 1.05,
    }),
    cache: 'no-store',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Groq ${res.status}: ${data?.error?.message || 'request failed'}`)
  }
  let text = (data?.choices?.[0]?.message?.content || '').trim()
  if (!text) {
    throw new Error(`Groq returned empty content (finish_reason: ${data?.choices?.[0]?.finish_reason || 'unknown'})`)
  }
  text = text.replace(/^["']+|["']+$/g, '').replace(/#\w+/g, '').replace(/\s{2,}/g, ' ').trim()
  if (text.length > 275) text = text.slice(0, 272).trimEnd() + '…'
  return text
}

async function postToX(text: string): Promise<{ id: string }> {
  const client = new TwitterApi({
    appKey: process.env.X_API_KEY || '',
    appSecret: process.env.X_API_SECRET || '',
    accessToken: process.env.X_ACCESS_TOKEN || '',
    accessSecret: process.env.X_ACCESS_SECRET || '',
  })
  const r = await client.v2.tweet(text)
  return { id: r.data.id }
}

export async function generateAndPost(): Promise<{ text: string; id: string }> {
  if (!process.env.X_API_KEY || !process.env.X_ACCESS_TOKEN) throw new Error('X API keys not configured')
  const text = await generatePost()
  if (!text) throw new Error('empty generation')
  const { id } = await postToX(text)
  await remember(text)
  return { text, id }
}
