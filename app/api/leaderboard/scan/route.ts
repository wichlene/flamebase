import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, fallback, parseAbiItem, type AbiEvent } from 'viem'
import { base } from 'viem/chains'
import { CONTRACT_ADDRESS } from '../../../../lib/contract'
import { TOOLS_ADDRESS, TOKEN_FACTORY_ADDRESS, NFT_FACTORY_ADDRESS, DAO_ADDRESS, FOLLOW_ADDRESS } from '../../../../lib/toolsContracts'
import { getHead, setHead, getTail, setTail, getFloor, setFloor, bumpScores, acquireScanLock, releaseScanLock } from '../../../../lib/leaderboardStore'

// Incremental on-chain scanner that builds the "Top Supporters" leaderboard:
// a total-actions-ever count per address, across every FlameBase-owned
// contract's events (posts, likes, comments, tips, check-ins, tool usage,
// DAO votes/proposals, follows, token/NFT deploys). A cron hits this every
// ~5 minutes; each run advances a persisted cursor by a bounded block range
// so a single request never times out, and the tally in Redis only ever
// grows — nothing is ever rescanned or double-counted.
//
// Deliberately excludes DEX trade volume (Launchpad swaps route through
// shared Uniswap/Aerodrome/Kyber contracts, not anything FlameBase owns, so
// there's no event log that cleanly attributes a swap to "a FlameBase user"
// specifically) — every source here is a contract FlameBase deployed itself.
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

type Source = { address: `0x${string}`; event: AbiEvent; argName: string }

function sources(): Source[] {
  const list: Source[] = []
  if (CONTRACT_ADDRESS) {
    list.push(
      { address: CONTRACT_ADDRESS, event: parseAbiItem('event ProfileCreated(address indexed user, string username)'), argName: 'user' },
      { address: CONTRACT_ADDRESS, event: parseAbiItem('event PostCreated(uint256 indexed postId, address indexed author, string content)'), argName: 'author' },
      { address: CONTRACT_ADDRESS, event: parseAbiItem('event Liked(uint256 indexed postId, address indexed from)'), argName: 'from' },
      { address: CONTRACT_ADDRESS, event: parseAbiItem('event Commented(uint256 indexed postId, address indexed from, string text)'), argName: 'from' },
      { address: CONTRACT_ADDRESS, event: parseAbiItem('event TipSent(uint256 indexed postId, address indexed from, address indexed to, uint256 amount)'), argName: 'from' },
      { address: CONTRACT_ADDRESS, event: parseAbiItem('event PhotoUploaded(address indexed user, string ipfsHash)'), argName: 'user' },
    )
  }
  if (TOOLS_ADDRESS) {
    list.push(
      { address: TOOLS_ADDRESS, event: parseAbiItem('event Counted(address indexed user, uint256 globalCount, uint256 userCount)'), argName: 'user' },
      { address: TOOLS_ADDRESS, event: parseAbiItem('event CheckedIn(address indexed user, uint256 streak)'), argName: 'user' },
      { address: TOOLS_ADDRESS, event: parseAbiItem('event Logged(address indexed user, string text)'), argName: 'user' },
      { address: TOOLS_ADDRESS, event: parseAbiItem('event Greeted(address indexed user, string greeting)'), argName: 'user' },
    )
  }
  if (TOKEN_FACTORY_ADDRESS) {
    list.push({ address: TOKEN_FACTORY_ADDRESS, event: parseAbiItem('event TokenDeployed(address indexed creator, address token, string name, string symbol, uint256 supply)'), argName: 'creator' })
  }
  if (NFT_FACTORY_ADDRESS) {
    list.push({ address: NFT_FACTORY_ADDRESS, event: parseAbiItem('event NFTDeployed(address indexed creator, address nft, string name, uint256 maxSupply, uint256 mintPrice)'), argName: 'creator' })
  }
  if (DAO_ADDRESS) {
    list.push(
      { address: DAO_ADDRESS, event: parseAbiItem('event ProposalCreated(uint256 indexed id, address indexed proposer, string title)'), argName: 'proposer' },
      { address: DAO_ADDRESS, event: parseAbiItem('event Voted(uint256 indexed proposalId, address indexed voter, bool support)'), argName: 'voter' },
    )
  }
  if (FOLLOW_ADDRESS) {
    list.push({ address: FOLLOW_ADDRESS, event: parseAbiItem('event Followed(address indexed follower, address indexed target)'), argName: 'follower' })
  }
  return list
}

// First-ever run seeds the cursor back to before FlameBase's contracts
// existed instead of scanning from Base genesis. Confirmed via BaseScan: the
// main contract has been active 69 days — 3.2M blocks (~74 days at ~2s/block)
// covers that with margin.
const BACKFILL_BLOCKS = 3_200_000n
const CHUNK = 9000n // public RPCs reject wider eth_getLogs ranges

// GitHub's free scheduled-workflow runner does NOT reliably fire every 5
// minutes as configured — on low-activity repos it silently skips most
// ticks (confirmed: notify-scan's own history shows runs 1-2 hours apart,
// not 5 minutes). A fixed chunks-per-run budget assumed frequent runs and
// left backfill far behind actual usage. Instead, keep scanning until wall
// clock time runs out (with margin under the 60s function limit) — however
// rarely GitHub actually invokes this, each invocation does as much work as
// it possibly can.
const TIME_BUDGET_MS = 50_000

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true
  const s = req.headers.get('x-notify-secret') || req.nextUrl.searchParams.get('key') || ''
  if (process.env.NOTIFY_SECRET && s === process.env.NOTIFY_SECRET) return true
  return false
}

// Scans [from, to] (inclusive) across every source and tallies the actors
// found. Returns how many action-events were counted.
async function scanRange(srcs: Source[], from: bigint, to: bigint): Promise<number> {
  const results = await Promise.all(
    srcs.map(s => client.getLogs({ address: s.address, event: s.event, fromBlock: from, toBlock: to }).catch(() => []))
  )
  const actors: string[] = []
  results.forEach((logs, idx) => {
    const argName = srcs[idx].argName
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const log of logs as any[]) {
      const addr = log.args?.[argName]
      if (addr) actors.push(addr as string)
    }
  })
  if (actors.length) await bumpScores(actors)
  return actors.length
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const srcs = sources()
  if (srcs.length === 0) {
    return NextResponse.json({ ok: false, error: 'no contracts configured' }, { status: 500 })
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
      // First run ever: nothing captured yet in either direction. Seed head
      // at the current tip (so the forward pass below has nothing to do —
      // there's no "since last run" gap on run #1) and tail at tip+1 (so the
      // backward pass starts by scanning the block right below it).
      head = latest
      tail = latest + 1n
      floor = latest > BACKFILL_BLOCKS ? latest - BACKFILL_BLOCKS : 0n
      await Promise.all([setHead(head), setTail(tail), setFloor(floor)])
    } else {
      // tail/floor were set together with head on the first run, so they exist too.
      head = storedHead
      tail = (await getTail()) as bigint
      floor = (await getFloor()) as bigint
      // BACKFILL_BLOCKS was widened after the initial estimate turned out too
      // shallow (BaseScan confirmed 69 days of real activity vs. the ~62
      // days first assumed) — if the already-stored floor is shallower than
      // what today's constant would target, push it deeper so backfill
      // doesn't stop short of real history that's still waiting to be
      // counted.
      const recomputedFloor = latest > BACKFILL_BLOCKS ? latest - BACKFILL_BLOCKS : 0n
      if (recomputedFloor < floor) {
        floor = recomputedFloor
        await setFloor(floor)
      }
    }

    const startedAt = Date.now()
    const timeLeft = () => Date.now() - startedAt < TIME_BUDGET_MS
    let totalActions = 0
    let chunksUsed = 0

    // 1) Freshness pass: whatever's landed since the last run, first —
    // never let backfill work starve live activity from showing up.
    if (head < latest) {
      let from = head + 1n
      while (from <= latest && timeLeft()) {
        const to = latest - from > CHUNK ? from + CHUNK : latest
        totalActions += await scanRange(srcs, from, to)
        chunksUsed++
        from = to + 1n
        head = to
        await setHead(head) // persisted per chunk: a mid-run cutoff loses no progress
      }
    }

    // 2) Backfill pass: walk backward from `tail` toward `floor` with
    // whatever time this run has left.
    while (tail > floor && timeLeft()) {
      const from = tail - CHUNK > floor ? tail - CHUNK : floor
      totalActions += await scanRange(srcs, from, tail - 1n)
      tail = from
      chunksUsed++
      await setTail(tail) // persisted per chunk, same reasoning as head above
    }

    return NextResponse.json({
      ok: true,
      head: head.toString(),
      tail: tail.toString(),
      floor: floor.toString(),
      backfillDone: tail <= floor,
      chunksUsed,
      actions: totalActions,
      elapsedMs: Date.now() - startedAt,
    })
  } finally {
    await releaseScanLock()
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
