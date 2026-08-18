import { NextResponse } from 'next/server'

export const maxDuration = 60

const BS_V2 = 'https://base.blockscout.com/api/v2'
const BS_COMPAT = 'https://base.blockscout.com/api'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
// Groq deprecated llama-3.3-70b-versatile (2026-06-17); openai/gpt-oss-120b is its replacement.
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

async function bsV2(path: string) {
  try {
    const res = await fetch(`${BS_V2}${path}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 120 },
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

async function firstTxTimestamp(address: string): Promise<number> {
  try {
    const qs = new URLSearchParams({
      module: 'account', action: 'txlist', address,
      startblock: '0', endblock: '99999999', page: '1', offset: '1', sort: 'asc',
    }).toString()
    const res = await fetch(`${BS_COMPAT}?${qs}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(8000),
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

function toDateKey(ts: number): string {
  const dt = new Date(ts * 1000)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

async function txStats(address: string, maxPages = 16) {
  const lc = address.toLowerCase()
  let volumeWei = 0n
  const contractSet = new Set<string>()
  const dailyTxMap = new Map<string, number>()
  let contractCallCount = 0
  let oldestTs = 0
  let scanned = 0
  let next = ''

  for (let i = 0; i < maxPages; i++) {
    let d = await bsV2(`/addresses/${address}/transactions${next}`)
    // bsV2() returns null ONLY when the fetch/parse itself failed (timeout,
    // non-2xx, thrown exception) — a legitimate "no more pages" is a real
    // JSON object with an empty `items` array, never null. So a null here is
    // unambiguously a transient failure, on ANY page, not "end of data";
    // retrying once is always correct. Without this, a failure on page 2+
    // silently truncates the scan and under-reports activity/streaks/heatmap
    // for wallets with more history than what got scanned before it hit.
    if (d === null) d = await bsV2(`/addresses/${address}/transactions${next}`)
    const items: any[] = Array.isArray(d?.items) ? d.items : []
    if (items.length === 0) break

    for (const tx of items) {
      scanned++
      const from = tx.from?.hash?.toLowerCase()
      if (from === lc) {
        // Only count OUTGOING transactions for activity metrics
        const ts = tx.timestamp ? Math.floor(new Date(tx.timestamp).getTime() / 1000) : 0
        if (ts) {
          if (!oldestTs || ts < oldestTs) oldestTs = ts
          const dk = toDateKey(ts)
          dailyTxMap.set(dk, (dailyTxMap.get(dk) || 0) + 1)
        }
        if (tx.value && tx.value !== '0') {
          try { volumeWei += BigInt(tx.value) } catch { /* */ }
        }
        // Only count unique CONTRACTS, not every EOA the wallet sent ETH to —
        // otherwise plain transfers inflate the "unique contracts" score/badge.
        const to = tx.to?.hash?.toLowerCase()
        if (to && tx.to?.is_contract) contractSet.add(to)
        if (tx.method || (tx.raw_input && tx.raw_input !== '0x')) contractCallCount++
      }
    }

    const np = d?.next_page_params
    if (!np) break
    next = `?${new URLSearchParams(np as Record<string, string>).toString()}`
  }

  // Streaks
  const sortedDays = [...dailyTxMap.keys()].sort()
  let longestStreak = 0, tempStreak = 0
  let prevDate: Date | null = null
  for (const day of sortedDays) {
    const dt = new Date(day + 'T00:00:00Z')
    if (prevDate) {
      const diff = Math.round((dt.getTime() - prevDate.getTime()) / 86400000)
      if (diff === 1) { tempStreak++ } else { longestStreak = Math.max(longestStreak, tempStreak); tempStreak = 1 }
    } else { tempStreak = 1 }
    prevDate = dt
  }
  longestStreak = Math.max(longestStreak, tempStreak)

  // Current streak backward from today
  let currentStreak = 0
  const cd = new Date(); cd.setUTCHours(0, 0, 0, 0)
  for (let i = 0; i < 365; i++) {
    const k = toDateKey(Math.floor(cd.getTime() / 1000))
    if (dailyTxMap.has(k)) { currentStreak++; cd.setUTCDate(cd.getUTCDate() - 1) } else break
  }

  const activeDays = dailyTxMap.size
  const activeWeeks = new Set([...dailyTxMap.keys()].map(d => {
    const dt = new Date(d + 'T00:00:00Z')
    return Math.floor(dt.getTime() / (7 * 86400000))
  })).size
  const activeMonths = new Set([...dailyTxMap.keys()].map(d => d.slice(0, 7))).size

  // Daily activity for heatmap — last 364 days
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const startDate = new Date(today); startDate.setUTCDate(startDate.getUTCDate() - 363)
  const dailyActivity: { date: string; count: number }[] = []
  const cur = new Date(startDate)
  while (cur <= today) {
    const k = toDateKey(Math.floor(cur.getTime() / 1000))
    dailyActivity.push({ date: k, count: dailyTxMap.get(k) || 0 })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  return {
    volumeEth: parseFloat((Number(volumeWei) / 1e18).toFixed(4)),
    uniqueContracts: contractSet.size,
    activeDays,
    activeWeeks,
    activeMonths,
    contractCallCount,
    currentStreak,
    longestStreak,
    oldestTs,
    scanned,
    dailyActivity,
  }
}

export async function POST(request: Request) {
  try {
    const { address } = await request.json()
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
    }

    const [counters, addrInfo, nftData, stats, firstTs] = await Promise.all([
      bsV2(`/addresses/${address}/counters`),
      bsV2(`/addresses/${address}`),
      bsV2(`/addresses/${address}/nft/collections?type=ERC-721,ERC-1155`),
      txStats(address),
      firstTxTimestamp(address),
    ])

    const txCount = num(counters?.transactions_count)
    const tokenTransfers = num(counters?.token_transfers_count)

    let ethBalance = 0
    const cb = addrInfo?.coin_balance
    if (typeof cb === 'string' && /^\d+$/.test(cb)) {
      ethBalance = parseFloat((Number(BigInt(cb)) / 1e18).toFixed(4))
    }

    const { volumeEth, uniqueContracts, activeDays, contractCallCount, currentStreak, longestStreak, activeWeeks, activeMonths, dailyActivity, oldestTs } = stats

    // NFTs
    let nftCount = 0, nftCollections = 0
    const nftList: { name: string; symbol: string; count: number }[] = []
    if (Array.isArray(nftData?.items)) {
      nftCollections = nftData.items.length
      for (const col of nftData.items) {
        const n = parseInt(col.amount ?? col.value ?? '1', 10)
        nftCount += isNaN(n) ? 1 : n
        nftList.push({
          name: col.token?.name || 'Unknown NFT',
          symbol: col.token?.symbol || '',
          count: isNaN(n) ? 1 : n,
        })
      }
    }

    const oldestFinal = firstTs || oldestTs
    let ageDays = 0, firstTxDate = '', ageApprox = false
    if (oldestFinal) {
      ageDays = Math.floor((Date.now() - oldestFinal * 1000) / 86400000)
      firstTxDate = new Date(oldestFinal * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
      if (!firstTs && txCount > stats.scanned && stats.scanned > 0) ageApprox = true
    }

    const txPerDay = ageDays > 0 ? (txCount / ageDays).toFixed(1) : '0'
    const hasMore = txCount > stats.scanned

    // Badges
    const badges: string[] = []
    if (ageDays >= 365) badges.push('🏆 OG User')
    if (ageDays >= 90 && txCount >= 50) badges.push('⚡ Base Regular')
    if (txCount >= 1000) badges.push('🔥 Power User')
    else if (txCount >= 500) badges.push('💪 Active User')
    if (nftCount >= 10) badges.push('🖼️ Collector')
    else if (nftCount >= 1) badges.push('🎨 NFT Holder')
    if (tokenTransfers >= 100) badges.push('💱 DeFi Degen')
    if (longestStreak >= 7) badges.push('⚡ Streak Master')
    if (ethBalance >= 1) badges.push('🐳 Whale')
    if (uniqueContracts >= 50) badges.push('🏗️ Builder')
    if (activeMonths >= 6) badges.push('📅 6mo+ Active')

    // Sybil
    const sybilFlags: string[] = []
    if (ageDays > 0 && ageDays < 30 && !ageApprox) sybilFlags.push('Very new wallet (<30 days)')
    if (txCount > 50 && uniqueContracts < 3)         sybilFlags.push('Very few unique contract interactions')
    if (nftCount === 0 && txCount > 30)              sybilFlags.push('No NFTs held')
    if (Number(txPerDay) > 30)                       sybilFlags.push(`High TX rate: ${txPerDay}/day — bot-like`)

    // Formula score (/100) — requires at least 1 outgoing TX to qualify
    let formulaScore = 0
    if (txCount === 0) formulaScore = 0 // no activity = no score
    else if (txCount >= 1000) formulaScore += 35; else if (txCount >= 500) formulaScore += 28; else if (txCount >= 100) formulaScore += 20; else if (txCount >= 50) formulaScore += 14; else if (txCount >= 20) formulaScore += 9; else formulaScore += 3
    if (nftCount >= 10) formulaScore += 15; else if (nftCount >= 1) formulaScore += 8
    if (ageDays >= 365) formulaScore += 25; else if (ageDays >= 180) formulaScore += 18; else if (ageDays >= 90) formulaScore += 11; else if (ageDays >= 30) formulaScore += 6
    if (uniqueContracts >= 20) formulaScore += 10; else if (uniqueContracts >= 10) formulaScore += 7; else if (uniqueContracts >= 3) formulaScore += 3
    if (tokenTransfers >= 100) formulaScore += 5; else if (tokenTransfers >= 10) formulaScore += 3
    if (longestStreak >= 7) formulaScore += 5; else if (longestStreak >= 3) formulaScore += 2
    if (activeMonths >= 6) formulaScore += 5; else if (activeMonths >= 3) formulaScore += 2
    formulaScore = Math.min(formulaScore, 100)

    // AI
    let aiSummary = '', aiScore = 0, aiTier = 'D'
    let aiDropTokens = 0, aiDropUsd = 0
    let sybilRisk = sybilFlags.length >= 3 ? 'HIGH' : sybilFlags.length >= 1 ? 'MEDIUM' : 'LOW'
    let userType = '', dropRationale = ''

    if (process.env.GROQ_API_KEY && txCount > 0) {
      const prompt = `Analyze this Base mainnet wallet. Return ONLY valid JSON, no extra text.

DATA:
- TX: ${txCount}, Token Transfers: ${tokenTransfers}, NFTs: ${nftCount} (${nftCollections} collections)
- ETH balance: ${ethBalance}, Volume sent: ${volumeEth} ETH
- Unique contracts: ${uniqueContracts}, Active days: ${activeDays}, Active months: ${activeMonths}
- Age: ${ageDays} days, Current streak: ${currentStreak}d (max: ${longestStreak}d)
- Sybil flags: ${sybilFlags.length > 0 ? sybilFlags.join(' | ') : 'NONE'}

Return JSON (score 0-100; OP airdrop context: ~500 TX qualified, top wallets got 10k+ tokens at ~$0.25 each):
Drop estimate ranges (tokens / USD): S=12000-20000/$3000-5000, A=6000-10000/$1500-2500, B=2500-5000/$625-1250, C=800-2000/$200-500, D=200-500/$50-125
{"sybilRisk":"LOW|MEDIUM|HIGH","userType":"short label","summary":"2-3 sentences in English","score":0,"tier":"D|C|B|A|S","dropTokens":0,"dropUsd":0,"dropRationale":"brief explanation"}`

      try {
        const gr = await fetch(GROQ_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 280, temperature: 0.2 }),
          signal: AbortSignal.timeout(20000),
        })
        const gd = await gr.json()
        const raw = gd.choices?.[0]?.message?.content?.trim() ?? ''
        const m = raw.match(/\{[\s\S]*\}/)
        if (m) {
          const p = JSON.parse(m[0])
          aiSummary    = p.summary ?? ''
          aiScore      = Math.min(100, Math.max(0, parseInt(p.score) || 0))
          aiTier       = ['S','A','B','C','D'].includes(p.tier) ? p.tier : 'D'
          aiDropTokens = parseInt(p.dropTokens) || 0
          aiDropUsd    = parseInt(p.dropUsd) || 0
          sybilRisk    = ['LOW','MEDIUM','HIGH'].includes(p.sybilRisk) ? p.sybilRisk : sybilRisk
          userType     = p.userType ?? ''
          dropRationale= p.dropRationale ?? ''
        }
      } catch { /* fallback */ }
    }

    const finalScore = txCount === 0 ? 0 : Math.max(aiScore, formulaScore)
    const finalTier = finalScore >= 80 ? 'S' : finalScore >= 60 ? 'A' : finalScore >= 40 ? 'B' : finalScore >= 20 ? 'C' : 'D'
    // No drop estimate for wallets with zero outgoing transactions
    if (txCount === 0) {
      aiDropTokens = 0; aiDropUsd = 0
    } else {
      // Tier floor — AI can't give less than tier baseline
      const tierFloor: Record<string, number> = { S: 12000, A: 6000, B: 2500, C: 800, D: 200 }
      const floorTokens = tierFloor[finalTier] || 200
      aiDropTokens = Math.max(aiDropTokens || 0, floorTokens)
      aiDropUsd = Math.round(aiDropTokens * 0.25)
    }

    return NextResponse.json({
      txCount, hasMore, contractCallCount, tokenTransfers,
      nftCount, nftCollections, nftList,
      ethBalance, volumeEth,
      uniqueContracts, activeDays, activeWeeks, activeMonths,
      ageDays, ageApprox, firstTxDate, txPerDay,
      currentStreak, longestStreak,
      dailyActivity,
      scanned: stats.scanned,
      sybilFlags, sybilRisk, userType, aiSummary, dropRationale,
      badges,
      score: finalScore, tier: finalTier,
      estimatedTokens: aiDropTokens, estimatedUsd: aiDropUsd,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
  }
}
