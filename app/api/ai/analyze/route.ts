import { NextResponse } from 'next/server'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
// Groq deprecated llama-3.3-70b-versatile (2026-06-17); openai/gpt-oss-120b is its replacement.
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

export async function POST(request: Request) {
  if (!process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 })
  }

  try {
    const { address } = await request.json()
    if (!address) return NextResponse.json({ error: 'No address provided' }, { status: 400 })

    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address.trim()}`, {
      headers: { Accept: 'application/json' },
    })
    const dexData = await dexRes.json()

    if (!dexData.pairs || dexData.pairs.length === 0) {
      return NextResponse.json({ error: 'Token not found. Make sure it has a trading pair on a DEX.' }, { status: 404 })
    }

    // Most liquid pair
    const pair = [...dexData.pairs].sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0]

    const tokenInfo = {
      name: pair.baseToken?.name || 'Unknown',
      symbol: pair.baseToken?.symbol || '?',
      price: pair.priceUsd || '0',
      priceChange1h: pair.priceChange?.h1 ?? null,
      priceChange24h: pair.priceChange?.h24 ?? null,
      volume24h: pair.volume?.h24 || 0,
      liquidity: pair.liquidity?.usd || 0,
      fdv: pair.fdv || 0,
      marketCap: pair.marketCap || 0,
      chain: pair.chainId || 'unknown',
      dex: pair.dexId || 'unknown',
      pairAddress: pair.pairAddress || '',
    }

    const mcFdvRatio = tokenInfo.fdv > 0 ? ((tokenInfo.marketCap / tokenInfo.fdv) * 100).toFixed(1) : 'N/A'
    const liqMcRatio = tokenInfo.marketCap > 0 ? ((tokenInfo.liquidity / tokenInfo.marketCap) * 100).toFixed(1) : 'N/A'

    const prompt = `You are a crypto analyst. Analyze this token and give a clear, direct verdict.

TOKEN DATA:
- Name: ${tokenInfo.name} ($${tokenInfo.symbol})
- Chain: ${tokenInfo.chain} | DEX: ${tokenInfo.dex}
- Price: $${Number(tokenInfo.price).toFixed(8)}
- 1h Change: ${tokenInfo.priceChange1h !== null ? tokenInfo.priceChange1h + '%' : 'N/A'}
- 24h Change: ${tokenInfo.priceChange24h !== null ? tokenInfo.priceChange24h + '%' : 'N/A'}
- 24h Volume: $${Number(tokenInfo.volume24h).toLocaleString()}
- Liquidity: $${Number(tokenInfo.liquidity).toLocaleString()}
- Market Cap: $${Number(tokenInfo.marketCap).toLocaleString()}
- FDV (Fully Diluted Valuation): $${Number(tokenInfo.fdv).toLocaleString()}
- MC/FDV Ratio: ${mcFdvRatio}% (how much of total supply is circulating)
- Liquidity/MC Ratio: ${liqMcRatio}%

ANALYZE these 4 areas:
1. 💰 Supply Risk: MC/FDV ratio — low % means lots of locked tokens that could dump later
2. 💧 Liquidity Safety: is there enough liquidity to trade safely without huge slippage?
3. 📊 Trading Activity: volume vs liquidity ratio — real organic activity or wash trading?
4. 📈 Price Action: momentum based on 1h/24h changes

END with a clear verdict: 🟢 BULLISH / 🟡 NEUTRAL / 🔴 BEARISH / ⚠️ HIGH RISK

Be concise, use emojis, max 180 words. No disclaimers.`

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(20000),
    })

    const data = await response.json()
    if (!response.ok) {
      return NextResponse.json({ error: data?.error?.message || 'AI error' }, { status: 500 })
    }

    return NextResponse.json({
      analysis: data.choices?.[0]?.message?.content || '',
      tokenInfo,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Request failed' }, { status: 500 })
  }
}
