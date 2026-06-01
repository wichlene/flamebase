import { NextResponse } from 'next/server'

// Blockscout v2 (base.blockscout.com) is the primary source — it is reliably
// reachable server-side from Vercel (the NFT endpoint already works), needs no
// API key, and exposes real counters for Base. Routescan/Etherscan are not
// reachable / not free for Base, so we no longer depend on them.
const BS_V2 = 'https://base.blockscout.com/api/v2'
const BS_COMPAT = 'https://base.blockscout.com/api'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

async function bsV2(path: string) {
  try {
    const res = await fetch(`${BS_V2}${path}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 120 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// Oldest tx timestamp (unix seconds) via Blockscout's Etherscan-compatible
// endpoint on the same reachable host — one tiny asc request, offset 1.
async function firstTxTimestamp(address: string): Promise<number> {
  try {
    const qs = new URLSearchParams({
      module: 'account', action: 'txlist', address,
      startblock: '0', endblock: '99999999', page: '1', offset: '1', sort: 'asc',
    }).toString()
    const res = await fetch(`${BS_COMPAT}?${qs}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 600 },
    })
    if (!res.ok) return 0
    const d = await res.json()
    const ts = Array.isArray(d?.result) ? parseInt(d.result[0]?.timeStamp, 10) : 0
    return isNaN(ts) ? 0 : ts
  } catch {
    return 0
  }
}

const num = (v: any) => {
  const n = parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10)
  return isNaN(n) ? 0 : n
}

// Walk the address transaction list (newest first) up to maxPages to derive
// volume, contract diversity, active days and the oldest tx seen.
async function txStats(address: string, maxPages = 16) {
  const lc = address.toLowerCase()
  let volumeWei = 0n
  const contractSet = new Set<string>()
  const activeDaysSet = new Set<string>()
  let contractCallCount = 0
  let oldestTs = 0
  let newestTs = 0
  let scanned = 0
  let next = ''

  for (let i = 0; i < maxPages; i++) {
    const d = await bsV2(`/addresses/${address}/transactions${next}`)
    const items: any[] = Array.isArray(d?.items) ? d.items : []
    if (items.length === 0) break

    for (const tx of items) {
      scanned++
      const ts = tx.timestamp ? Math.floor(new Date(tx.timestamp).getTime() / 1000) : 0
      if (ts) {
        if (!oldestTs || ts < oldestTs) oldestTs = ts
        if (ts > newestTs) newestTs = ts
      }
      const from = tx.from?.hash?.toLowerCase()
      if (from === lc) {
        if (tx.value && tx.value !== '0') {
          try { volumeWei += BigInt(tx.value) } catch { /* */ }
        }
        const to = tx.to?.hash?.toLowerCase()
        if (to) contractSet.add(to)
        if (tx.method || (tx.raw_input && tx.raw_input !== '0x')) contractCallCount++
        if (ts) {
          const dt = new Date(ts * 1000)
          activeDaysSet.add(`${dt.getUTCFullYear()}-${dt.getUTCMonth()}-${dt.getUTCDate()}`)
        }
      }
    }

    const np = d?.next_page_params
    if (!np) break
    next = `?${new URLSearchParams(np as Record<string, string>).toString()}`
  }

  return {
    volumeEth: parseFloat((Number(volumeWei) / 1e18).toFixed(4)),
    uniqueContracts: contractSet.size,
    activeDays: activeDaysSet.size,
    contractCallCount,
    oldestTs,
    newestTs,
    scanned,
    reachedEnd: scanned > 0 && !next, // best-effort
  }
}

export async function POST(request: Request) {
  try {
    const { address } = await request.json()
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Geçersiz adres' }, { status: 400 })
    }

    // All sourced from Blockscout (reachable, no key).
    const [counters, addrInfo, nftData, stats, firstTs] = await Promise.all([
      bsV2(`/addresses/${address}/counters`),          // real tx / token-transfer totals
      bsV2(`/addresses/${address}`),                   // coin balance
      bsV2(`/addresses/${address}/nft/collections?type=ERC-721,ERC-1155`),
      txStats(address),                                // volume / contracts / active days
      firstTxTimestamp(address),                       // accurate wallet age
    ])

    // Real totals from Blockscout counters
    const txCount = num(counters?.transactions_count)
    const tokenTransfers = num(counters?.token_transfers_count)

    // ETH balance (coin_balance is wei string)
    let ethBalance = 0
    const cb = addrInfo?.coin_balance
    if (typeof cb === 'string' && /^\d+$/.test(cb)) {
      ethBalance = parseFloat((Number(BigInt(cb)) / 1e18).toFixed(4))
    }

    const { volumeEth, uniqueContracts, activeDays, contractCallCount } = stats
    // Prefer the accurate first-tx timestamp; fall back to oldest scanned.
    const oldestTs = firstTs || stats.oldestTs

    // NFTs owned
    let nftCount = 0, nftCollections = 0
    if (Array.isArray(nftData?.items)) {
      nftCollections = nftData.items.length
      for (const col of nftData.items) {
        const n = parseInt(col.amount ?? col.value ?? '1', 10)
        nftCount += isNaN(n) ? 1 : n
      }
    }

    // Age — from the oldest tx we scanned. If we didn't reach the very first
    // tx (very active wallet), this is a lower bound, so flag it.
    let ageDays = 0, firstTxDate = '', ageApprox = false
    if (oldestTs) {
      ageDays = Math.floor((Date.now() - oldestTs * 1000) / 86400000)
      firstTxDate = new Date(oldestTs * 1000).toLocaleDateString('tr-TR')
      // Age is exact when it came from the dedicated first-tx lookup.
      if (!firstTs && txCount > stats.scanned && stats.scanned > 0) ageApprox = true
    }

    const txPerDay = ageDays > 0 ? (txCount / ageDays).toFixed(1) : '0'
    const hasMore = txCount > stats.scanned

    // Sybil signals
    const sybilFlags: string[] = []
    if (ageDays > 0 && ageDays < 30 && !ageApprox)  sybilFlags.push('Çok yeni cüzdan (<30 gün)')
    if (txCount > 50 && uniqueContracts < 3)         sybilFlags.push('Çok az contract çeşitliliği')
    if (nftCount === 0 && txCount > 30)              sybilFlags.push('Hiç NFT yok')
    if (Number(txPerDay) > 30)                       sybilFlags.push(`Günde ${txPerDay} TX — bot benzeri`)

    // Rule-based score (always computed — used as a floor for the AI score).
    let formulaScore = 0
    if (txCount >= 1000) formulaScore += 350; else if (txCount >= 500) formulaScore += 280; else if (txCount >= 100) formulaScore += 200; else if (txCount >= 50) formulaScore += 140; else if (txCount >= 20) formulaScore += 90; else if (txCount >= 1) formulaScore += 30
    if (nftCount >= 10) formulaScore += 150; else if (nftCount >= 1) formulaScore += 80
    if (ageDays >= 365) formulaScore += 250; else if (ageDays >= 180) formulaScore += 180; else if (ageDays >= 90) formulaScore += 110; else if (ageDays >= 30) formulaScore += 55
    if (uniqueContracts >= 20) formulaScore += 100; else if (uniqueContracts >= 10) formulaScore += 65; else if (uniqueContracts >= 3) formulaScore += 30
    if (tokenTransfers >= 100) formulaScore += 50; else if (tokenTransfers >= 10) formulaScore += 25
    formulaScore = Math.min(formulaScore, 1000)

    // AI
    let aiSummary = '', aiScore = 0, aiTier = 'D'
    let aiDropTokens = 0, aiDropUsd = 0
    let sybilRisk = sybilFlags.length >= 3 ? 'YÜKSEK' : sybilFlags.length >= 1 ? 'ORTA' : 'DÜŞÜK'
    let userType = '', dropRationale = ''

    if (process.env.GROQ_API_KEY && txCount > 0) {
      const prompt = `Base mainnet cüzdan verisini analiz et. SADECE JSON döndür, başka hiçbir şey yazma.

GERÇEK VERİ (Blockscout API):
- Toplam TX: ${txCount}
- Contract Çağrısı (taranan): ${contractCallCount}
- ERC-20/Token Transfer: ${tokenTransfers}
- NFT Bakiye: ${nftCount} (${nftCollections} koleksiyon)
- ETH Bakiye: ${ethBalance}
- Gönderilen ETH (taranan): ${volumeEth}
- Farklı Adres (taranan): ${uniqueContracts}
- Aktif Gün (taranan): ${activeDays}
- Cüzdan Yaşı: ${ageDays} gün${ageApprox ? '+ (en az)' : ''}${firstTxDate ? ` (ilk görülen: ${firstTxDate})` : ''}
- Günlük Ort TX: ${txPerDay}
- Sybil Uyarılar: ${sybilFlags.length > 0 ? sybilFlags.join(' | ') : 'YOK'}

JSON:
{"sybilRisk":"DÜŞÜK|ORTA|YÜKSEK","userType":"kısa","summary":"2-3 cümle","score":0,"tier":"D|C|B|A|S","dropTokens":0,"dropUsd":0,"dropRationale":"açıklama"}`

      try {
        const gr = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 280, temperature: 0.2 }),
        })
        const gd = await gr.json()
        const raw = gd.choices?.[0]?.message?.content?.trim() ?? ''
        const m = raw.match(/\{[\s\S]*\}/)
        if (m) {
          const p = JSON.parse(m[0])
          aiSummary    = p.summary ?? ''
          aiScore      = Math.min(1000, Math.max(0, parseInt(p.score) || 0))
          aiTier       = ['S','A','B','C','D'].includes(p.tier) ? p.tier : 'D'
          aiDropTokens = parseInt(p.dropTokens) || 0
          aiDropUsd    = parseInt(p.dropUsd) || 0
          sybilRisk    = ['DÜŞÜK','ORTA','YÜKSEK'].includes(p.sybilRisk) ? p.sybilRisk : sybilRisk
          userType     = p.userType ?? ''
          dropRationale= p.dropRationale ?? ''
        }
      } catch { /* fallback */ }
    }

    // AI score is a bonus on top of the formula — never goes below it.
    aiScore = Math.max(aiScore, formulaScore)
    if (!aiScore) aiScore = formulaScore
    aiTier = aiScore >= 800 ? 'S' : aiScore >= 600 ? 'A' : aiScore >= 400 ? 'B' : aiScore >= 200 ? 'C' : 'D'
    const tm: Record<string, number> = { S: 15000, A: 8000, B: 4000, C: 1500, D: 400 }
    if (!aiDropTokens) { aiDropTokens = tm[aiTier]; aiDropUsd = Math.round(aiDropTokens * 0.25) }

    return NextResponse.json({
      txCount, hasMore, contractCallCount, tokenTransfers,
      nftCount, nftCollections, ethBalance, volumeEth,
      uniqueContracts, activeDays, ageDays, ageApprox, firstTxDate, txPerDay,
      scanned: stats.scanned,
      sybilFlags, sybilRisk, userType, aiSummary, dropRationale,
      score: aiScore, tier: aiTier,
      estimatedTokens: aiDropTokens, estimatedUsd: aiDropUsd,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Hata' }, { status: 500 })
  }
}
