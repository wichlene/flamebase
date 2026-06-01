import { NextResponse } from 'next/server'

// Blockscout Etherscan-compatible API — no key needed, works server-side
const BS_COMPAT = 'https://base.blockscout.com/api'
const BS_V2 = 'https://base.blockscout.com/api/v2'
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

async function bsCompat(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString()
  try {
    const res = await fetch(`${BS_COMPAT}?${qs}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 120 },
    })
    const d = await res.json()
    if (d.status === '1' && d.result) return d.result
    // Some endpoints return status "0" with valid data (e.g. 0 txs)
    if (d.message === 'No transactions found') return []
    return null
  } catch {
    return null
  }
}

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

export async function POST(request: Request) {
  try {
    const { address } = await request.json()
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return NextResponse.json({ error: 'Geçersiz adres' }, { status: 400 })
    }

    // Fetch all in parallel
    const [txList, internalTxList, tokenTxList, nftTxList, balanceRaw, nftData] = await Promise.all([
      // Normal txs (up to 5000, sorted asc for age)
      bsCompat({ module: 'account', action: 'txlist', address, startblock: '0', endblock: '99999999', page: '1', offset: '5000', sort: 'asc' }),
      // Internal txs (contract interactions)
      bsCompat({ module: 'account', action: 'txlistinternal', address, page: '1', offset: '500', sort: 'desc' }),
      // ERC-20 token transfers
      bsCompat({ module: 'account', action: 'tokentx', address, page: '1', offset: '500', sort: 'desc' }),
      // NFT transfers (ERC-721)
      bsCompat({ module: 'account', action: 'tokennfttx', address, page: '1', offset: '200', sort: 'desc' }),
      // ETH balance
      bsCompat({ module: 'account', action: 'balance', address, tag: 'latest' }),
      // NFTs owned (Blockscout v2 — this one works)
      bsV2(`/addresses/${address}/nft/collections?type=ERC-721,ERC-1155`),
    ])

    const txs: any[] = Array.isArray(txList) ? txList : []
    const tokenTxs: any[] = Array.isArray(tokenTxList) ? tokenTxList : []
    const nftTxs: any[] = Array.isArray(nftTxList) ? nftTxList : []

    const txCount = txs.length
    const hasMore = txCount >= 5000  // might have more

    // ETH balance
    const ethBalance = balanceRaw
      ? parseFloat((Number(BigInt(String(balanceRaw))) / 1e18).toFixed(4))
      : 0

    // Volume — ETH sent FROM this address
    let volumeWei = 0n
    const contractSet = new Set<string>()
    const activeDaysSet = new Set<string>()
    let contractCallCount = 0

    for (const tx of txs) {
      if (tx.from?.toLowerCase() === address.toLowerCase()) {
        if (tx.value && tx.value !== '0') {
          try { volumeWei += BigInt(tx.value) } catch { /* */ }
        }
        if (tx.to) contractSet.add(tx.to.toLowerCase())
        if (tx.input && tx.input !== '0x') contractCallCount++
        if (tx.timeStamp) {
          const d = new Date(parseInt(tx.timeStamp) * 1000)
          activeDaysSet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`)
        }
      }
    }

    const volumeEth = parseFloat((Number(volumeWei) / 1e18).toFixed(4))
    const uniqueContracts = contractSet.size
    const activeDays = activeDaysSet.size
    const tokenTransfers = tokenTxs.length
    const nftTransfers = nftTxs.length

    // Age — first tx
    let ageDays = 0, firstTxDate = ''
    const firstTx = txs[0]
    if (firstTx?.timeStamp) {
      const ms = Date.now() - parseInt(firstTx.timeStamp) * 1000
      ageDays = Math.floor(ms / 86400000)
      firstTxDate = new Date(parseInt(firstTx.timeStamp) * 1000).toLocaleDateString('tr-TR')
    }

    const txPerDay = ageDays > 0 ? (txCount / ageDays).toFixed(1) : '0'

    // NFTs owned (from Blockscout v2)
    let nftCount = 0, nftCollections = 0
    if (Array.isArray(nftData?.items)) {
      nftCollections = nftData.items.length
      for (const col of nftData.items) {
        const n = parseInt(col.amount ?? col.value ?? '1', 10)
        nftCount += isNaN(n) ? 1 : n
      }
    }

    // Sybil signals
    const sybilFlags: string[] = []
    if (ageDays > 0 && ageDays < 30)               sybilFlags.push('Çok yeni cüzdan (<30 gün)')
    if (txCount > 50 && uniqueContracts < 3)        sybilFlags.push('Çok az contract çeşitliliği')
    if (nftCount === 0 && nftTransfers === 0 && txCount > 30) sybilFlags.push('Hiç NFT yok')
    if (txCount > 30 && activeDays <= 3)            sybilFlags.push('Txler çok kısa süreye sıkışmış')
    if (Number(txPerDay) > 30)                      sybilFlags.push(`Günde ${txPerDay} TX — bot benzeri`)

    // AI
    let aiSummary = '', aiScore = 0, aiTier = 'D'
    let aiDropTokens = 0, aiDropUsd = 0
    let sybilRisk = sybilFlags.length >= 3 ? 'YÜKSEK' : sybilFlags.length >= 1 ? 'ORTA' : 'DÜŞÜK'
    let userType = '', dropRationale = ''

    if (process.env.GROQ_API_KEY) {
      const prompt = `Base mainnet cüzdan verisini analiz et. SADECE JSON döndür, başka hiçbir şey yazma.

GERÇEK VERİ (Blockscout API):
- Normal TX: ${txCount}${hasMore ? '+' : ''}
- Contract Çağrısı: ${contractCallCount}
- ERC-20 Transfer: ${tokenTransfers}+
- NFT Transfer: ${nftTransfers}+
- NFT Bakiye: ${nftCount} (${nftCollections} koleksiyon)
- ETH Bakiye: ${ethBalance}
- Gönderilen ETH: ${volumeEth}
- Farklı Adres: ${uniqueContracts}
- Aktif Gün: ${activeDays}
- Cüzdan Yaşı: ${ageDays} gün${firstTxDate ? ` (${firstTxDate})` : ''}
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
      txCount, hasMore, contractCallCount, tokenTransfers, nftTransfers,
      nftCount, nftCollections, ethBalance, volumeEth,
      uniqueContracts, activeDays, ageDays, firstTxDate, txPerDay,
      sybilFlags, sybilRisk, userType, aiSummary, dropRationale,
      score: aiScore, tier: aiTier,
      estimatedTokens: aiDropTokens, estimatedUsd: aiDropUsd,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Hata' }, { status: 500 })
  }
}
