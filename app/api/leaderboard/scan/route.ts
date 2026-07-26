import { NextRequest, NextResponse } from 'next/server'
import { createPublicClient, http, fallback, parseAbiItem, type AbiEvent } from 'viem'
import { base } from 'viem/chains'
import { CONTRACT_ADDRESS } from '../../../../lib/contract'
import { TOOLS_ADDRESS, TOKEN_FACTORY_ADDRESS, NFT_FACTORY_ADDRESS, DAO_ADDRESS, FOLLOW_ADDRESS } from '../../../../lib/toolsContracts'
import { getCursor, setCursor, bumpScores, acquireScanLock, releaseScanLock } from '../../../../lib/leaderboardStore'

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

// First-ever run seeds the cursor ~2 months back (FlameBase's contracts are
// younger than that) instead of scanning from Base genesis. ~2s/block.
const BACKFILL_BLOCKS = 2_700_000n
const CHUNK = 9000n // public RPCs reject wider eth_getLogs ranges
const CHUNKS_PER_RUN = 8 // ≈72,000 blocks/run — backfills 2 months in a few hours of 5-min ticks

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true
  const s = req.headers.get('x-notify-secret') || req.nextUrl.searchParams.get('key') || ''
  if (process.env.NOTIFY_SECRET && s === process.env.NOTIFY_SECRET) return true
  return false
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
    let cursor = await getCursor()
    if (cursor === null) {
      cursor = latest > BACKFILL_BLOCKS ? latest - BACKFILL_BLOCKS : 0n
    }
    if (cursor >= latest) {
      return NextResponse.json({ ok: true, scanned: 0, head: latest.toString() })
    }

    const startedFrom = cursor + 1n
    let from = startedFrom
    let totalActions = 0

    for (let i = 0; i < CHUNKS_PER_RUN && from <= latest; i++) {
      const to = latest - from > CHUNK ? from + CHUNK : latest
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
      totalActions += actors.length
      if (actors.length) await bumpScores(actors)

      if (to >= latest) { from = to + 1n; break }
      from = to + 1n
    }

    await setCursor(from - 1n)

    return NextResponse.json({
      ok: true,
      from: startedFrom.toString(),
      to: (from - 1n).toString(),
      head: latest.toString(),
      actions: totalActions,
    })
  } finally {
    await releaseScanLock()
  }
}

export async function GET(req: NextRequest) { return handle(req) }
export async function POST(req: NextRequest) { return handle(req) }
