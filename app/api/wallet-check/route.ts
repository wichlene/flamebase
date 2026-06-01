import { NextResponse } from 'next/server'

const BS = 'https://base.blockscout.com/api/v2'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

async function bsFetch(path: string) {
  const res = await fetch(`${BS}${path}`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 120 },
  })
  if (!res.ok) return null
  return res.json()
}

export async function POST(request: Request) {
  try {
    const { address } = await request.json()
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Geçersiz adres' }, { status: 400 })
    }

    // Fetch everything in parallel
    const [addrData, nftData, oldestTxData, recentTxData] = await Promise.all([
      bsFetch(`/addresses/${address}`),
      bsFetch(`/addresses/${address}/nft/collections?type=ERC-721,ERC-1155`),
      bsFetch(`/addresses/${address}/transactions?filter=from&sort=asc&limit=1`),
      bsFetch(`/addresses/${address}/transactions?filter=from&sort=desc&limit=50`),
    ])

    // ── Raw stats ──
    const txCount: number = addrData?.transaction_count ?? 0
    const tokenTransfers: number = addrData?.token_transfers_count ?? 0
    const ethBalanceWei: bigint = addrData?.coin_balance ? BigInt(addrData.coin_balance) : 0n
    const ethBalance = parseFloat((Number(ethBalanceWei) / 1e18).toFixed(4))

    // NFTs
    let nftCount = 0
    let nftCollections = 0
    if (Array.isArray(nftData?.items)) {
      nftCollections = nftData.items.length
      for (const col of nftData.items) {
        const n = parseInt(col.amount ?? col.value ?? '1', 10)
        nftCount += isNaN(n) ? 1 : n
      }
    }

    // Age — from oldest transaction
    let ageDays = 0
    let firstTxDate = ''
    const firstTx = oldestTxData?.items?.[0]
    if (firstTx?.timestamp) {
      const ms = Date.now() - new Date(firstTx.timestamp).getTime()
      ageDays = Math.floor(ms / 86400000)
      firstTxDate = new Date(firstTx.timestamp).toLocaleDateString('tr-TR')
    }

    // Recent txs — volume + unique contracts
    const recentTxs: any[] = recentTxData?.items ?? []
    let volumeWei = 0n
    const contractSet = new Set<string>()
    let activeDaysSet = new Set<string>()
    let contractTxCount = 0

    for (const tx of recentTxs) {
      if (tx.value && tx.value !== '0') {
        try { volumeWei += BigInt(tx.value) } catch { /* skip */ }
      }
      if (tx.to?.hash) {
        contractSet.add(tx.to.hash.toLowerCase())
        if (tx.to.is_contract) contractTxCount++
      }
      if (tx.timestamp) {
        activeDaysSet.add(new Date(tx.timestamp).toDateString())
      }
    }

    const volumeEth = parseFloat((Number(volumeWei) / 1e18).toFixed(4))
    const uniqueContracts = contractSet.size
    const activeDays = activeDaysSet.size

    // ── Sybil signals ──
    const txPerDay = ageDays > 0 ? (txCount / ageDays).toFixed(2) : '0'
    const contractDiversity = uniqueContracts > 0 && recentTxs.length > 0
      ? ((uniqueContracts / recentTxs.length) * 100).toFixed(0)
      : '0'
    const sybilFlags: string[] = []
    if (ageDays < 30) sybilFlags.push('Çok yeni cüzdan (<30 gün)')
    if (txCount > 50 && uniqueContracts < 3) sybilFlags.push('Çok az contract çeşitliliği')
    if (nftCount === 0) sybilFlags.push('NFT yok')
    if (txCount > 0 && activeDays < 3 && txCount > 20) sybilFlags.push('Txler çok kısa süreye sıkışmış')
    if (Number(txPerDay) > 20) sybilFlags.push('Günde 20+ TX (bot benzeri)')

    // ── AI Analysis ──
    let aiAnalysis = ''
    let aiScore = 0
    let aiTier = 'D'
    let aiDropTokens = 0
    let aiDropUsd = 0

    if (process.env.GROQ_API_KEY) {
      const prompt = `Sen bir blockchain analistsin. Aşağıdaki Base cüzdan verilerini analiz et ve JSON formatında yanıt ver.

CÜZDAN VERİLERİ (Base Mainnet):
- Toplam TX Sayısı: ${txCount}
- Token Transfer Sayısı: ${tokenTransfers}
- NFT Adedi: ${nftCount} (${nftCollections} farklı koleksiyon)
- ETH Bakiye: ${ethBalance} ETH
- Son 50 TX'te ETH Hacmi: ${volumeEth} ETH
- Farklı Contract Sayısı (son 50 TX): ${uniqueContracts}
- Aktif Gün Sayısı (son 50 TX): ${activeDays}
- Cüzdan Yaşı: ${ageDays} gün (ilk TX: ${firstTxDate || 'bilinmiyor'})
- Günlük Ortalama TX: ${txPerDay}
- Contract Çeşitlilik Oranı: ${contractDiversity}%
- Sybil Uyarıları: ${sybilFlags.length > 0 ? sybilFlags.join(', ') : 'Yok'}

Şu soruları yanıtla:
1. Sybil riski nedir? (DÜŞÜK / ORTA / YÜKSEK)
2. Gerçek bir kullanıcı mı yoksa farming mi?
3. Base aktivite özeti (1-2 cümle)
4. Score: 0-1000 arası puan ver
5. Tier: D/C/B/A/S
6. Olası Base token drop tahmini (Arbitrum/OP/ZkSync precedentlerine göre): token miktarı ve $0.25 fiyatla USD değeri

SADECE şu JSON formatında yanıt ver, başka hiçbir şey yazma:
{
  "sybilRisk": "DÜŞÜK|ORTA|YÜKSEK",
  "userType": "kısa açıklama",
  "summary": "aktivite özeti",
  "score": 750,
  "tier": "A",
  "dropTokens": 8000,
  "dropUsd": 2000,
  "dropRationale": "neden bu kadar aldığının kısa açıklaması"
}`

      try {
        const groqRes = await fetch(GROQ_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 300,
            temperature: 0.3,
          }),
        })
        const groqData = await groqRes.json()
        const raw = groqData.choices?.[0]?.message?.content?.trim() ?? ''
        // Extract JSON from response
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])
          aiAnalysis = parsed.summary ?? ''
          aiScore = Math.min(1000, Math.max(0, parseInt(parsed.score) || 0))
          aiTier = parsed.tier ?? 'D'
          aiDropTokens = parseInt(parsed.dropTokens) || 0
          aiDropUsd = parseInt(parsed.dropUsd) || 0
          return NextResponse.json({
            txCount, tokenTransfers, nftCount, nftCollections,
            ethBalance, volumeEth, uniqueContracts, activeDays,
            ageDays, firstTxDate, txPerDay, contractDiversity,
            sybilFlags,
            sybilRisk: parsed.sybilRisk ?? 'ORTA',
            userType: parsed.userType ?? '',
            aiSummary: aiAnalysis,
            dropRationale: parsed.dropRationale ?? '',
            score: aiScore,
            tier: aiTier,
            estimatedTokens: aiDropTokens,
            estimatedUsd: aiDropUsd,
          })
        }
      } catch { /* fall through to heuristic */ }
    }

    // Fallback heuristic scoring if AI fails
    let score = 0
    if (txCount >= 1000) score += 350; else if (txCount >= 500) score += 280; else if (txCount >= 100) score += 200; else if (txCount >= 50) score += 140; else if (txCount >= 20) score += 90; else if (txCount >= 1) score += 30
    if (nftCount >= 10) score += 150; else if (nftCount >= 1) score += 80
    if (ageDays >= 365) score += 250; else if (ageDays >= 180) score += 180; else if (ageDays >= 90) score += 110; else if (ageDays >= 30) score += 55
    if (uniqueContracts >= 20) score += 100; else if (uniqueContracts >= 10) score += 65; else if (uniqueContracts >= 3) score += 30
    if (tokenTransfers >= 100) score += 50; else if (tokenTransfers >= 10) score += 25
    score = Math.min(score, 1000)
    const tier = score >= 800 ? 'S' : score >= 600 ? 'A' : score >= 400 ? 'B' : score >= 200 ? 'C' : 'D'
    const dropMap: Record<string, number> = { S: 15000, A: 8000, B: 4000, C: 1500, D: 400 }
    const estTokens = dropMap[tier]

    return NextResponse.json({
      txCount, tokenTransfers, nftCount, nftCollections,
      ethBalance, volumeEth, uniqueContracts, activeDays,
      ageDays, firstTxDate, txPerDay, contractDiversity,
      sybilFlags,
      sybilRisk: sybilFlags.length >= 3 ? 'YÜKSEK' : sybilFlags.length >= 1 ? 'ORTA' : 'DÜŞÜK',
      userType: '', aiSummary: '', dropRationale: '',
      score, tier,
      estimatedTokens: estTokens,
      estimatedUsd: Math.round(estTokens * 0.25),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Veri çekilemedi' }, { status: 500 })
  }
}
