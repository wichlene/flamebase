'use client'
import { useState } from 'react'

interface TokenInfo {
  name: string
  symbol: string
  price: string
  priceChange1h: number | null
  priceChange24h: number | null
  volume24h: number
  liquidity: number
  fdv: number
  marketCap: number
  chain: string
  dex: string
}

function fmt(n: number) {
  if (!n) return '$0'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

function PctBadge({ val }: { val: number | null }) {
  if (val === null) return <span className="text-[#8A919E] text-xs">N/A</span>
  const up = val >= 0
  return (
    <span className={`text-xs font-semibold ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? '▲' : '▼'} {Math.abs(val).toFixed(2)}%
    </span>
  )
}

const QUICK = [
  { label: '$FLM', address: '0xadead5e8ca2893be6e8239cbbae83049a701cb07' },
  { label: 'ETH', address: '0x4200000000000000000000000000000000000006' },
]

export default function TokenAnalyzer() {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ analysis: string; tokenInfo: TokenInfo } | null>(null)
  const [error, setError] = useState('')

  const analyze = async (addr?: string) => {
    const target = (addr ?? address).trim()
    if (!target) return
    setLoading(true)
    setError('')
    setResult(null)
    if (addr) setAddress(addr)
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: target }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setError(data.error || 'Analysis failed')
      else setResult(data)
    } catch {
      setError('Connection error. Try again.')
    }
    setLoading(false)
  }

  const t = result?.tokenInfo
  const supplyRatio = t && t.fdv > 0 ? (t.marketCap / t.fdv) * 100 : 0
  const liqRatio = t && t.marketCap > 0 ? (t.liquidity / t.marketCap) * 100 : 0

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="font-black text-[#0A0B0D] text-base">🔍 AI Token Analyzer</h2>
        <p className="text-xs text-[#5B6271] mt-0.5">Token CA yapıştır — AI FDV, MCAP, supply ve likiditeyi analiz etsin.</p>
      </div>

      <div className="flex gap-2">
        <input
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="0x... contract address"
          className="flex-1 border border-[#E4E7EB] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] bg-white"
          onKeyDown={e => e.key === 'Enter' && analyze()}
        />
        <button
          onClick={() => analyze()}
          disabled={loading || !address.trim()}
          className="bg-[#0052FF] hover:bg-[#1652F0] disabled:opacity-40 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors whitespace-nowrap"
        >
          {loading ? <span className="animate-pulse">Analyzing…</span> : 'Analyze'}
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {QUICK.map(q => (
          <button key={q.label} onClick={() => analyze(q.address)}
            className="text-xs bg-[#F0F4FF] hover:bg-[#E6EEFF] text-[#0052FF] px-3 py-1.5 rounded-lg font-semibold transition-colors border border-[#D6E2FF]">
            Try {q.label} →
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">❌ {error}</div>
      )}

      {loading && (
        <div className="space-y-3">
          <div className="bg-[#F8FAFF] border border-[#E4E7EB] rounded-2xl p-4 space-y-2 animate-pulse">
            {[...Array(6)].map((_, i) => <div key={i} className="h-8 bg-[#E4E7EB] rounded-xl" />)}
          </div>
          <div className="bg-[#F0F4FF] border border-[#D6E2FF] rounded-2xl p-4 h-32 animate-pulse" />
        </div>
      )}

      {result && t && (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0052FF] to-[#7B61FF] flex items-center justify-center text-white font-black text-xs flex-shrink-0">
              {t.symbol.slice(0, 3)}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[#0A0B0D] text-sm">{t.name}</span>
                <span className="text-[10px] bg-[#E6EEFF] text-[#0052FF] px-1.5 py-0.5 rounded-full font-semibold uppercase">{t.chain}</span>
                <span className="text-[10px] bg-[#F0F2F5] text-[#5B6271] px-1.5 py-0.5 rounded-full">{t.dex}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-bold">${Number(t.price).toFixed(8)}</span>
                <PctBadge val={t.priceChange1h} /> <span className="text-[#8A919E] text-xs">1h</span>
                <PctBadge val={t.priceChange24h} /> <span className="text-[#8A919E] text-xs">24h</span>
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Market Cap', value: fmt(t.marketCap) },
              { label: 'FDV', value: fmt(t.fdv) },
              { label: 'Liquidity', value: fmt(t.liquidity) },
              { label: '24h Volume', value: fmt(t.volume24h) },
            ].map(s => (
              <div key={s.label} className="bg-white border border-[#E4E7EB] rounded-xl p-3">
                <p className="text-[#8A919E] text-[11px]">{s.label}</p>
                <p className="font-bold text-[#0A0B0D] text-sm">{s.value}</p>
              </div>
            ))}

            {/* MC/FDV */}
            <div className="bg-white border border-[#E4E7EB] rounded-xl p-3">
              <p className="text-[#8A919E] text-[11px]">MC / FDV</p>
              <p className={`font-bold text-sm ${supplyRatio >= 80 ? 'text-green-600' : supplyRatio >= 40 ? 'text-yellow-600' : 'text-red-500'}`}>
                {supplyRatio.toFixed(1)}%
              </p>
              <p className="text-[10px] text-[#8A919E]">
                {supplyRatio >= 80 ? 'Low dilution risk' : supplyRatio >= 40 ? 'Medium risk' : 'High dilution risk ⚠️'}
              </p>
            </div>

            {/* Liq/MC */}
            <div className="bg-white border border-[#E4E7EB] rounded-xl p-3">
              <p className="text-[#8A919E] text-[11px]">Liq / MC</p>
              <p className={`font-bold text-sm ${liqRatio >= 20 ? 'text-green-600' : liqRatio >= 5 ? 'text-yellow-600' : 'text-red-500'}`}>
                {liqRatio.toFixed(1)}%
              </p>
              <p className="text-[10px] text-[#8A919E]">
                {liqRatio >= 20 ? 'Solid liquidity' : liqRatio >= 5 ? 'Thin liquidity' : 'Very risky 🚨'}
              </p>
            </div>
          </div>

          {/* AI Analysis */}
          <div className="bg-gradient-to-br from-[#F0F4FF] to-[#EEF2FF] border border-[#D6E2FF] rounded-2xl p-4">
            <p className="text-xs font-bold text-[#0052FF] mb-2 flex items-center gap-1.5">
              🤖 AI Analysis <span className="text-[#8A919E] font-normal">powered by Llama 3</span>
            </p>
            <p className="text-sm text-[#0A0B0D] whitespace-pre-wrap leading-relaxed">{result.analysis}</p>
          </div>
        </div>
      )}
    </div>
  )
}
