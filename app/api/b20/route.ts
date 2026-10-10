import { NextResponse } from 'next/server'
import { createPublicClient, erc20Abi } from 'viem'
import { base } from 'viem/chains'
import { getAllTokens, type StoredB20Token } from '../../../lib/b20Store'
import { OFFICIAL_TOKENIZED_STOCKS } from '../../../lib/tokenizedStocks'
import { baseRpcTransport } from '../../../lib/baseRpc'

// Public read endpoint for the Launchpad's DEX token list — pre-scanned by
// app/api/b20/scan, so the client does one fast fetch instead of hundreds of
// chunked eth_getLogs calls over a public RPC from the visitor's own device.
export const dynamic = 'force-dynamic'

const client = createPublicClient({ chain: base, transport: baseRpcTransport() })

// Official tokenized stocks are precompiles with a fixed, essentially never-
// changing name/symbol/decimals — but since app/api/b20/scan structurally
// can never discover them (see below), every single GET without a cache was
// re-reading all of them live over RPC (12 tokens × 3 calls each), on every
// Launchpad page load, for every visitor. Cache the result for a day.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || ''
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''
const useRedis = Boolean(REDIS_URL && REDIS_TOKEN)
const CACHE_TTL_SECONDS = 24 * 60 * 60

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

async function getCachedOfficialStocks(): Promise<StoredB20Token[] | null> {
  if (!useRedis) return null
  try {
    const raw = await redis(['GET', 'fb:b20:officialMeta'])
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

async function setCachedOfficialStocks(tokens: StoredB20Token[]): Promise<void> {
  if (!useRedis || tokens.length === 0) return
  try {
    await redis(['SET', 'fb:b20:officialMeta', JSON.stringify(tokens), 'EX', CACHE_TTL_SECONDS])
  } catch { /* cache is an optimization, not a requirement */ }
}

// Official Coinbase tokenized stocks never emit the B20 factory's
// B20Created event — Base docs confirm they're native precompiles, not
// factory-deployed contracts, so app/api/b20/scan structurally can never
// find them no matter how far back it looks. They still answer standard
// ERC-20 reads, so fetch any missing ones directly rather than depending on
// the scan to have discovered them.
async function fetchOfficialStocksLive(missing: string[]): Promise<StoredB20Token[]> {
  if (missing.length === 0) return []
  const results = await Promise.all(missing.map(async (addr) => {
    const address = addr as `0x${string}`
    try {
      const [name, symbol, dec] = await Promise.all([
        client.readContract({ address, abi: erc20Abi, functionName: 'name' }),
        client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
        client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
      ])
      const d = Number(dec)
      const token: StoredB20Token = {
        token: address,
        name: name || OFFICIAL_TOKENIZED_STOCKS[addr],
        symbol: symbol || OFFICIAL_TOKENIZED_STOCKS[addr],
        variant: 0,
        block: '0',
        dec: d >= 1 && d <= 18 ? d : 18,
      }
      return token
    } catch {
      return null
    }
  }))
  return results.filter((t): t is StoredB20Token => t !== null)
}

export async function GET() {
  const scanned = await getAllTokens()
  const known = new Set(scanned.map(t => t.token.toLowerCase()))
  const allOfficial = Object.keys(OFFICIAL_TOKENIZED_STOCKS)

  let extra = await getCachedOfficialStocks()
  if (!extra) {
    extra = await fetchOfficialStocksLive(allOfficial.filter(a => !known.has(a)))
    await setCachedOfficialStocks(extra)
  }
  // The cache may predate a newly added ticker in OFFICIAL_TOKENIZED_STOCKS —
  // top up with a live read for anything the cache doesn't cover yet.
  const haveMeta = new Set(extra.map(t => t.token.toLowerCase()))
  const stillMissing = allOfficial.filter(a => !known.has(a) && !haveMeta.has(a))
  if (stillMissing.length > 0) {
    const fresh = await fetchOfficialStocksLive(stillMissing)
    extra = [...extra, ...fresh]
    await setCachedOfficialStocks(extra)
  }

  return NextResponse.json({ ok: true, tokens: [...scanned, ...extra] })
}
