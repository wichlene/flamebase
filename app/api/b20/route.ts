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

// Official Coinbase tokenized stocks never emit the B20 factory's
// B20Created event — Base docs confirm they're native precompiles, not
// factory-deployed contracts, so app/api/b20/scan structurally can never
// find them no matter how far back it looks. They still answer standard
// ERC-20 reads, so fetch any missing ones directly rather than depending on
// the scan to have discovered them.
async function fetchMissingOfficialStocks(known: Set<string>): Promise<StoredB20Token[]> {
  const missing = Object.keys(OFFICIAL_TOKENIZED_STOCKS).filter(a => !known.has(a))
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
  const extra = await fetchMissingOfficialStocks(known)
  return NextResponse.json({ ok: true, tokens: [...scanned, ...extra] })
}
