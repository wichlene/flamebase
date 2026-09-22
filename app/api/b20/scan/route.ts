import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, fallback } from 'viem'
import { base } from 'viem/chains'
import {
  getHead, setHead, getTail, setTail, getFloor, setFloor,
  addTokens, acquireScanLock, releaseScanLock, type StoredB20Token,
} from '../../../../lib/b20Store'

// Incremental on-chain scanner for the B20 (tokenized-stock) factory's
// B20Created event, mirroring app/api/leaderboard/scan's exact design —
// see that file for the two-cursor rationale. This replaces having every
// visitor's browser re-scan the chain from their own device on every
// Launchpad load, which was slow (hundreds of chunked eth_getLogs calls
// over a public RPC, from a phone) and, worse, bounded to a shallow
// look-back window that missed tokens created before it.
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

const FACTORY = '0xB20f000000000000000000000000000000000000' as const
const B20_CREATED = {
  type: 'event', name: 'B20Created',
  inputs: [
    { indexed: true, name: 'token', type: 'address' },
    { indexed: true, name: 'variant', type: 'uint8' },
    { indexed: false, name: 'name', type: 'string' },
    { indexed: false, name: 'symbol', type: 'string' },
    { indexed: false, name: 'decimals', type: 'uint8' },
    { indexed: false, name: 'variantEventParams', type: 'bytes' },
  ],
} as const

const CHUNK = 9000n // public RPCs reject wider eth_getLogs ranges
// B20 went live on Base 2026-07-08. Backfill generously past that (with
// margin for the exact activation block being uncertain) rather than
// hardcode a launch block we're not 100% sure of.
const BACKFILL_BLOCKS = 3_500_000n
const TIME_BUDGET_MS = 50_000

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true
  const s = req.headers.get('x-notify-secret') || req.nextUrl.searchParams.get('key') || ''
  if (process.env.NOTIFY_SECRET && s === process.env.NOTIFY_SECRET) return true
  return false
}

async function scanRange(from: bigint, to: bigint): Promise<number> {
  const logs = await client.getLogs({ address: FACTORY, event: B20_CREATED, fromBlock: from, toBlock: to }).catch(() => [])
  const tokens: StoredB20Token[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const l of logs as any[]) {
    const a = l.args?.token as string | undefined
    if (!a) continue
    const d = Number(l.args?.decimals ?? 18)
    tokens.push({
      token: a,
      name: l.args?.name || 'B20',
      symbol: l.args?.symbol || '???',
      variant: Number(l.args?.variant ?? 0),
      block: (l.blockNumber ?? 0n).toString(),
      dec: d >= 1 && d <= 18 ? d : 18,
    })
  }
  if (tokens.length) await addTokens(tokens)
  return tokens.length
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  if (!(await acquireScanLock())) {
    return NextResponse.json({ ok: true, skipped: 'already running' })
  }

  try {
    const latest = await client.getBlockNumber()
    const storedHead = await getHead()
    let head: bigint
    let tail: bigint
    let floor: bigint

    if (storedHead === null) {
      head = latest
      tail = latest + 1n
      floor = latest > BACKFILL_BLOCKS ? latest - BACKFILL_BLOCKS : 0n
      await Promise.all([setHead(head), setTail(tail), setFloor(floor)])
    } else {
      head = storedHead
      tail = (await getTail()) as bigint
      floor = (await getFloor()) as bigint
    }

    const startedAt = Date.now()
    const timeLeft = () => Date.now() - startedAt < TIME_BUDGET_MS
    let totalFound = 0
    let chunksUsed = 0

    if (head < latest) {
      let from = head + 1n
      while (from <= latest && timeLeft()) {
        const to = latest - from > CHUNK ? from + CHUNK : latest
        totalFound += await scanRange(from, to)
        chunksUsed++
        from = to + 1n
        head = to
        await setHead(head)
      }
    }

    while (tail > floor && timeLeft()) {
      const from = tail - CHUNK > floor ? tail - CHUNK : floor
      totalFound += await scanRange(from, tail - 1n)
      tail = from
      chunksUsed++
      await setTail(tail)
    }

    return NextResponse.json({
      ok: true,
      head: head.toString(),
      tail: tail.toString(),
      floor: floor.toString(),
      backfillDone: tail <= floor,
      chunksUsed,
      tokensFound: totalFound,
      elapsedMs: Date.now() - startedAt,
    })
  } finally {
    await releaseScanLock()
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
