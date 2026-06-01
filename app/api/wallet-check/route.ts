import { NextResponse } from 'next/server'

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 60 } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function POST(request: Request) {
  try {
    const { address } = await request.json()
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
    }

    const base = 'https://base.blockscout.com/api/v2'

    // Parallel fetch: address stats + NFT collections + recent txs
    const [addrData, nftData, txData] = await Promise.allSettled([
      fetchJson(`${base}/addresses/${address}`),
      fetchJson(`${base}/addresses/${address}/nft/collections?type=ERC-721,ERC-1155`),
      fetchJson(`${base}/addresses/${address}/transactions?filter=from&limit=50`),
    ])

    const addr = addrData.status === 'fulfilled' ? addrData.value : {}
    const nfts = nftData.status === 'fulfilled' ? nftData.value : { items: [] }
    const txs = txData.status === 'fulfilled' ? txData.value : { items: [] }

    const txCount: number = addr.transaction_count ?? 0
    const tokenTransfers: number = addr.token_transfers_count ?? 0
    const gasUsed: string = addr.gas_used ?? '0'

    // NFT count
    let nftCount = 0
    if (nfts.items) {
      for (const col of nfts.items) {
        nftCount += col.amount ? parseInt(col.amount) : (col.token_instances?.length ?? 1)
      }
    }

    // Volume: sum ETH value from fetched txs
    let volumeWei = BigInt(0)
    const txList: any[] = txs.items ?? []
    for (const tx of txList) {
      if (tx.value) volumeWei += BigInt(tx.value)
    }
    const volumeEth = Number(volumeWei) / 1e18

    // First tx date for age calculation
    let firstTxDaysAgo = 0
    if (txList.length > 0) {
      const oldest = txList[txList.length - 1]
      if (oldest.timestamp) {
        const ms = Date.now() - new Date(oldest.timestamp).getTime()
        firstTxDaysAgo = Math.floor(ms / 86400000)
      }
    }

    // ── Airdrop scoring (speculative) ──
    let score = 0

    // TX count (max 350)
    if (txCount >= 500) score += 350
    else if (txCount >= 100) score += 250
    else if (txCount >= 50) score += 180
    else if (txCount >= 20) score += 120
    else if (txCount >= 10) score += 70
    else if (txCount >= 1) score += 30

    // NFT ownership (max 150)
    if (nftCount >= 10) score += 150
    else if (nftCount >= 5) score += 100
    else if (nftCount >= 1) score += 60

    // Age on Base (max 250)
    if (firstTxDaysAgo >= 365) score += 250
    else if (firstTxDaysAgo >= 180) score += 200
    else if (firstTxDaysAgo >= 90) score += 150
    else if (firstTxDaysAgo >= 30) score += 80
    else if (firstTxDaysAgo >= 7) score += 30

    // Volume (max 200)
    if (volumeEth >= 5) score += 200
    else if (volumeEth >= 1) score += 150
    else if (volumeEth >= 0.1) score += 80
    else if (volumeEth > 0) score += 30

    // Token transfers activity (max 50)
    if (tokenTransfers >= 100) score += 50
    else if (tokenTransfers >= 20) score += 30
    else if (tokenTransfers >= 1) score += 10

    score = Math.min(score, 1000)
    const tier = score >= 800 ? 'S' : score >= 600 ? 'A' : score >= 400 ? 'B' : score >= 200 ? 'C' : 'D'

    // Estimated token allocation (hypothetical Base token, price $0.25 speculative)
    const TOKEN_PRICE_USD = 0.25
    let estimatedTokens = 0
    if (score >= 800) estimatedTokens = 12000
    else if (score >= 600) estimatedTokens = 7000
    else if (score >= 400) estimatedTokens = 3500
    else if (score >= 200) estimatedTokens = 1200
    else if (score >= 50) estimatedTokens = 300
    const estimatedUsd = estimatedTokens * TOKEN_PRICE_USD

    return NextResponse.json({
      txCount,
      tokenTransfers,
      nftCount,
      volumeEth: parseFloat(volumeEth.toFixed(4)),
      gasUsedGwei: Math.floor(Number(gasUsed) / 1e9),
      firstTxDaysAgo,
      score,
      tier,
      estimatedTokens,
      estimatedUsd,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to fetch wallet data' }, { status: 500 })
  }
}
