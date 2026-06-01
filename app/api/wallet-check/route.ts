import { NextResponse } from 'next/server'

const BS = 'https://base.blockscout.com/api/v2'

async function get(url: string) {
  const res = await fetch(url, { headers: { Accept: 'application/json' }, next: { revalidate: 120 } })
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  return res.json()
}

export async function POST(request: Request) {
  try {
    const { address } = await request.json()
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Geçersiz adres' }, { status: 400 })
    }

    // 1. Address summary — gives accurate total tx + token_transfers + gas_used
    // 2. NFT collections
    // 3. Oldest tx (age) — sort asc, limit 1
    // 4. Newest 100 txs for ETH volume calc
    const [addrRes, nftRes, oldestRes, txRes] = await Promise.allSettled([
      get(`${BS}/addresses/${address}`),
      get(`${BS}/addresses/${address}/nft/collections?type=ERC-721,ERC-1155`),
      get(`${BS}/addresses/${address}/transactions?filter=from&sort=asc&limit=1`),
      get(`${BS}/addresses/${address}/transactions?filter=from&sort=desc&limit=100`),
    ])

    const addr   = addrRes.status   === 'fulfilled' ? addrRes.value   : {}
    const nfts   = nftRes.status    === 'fulfilled' ? nftRes.value    : { items: [] }
    const oldest = oldestRes.status === 'fulfilled' ? oldestRes.value : { items: [] }
    const txs    = txRes.status     === 'fulfilled' ? txRes.value     : { items: [] }

    // ── Real transaction count from Blockscout address summary ──
    const txCount: number = addr.transaction_count ?? 0
    const tokenTransfers: number = addr.token_transfers_count ?? 0
    const gasUsedWei: bigint = addr.gas_used ? BigInt(addr.gas_used) : BigInt(0)
    // gas_used is in gas units, not wei — multiply by avg gas price ~0.001 gwei for rough ETH cost
    const gasSpentEth = Number(gasUsedWei) * 1e-9 * 0.001

    // ── NFT count — sum across all collections ──
    let nftCount = 0
    if (Array.isArray(nfts.items)) {
      for (const col of nfts.items) {
        const n = parseInt(col.amount ?? col.token_instances?.length ?? '1', 10)
        nftCount += isNaN(n) ? 1 : n
      }
    }

    // ── Age on Base — from first ever tx timestamp ──
    let firstTxDaysAgo = 0
    let firstTxDate = ''
    const oldestItems: any[] = oldest.items ?? []
    if (oldestItems.length > 0 && oldestItems[0].timestamp) {
      const ms = Date.now() - new Date(oldestItems[0].timestamp).getTime()
      firstTxDaysAgo = Math.floor(ms / 86400000)
      firstTxDate = new Date(oldestItems[0].timestamp).toLocaleDateString('tr-TR')
    }

    // ── ETH Volume — sum value sent in last 100 txs ──
    let volumeWei = BigInt(0)
    const txItems: any[] = txs.items ?? []
    for (const tx of txItems) {
      if (tx.value && tx.value !== '0') {
        try { volumeWei += BigInt(tx.value) } catch { /* skip */ }
      }
    }
    const volumeEth = parseFloat((Number(volumeWei) / 1e18).toFixed(4))

    // ── Unique contracts interacted with (diversity score) ──
    const uniqueContracts = new Set(
      txItems.filter(tx => tx.to?.is_contract).map(tx => tx.to?.hash?.toLowerCase())
    ).size

    // ── Airdrop scoring ──
    let score = 0

    // TX count — max 350
    if (txCount >= 1000) score += 350
    else if (txCount >= 500) score += 280
    else if (txCount >= 100) score += 200
    else if (txCount >= 50) score += 140
    else if (txCount >= 20) score += 90
    else if (txCount >= 5)  score += 40
    else if (txCount >= 1)  score += 15

    // NFTs — max 150
    if (nftCount >= 20)     score += 150
    else if (nftCount >= 5) score += 100
    else if (nftCount >= 1) score += 55

    // Age — max 250
    if (firstTxDaysAgo >= 365)      score += 250
    else if (firstTxDaysAgo >= 180) score += 200
    else if (firstTxDaysAgo >= 90)  score += 130
    else if (firstTxDaysAgo >= 30)  score += 70
    else if (firstTxDaysAgo >= 7)   score += 25

    // Contract diversity — max 100
    if (uniqueContracts >= 20)     score += 100
    else if (uniqueContracts >= 10) score += 70
    else if (uniqueContracts >= 5)  score += 40
    else if (uniqueContracts >= 1)  score += 15

    // Token transfers — max 50
    if (tokenTransfers >= 200)     score += 50
    else if (tokenTransfers >= 50) score += 35
    else if (tokenTransfers >= 10) score += 20
    else if (tokenTransfers >= 1)  score += 8

    score = Math.min(score, 1000)

    const tier = score >= 800 ? 'S' : score >= 600 ? 'A' : score >= 400 ? 'B' : score >= 200 ? 'C' : 'D'

    // Drop estimate (hypothetical $BASE at $0.25)
    const TOKEN_PRICE = 0.25
    let estimatedTokens = 0
    if (score >= 800)      estimatedTokens = 15000
    else if (score >= 600) estimatedTokens = 8000
    else if (score >= 400) estimatedTokens = 4000
    else if (score >= 200) estimatedTokens = 1500
    else if (score >= 50)  estimatedTokens = 400

    return NextResponse.json({
      txCount,
      tokenTransfers,
      nftCount,
      volumeEth,
      gasSpentEth: parseFloat(gasSpentEth.toFixed(6)),
      uniqueContracts,
      firstTxDaysAgo,
      firstTxDate,
      score,
      tier,
      estimatedTokens,
      estimatedUsd: parseFloat((estimatedTokens * TOKEN_PRICE).toFixed(0)),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Veri çekilemedi' }, { status: 500 })
  }
}
