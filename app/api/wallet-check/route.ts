import { NextResponse } from 'next/server'

const BASESCAN = 'https://api.basescan.org/api'
const BLOCKSCOUT = 'https://base.blockscout.com/api/v2'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'
const BSKEY = process.env.BASESCAN_API_KEY ?? ''

async function bscan(params: Record<string, string>) {
  const qs = new URLSearchParams({ ...params, apikey: BSKEY }).toString()
  const res = await fetch(`${BASESCAN}?${qs}`, { next: { revalidate: 120 } })
  if (!res.ok) return null
  const d = await res.json()
  return d.status === '1' ? d.result : null
}

async function blockscout(path: string) {
  const res = await fetch(`${BLOCKSCOUT}${path}`, {
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

    // Parallel: Basescan txlist + balance + Blockscout NFTs
    const [txList, balanceRaw, nftData] = await Promise.all([
      bscan({ module: 'account', action: 'txlist', address, startblock: '0', endblock: '99999999', sort: 'asc', offset: '10000' }),
      bscan({ module: 'account', action: 'balance', address, tag: 'latest' }),
      blockscout(`/addresses/${address}/nft/collections?type=ERC-721,ERC-1155`),
    ])

    const txs: any[] = Array.isArray(txList) ? txList : []

    // ── TX stats from Basescan ──
    const txCount = txs.length  // up to 10 000; if exactly 10000, wallet may have more
    const hasMore = txCount === 10000

    // Volume — sum ETH value sent FROM this address
    let volumeWei = 0n
    const contractSet = new Set<string>()
    const activeDaysSet = new Set<string>()
    let contractTxCount = 0

    for (const tx of txs) {
      if (tx.from?.toLowerCase() === address.toLowerCase()) {
        if (tx.value && tx.value !== '0') {
          try { volumeWei += BigInt(tx.value) } catch { /* */ }
        }
        if (tx.to) {
          contractSet.add(tx.to.toLowerCase())
          if (tx.input && tx.input !== '0x') contractTxCount++
        }
        if (tx.timeStamp) {
          const d = new Date(parseInt(tx.timeStamp) * 1000)
          activeDaysSet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
        }
      }
    }

    const volumeEth = parseFloat((Number(volumeWei) / 1e18).toFixed(4))
    const uniqueContracts = contractSet.size
    const activeDays = activeDaysSet.size

    // Age — first tx timestamp
    let ageDays = 0, firstTxDate = ''
    const firstTx = txs[0]
    if (firstTx?.timeStamp) {
      const ms = Date.now() - parseInt(firstTx.timeStamp) * 1000
      ageDays = Math.floor(ms / 86400000)
      firstTxDate = new Date(parseInt(firstTx.timeStamp) * 1000).toLocaleDateString('tr-TR')
    }

    // ETH balance
    const ethBalance = balanceRaw
      ? parseFloat((Number(BigInt(balanceRaw)) / 1e18).toFixed(4))
      : 0

    // Token transfers (separate Basescan call — lightweight)
    const tokenTransferData = await bscan({
      module: 'account', action: 'tokentx', address,
      startblock: '0', endblock: '99999999', sort: 'desc', offset: '100',
    })
    const tokenTransfers = Array.isArray(tokenTransferData) ? tokenTransferData.length : 0

    // NFTs from Blockscout
    let nftCount = 0, nftCollections = 0
    if (Array.isArray(nftData?.items)) {
      nftCollections = nftData.items.length
      for (const col of nftData.items) {
        const n = parseInt(col.amount ?? col.value ?? '1', 10)
        nftCount += isNaN(n) ? 1 : n
      }
    }

    const txPerDay = ageDays > 0 ? (txCount / ageDays).toFixed(1) : '0'

    // Sybil signals
    const sybilFlags: string[] = []
    if (ageDays < 30)                              sybilFlags.push('Çok yeni cüzdan (<30 gün)')
    if (txCount > 50 && uniqueContracts < 3)       sybilFlags.push('TX var ama contract çeşitliliği çok düşük')
    if (nftCount === 0 && txCount > 30)            sybilFlags.push('Hiç NFT yok')
    if (txCount > 30 && activeDays <= 3)           sybilFlags.push('Txler 1-3 güne sıkışmış')
    if (Number(txPerDay) > 30)                     sybilFlags.push(`Günde ${txPerDay} TX — bot benzeri`)

    // ── AI Analysis ──
    let aiSummary = '', aiScore = 0, aiTier = 'D'
    let aiDropTokens = 0, aiDropUsd = 0
    let sybilRisk = sybilFlags.length >= 3 ? 'YÜKSEK' : sybilFlags.length >= 1 ? 'ORTA' : 'DÜŞÜK'
    let userType = '', dropRationale = ''

    if (process.env.GROQ_API_KEY) {
      const prompt = `Base mainnet cüzdan analizini JSON olarak yap. Sadece JSON döndür.

VERİ (Basescan kaynaklı, gerçek):
- Toplam TX: ${txCount}${hasMore ? '+ (10000 limit aşıldı, çok aktif)' : ''}
- Contract TX: ${contractTxCount}
- Token Transfer: ${tokenTransfers}+
- NFT: ${nftCount} (${nftCollections} koleksiyon)
- ETH Bakiye: ${ethBalance}
- Gönderilen ETH (toplam): ${volumeEth}
- Farklı Adres: ${uniqueContracts}
- Aktif Gün: ${activeDays}
- Cüzdan Yaşı: ${ageDays} gün (${firstTxDate || '?'})
- Günlük Ort. TX: ${txPerDay}
- Sybil Uyarıları: ${sybilFlags.length > 0 ? sybilFlags.join(' | ') : 'YOK'}

FORMAT (sadece JSON):
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
          aiSummary    = p.summary     ?? ''
          aiScore      = Math.min(1000, Math.max(0, parseInt(p.score) || 0))
          aiTier       = ['S','A','B','C','D'].includes(p.tier) ? p.tier : 'D'
          aiDropTokens = parseInt(p.dropTokens) || 0
          aiDropUsd    = parseInt(p.dropUsd) || 0
          sybilRisk    = ['DÜŞÜK','ORTA','YÜKSEK'].includes(p.sybilRisk) ? p.sybilRisk : sybilRisk
          userType     = p.userType      ?? ''
          dropRationale= p.dropRationale ?? ''
        }
      } catch { /* fallback */ }
    }

    // Fallback scoring
    if (!aiScore) {
      let s = 0
      if (txCount >= 1000) s += 350; else if (txCount >= 500) s += 280; else if (txCount >= 100) s += 200; else if (txCount >= 50) s += 140; else if (txCount >= 20) s += 90; else if (txCount >= 1) s += 30
      if (nftCount >= 10) s += 150; else if (nftCount >= 1) s += 80
      if (ageDays >= 365) s += 250; else if (ageDays >= 180) s += 180; else if (ageDays >= 90) s += 110; else if (ageDays >= 30) s += 55
      if (uniqueContracts >= 20) s += 100; else if (uniqueContracts >= 10) s += 65; else if (uniqueContracts >= 3) s += 30
      if (tokenTransfers >= 100) s += 50; else if (tokenTransfers >= 10) s += 25
      aiScore = Math.min(s, 1000)
      aiTier = aiScore >= 800 ? 'S' : aiScore >= 600 ? 'A' : aiScore >= 400 ? 'B' : aiScore >= 200 ? 'C' : 'D'
      const tm: Record<string, number> = { S: 15000, A: 8000, B: 4000, C: 1500, D: 400 }
      aiDropTokens = tm[aiTier]; aiDropUsd = Math.round(aiDropTokens * 0.25)
    }

    return NextResponse.json({
      txCount, hasMore, tokenTransfers, nftCount, nftCollections,
      ethBalance, volumeEth, uniqueContracts, activeDays,
      ageDays, firstTxDate, txPerDay,
      sybilFlags, sybilRisk, userType,
      aiSummary, dropRationale,
      score: aiScore, tier: aiTier,
      estimatedTokens: aiDropTokens,
      estimatedUsd: aiDropUsd,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Veri çekilemedi' }, { status: 500 })
  }
}
