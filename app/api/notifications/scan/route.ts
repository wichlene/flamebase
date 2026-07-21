import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, fallback, parseAbiItem, formatEther, getAddress } from 'viem'
import { base } from 'viem/chains'
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../../../lib/contract'
import { getCursor, setCursor } from '../../../../lib/notifyStore'
import { sendPushTo, sendFarcasterTo, type Notif } from '../../../../lib/notifySend'

// On-chain watcher. A cron hits this; it reads the Social contract's Liked /
// Commented / TipSent events since the last scanned block and pushes a
// notification to the post's author (the person we want to pull back).
//
// Secured for Vercel Cron via `Authorization: Bearer <CRON_SECRET>`, and also
// callable manually with `x-notify-secret: <NOTIFY_SECRET>` for testing.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const client = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://mainnet.base.org'),
    http('https://base.drpc.org'),
    http('https://base-rpc.publicnode.com'),
    http('https://base.llamarpc.com'),
  ]),
})

const likedEvent = parseAbiItem('event Liked(uint256 indexed postId, address indexed from)')
const commentedEvent = parseAbiItem('event Commented(uint256 indexed postId, address indexed from, string text)')
const tipEvent = parseAbiItem('event TipSent(uint256 indexed postId, address indexed from, address indexed to, uint256 amount)')

// Cap how far a single run scans so an RPC getLogs never times out; the cursor
// catches up over subsequent runs.
const MAX_RANGE = 2000n

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true
  const s = req.headers.get('x-notify-secret') || req.nextUrl.searchParams.get('key') || ''
  if (process.env.NOTIFY_SECRET && s === process.env.NOTIFY_SECRET) return true
  return false
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

// Best-effort display name for the actor (falls back to a short address).
// viem may return the multi-output `profiles` as a tuple or a named object
// depending on version, so read defensively.
async function nameOf(addr: `0x${string}`): Promise<string> {
  try {
    const p = (await client.readContract({
      address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'profiles', args: [addr],
    })) as unknown
    const username = (Array.isArray(p) ? p[0] : (p as { username?: string })?.username) as string | undefined
    return username && username.trim() ? username : short(addr)
  } catch {
    return short(addr)
  }
}

async function authorOf(postId: bigint): Promise<`0x${string}` | null> {
  try {
    const post = (await client.readContract({
      address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'getPost', args: [postId],
    })) as unknown
    const author = (Array.isArray(post) ? post[1] : (post as { author?: `0x${string}` })?.author) as `0x${string}` | undefined
    return author ?? null
  } catch {
    return null
  }
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  if (!CONTRACT_ADDRESS) {
    return NextResponse.json({ ok: false, error: 'no contract configured' }, { status: 500 })
  }

  const latest = await client.getBlockNumber()
  const cursor = await getCursor()

  // First ever run: mark the current head and skip, so we never blast users
  // with a backlog of historical events on the first deploy.
  if (cursor === null) {
    await setCursor(latest)
    return NextResponse.json({ ok: true, initialized: true, head: latest.toString() })
  }
  if (cursor >= latest) {
    return NextResponse.json({ ok: true, scanned: 0, head: latest.toString() })
  }

  const fromBlock = cursor + 1n
  const toBlock = latest - fromBlock > MAX_RANGE ? fromBlock + MAX_RANGE : latest

  const [likes, comments, tips] = await Promise.all([
    client.getLogs({ address: CONTRACT_ADDRESS, event: likedEvent, fromBlock, toBlock }),
    client.getLogs({ address: CONTRACT_ADDRESS, event: commentedEvent, fromBlock, toBlock }),
    client.getLogs({ address: CONTRACT_ADDRESS, event: tipEvent, fromBlock, toBlock }),
  ])

  // Build (recipient, notification) jobs. Skip self-actions (liking your own
  // post shouldn't notify you).
  const jobs: { to: `0x${string}`; n: Notif }[] = []

  for (const log of likes) {
    const { postId, from } = log.args as { postId: bigint; from: `0x${string}` }
    const author = await authorOf(postId)
    if (!author || getAddress(author) === getAddress(from)) continue
    jobs.push({ to: author, n: { title: '🔥 New like', body: `${await nameOf(from)} liked your post`, url: `/post/${postId}`, tag: `like-${postId}` } })
  }
  for (const log of comments) {
    const { postId, from, text } = log.args as { postId: bigint; from: `0x${string}`; text: string }
    const author = await authorOf(postId)
    if (!author || getAddress(author) === getAddress(from)) continue
    const preview = (text || '').slice(0, 80)
    jobs.push({ to: author, n: { title: '💬 New comment', body: `${await nameOf(from)}: ${preview}`, url: `/post/${postId}`, tag: `comment-${postId}` } })
  }
  for (const log of tips) {
    const { postId, from, to, amount } = log.args as { postId: bigint; from: `0x${string}`; to: `0x${string}`; amount: bigint }
    if (getAddress(to) === getAddress(from)) continue
    jobs.push({ to, n: { title: '💸 You got tipped', body: `${await nameOf(from)} tipped you ${formatEther(amount)} ETH`, url: `/post/${postId}`, tag: `tip-${postId}-${from}` } })
  }

  let push = 0
  let farcaster = 0
  await Promise.all(jobs.map(async (j) => {
    const [p, f] = await Promise.all([sendPushTo(j.to, j.n), sendFarcasterTo(j.to, j.n)])
    push += p
    farcaster += f
  }))

  await setCursor(toBlock)

  return NextResponse.json({
    ok: true,
    from: fromBlock.toString(),
    to: toBlock.toString(),
    events: { likes: likes.length, comments: comments.length, tips: tips.length },
    jobs: jobs.length,
    delivered: { push, farcaster },
  })
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
