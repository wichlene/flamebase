'use client'
import { useState } from 'react'

interface WalletStats {
  txCount: number
  tokenTransfers: number
  nftCount: number
  nftCollections: number
  ethBalance: number
  volumeEth: number
  uniqueContracts: number
  activeDays: number
  ageDays: number
  firstTxDate: string
  txPerDay: string
  contractDiversity: string
  sybilFlags: string[]
  sybilRisk: 'DÜŞÜK' | 'ORTA' | 'YÜKSEK'
  userType: string
  aiSummary: string
  dropRationale: string
  score: number
  tier: string
  estimatedTokens: number
  estimatedUsd: number
}

const TIER_STYLE: Record<string, { bar: string; badge: string; label: string }> = {
  S: { bar: '#9333ea', badge: 'bg-purple-50 border-purple-300 text-purple-700', label: 'Whale 🐋' },
  A: { bar: '#22c55e', badge: 'bg-green-50 border-green-300 text-green-700', label: 'Power User ⚡' },
  B: { bar: '#3b82f6', badge: 'bg-blue-50 border-blue-300 text-blue-700', label: 'Active User 🔥' },
  C: { bar: '#eab308', badge: 'bg-yellow-50 border-yellow-300 text-yellow-700', label: 'Casual User 👤' },
  D: { bar: '#ef4444', badge: 'bg-red-50 border-red-200 text-red-600', label: 'Yeni / İnaktif' },
}

const SYBIL_STYLE: Record<string, string> = {
  'DÜŞÜK': 'bg-green-50 border-green-200 text-green-700',
  'ORTA':  'bg-yellow-50 border-yellow-200 text-yellow-700',
  'YÜKSEK':'bg-red-50 border-red-200 text-red-600',
}

interface Props { connectedAddress?: string; compact?: boolean; onPay?: () => Promise<void>; feeLabel?: string }

export default function WalletChecker({ connectedAddress, compact = false, onPay, feeLabel = '$0.04' }: Props) {
  const [customAddr, setCustomAddr] = useState('')
  const [loading, setLoading] = useState(false)
  const [paying, setPaying] = useState(false)
  const [result, setResult] = useState<WalletStats | null>(null)
  const [error, setError] = useState('')
  const [checkedAddr, setCheckedAddr] = useState('')

  const fetchStats = async (addr: string) => {
    setLoading(true); setError(''); setResult(null); setCheckedAddr(addr)
    try {
      const res = await fetch('/api/wallet-check', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setError(data.error || 'Hata')
      else setResult(data)
    } catch { setError('Bağlantı hatası') }
    setLoading(false)
  }

  const handleAnalyze = async (addr: string) => {
    if (onPay) {
      setPaying(true)
      try { await onPay() } catch { setPaying(false); setError('İşlem reddedildi'); return }
      setPaying(false)
    }
    await fetchStats(addr)
  }

  const busy = paying || loading
  const tier = result ? (TIER_STYLE[result.tier] ?? TIER_STYLE.D) : null
  const displayAddr = checkedAddr || connectedAddress || ''

  return (
    <div className={compact ? 'space-y-3' : 'p-5 space-y-4'}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-[#0A0B0D] text-base">🏦 Base Wallet Analysis</h2>
          {displayAddr && <p className="text-[11px] text-[#8A919E] font-mono mt-0.5">{displayAddr.slice(0,10)}…{displayAddr.slice(-6)}</p>}
        </div>
        {result && (
          <button onClick={() => handleAnalyze(displayAddr)} disabled={busy}
            className="text-xs text-[#0052FF] hover:underline disabled:opacity-40 font-semibold">Yenile</button>
        )}
      </div>

      {/* CTA — no result yet */}
      {!result && !busy && connectedAddress && (
        <div className="bg-gradient-to-br from-[#F0F4FF] to-[#EEF2FF] border border-[#D6E2FF] rounded-2xl p-5 text-center space-y-3">
          <p className="text-3xl">🔍</p>
          <div>
            <p className="font-bold text-[#0A0B0D]">Cüzdanını AI ile analiz et</p>
            <p className="text-xs text-[#5B6271] mt-1">TX, NFT, volume, yaş, sybil skoru ve olası Base drop tahmini</p>
            {onPay && <p className="text-xs font-bold text-[#0052FF] mt-1">Ücret: {feeLabel} (on-chain TX)</p>}
          </div>
          <button onClick={() => handleAnalyze(connectedAddress)} disabled={busy}
            className="w-full bg-[#0052FF] hover:bg-[#1652F0] text-white font-black py-3 rounded-xl text-sm transition-colors shadow-sm">
            {paying ? '⏳ Onay bekleniyor…' : `🤖 AI ile Analiz Et${onPay ? ` — ${feeLabel}` : ''}`}
          </button>
        </div>
      )}

      {/* Custom address input */}
      {!compact && (
        <div className="flex gap-2">
          <input value={customAddr} onChange={e => setCustomAddr(e.target.value)}
            placeholder="Başka cüzdan: 0x..."
            className="flex-1 border border-[#E4E7EB] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#0052FF] bg-white"
            onKeyDown={e => e.key === 'Enter' && customAddr.trim() && handleAnalyze(customAddr)} />
          <button onClick={() => customAddr.trim() && handleAnalyze(customAddr)}
            disabled={busy || !customAddr.trim()}
            className="bg-[#F0F4FF] hover:bg-[#E6EEFF] disabled:opacity-40 text-[#0052FF] font-bold px-3 py-2 rounded-xl text-xs border border-[#D6E2FF]">
            Check
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">❌ {error}</p>}

      {/* Loading skeleton */}
      {busy && (
        <div className="space-y-3 animate-pulse">
          <div className="h-24 bg-[#F0F2F5] rounded-2xl" />
          <div className="grid grid-cols-2 gap-2">{[...Array(6)].map((_,i) => <div key={i} className="h-14 bg-[#F0F2F5] rounded-xl" />)}</div>
          <div className="h-28 bg-[#F0F2F5] rounded-2xl" />
          <div className="h-20 bg-[#F0F2F5] rounded-2xl" />
        </div>
      )}

      {/* Results */}
      {result && tier && (
        <div className="space-y-3">

          {/* Tier + Score */}
          <div className={`flex items-center justify-between px-4 py-3 rounded-2xl border-2 ${tier.badge}`}>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">Base Tier</p>
              <p className="font-black text-3xl leading-none">Tier {result.tier}</p>
              <p className="font-semibold text-sm">{tier.label}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] opacity-60 uppercase tracking-wider">AI Score</p>
              <p className="font-black text-4xl leading-none">{result.score}</p>
              <p className="text-[10px] opacity-60">/ 1000</p>
            </div>
          </div>

          {/* Score bar */}
          <div>
            <div className="h-3 bg-[#E4E7EB] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000"
                style={{ width: `${result.score / 10}%`, background: tier.bar }} />
            </div>
            <div className="flex justify-between text-[9px] text-[#8A919E] mt-1">
              <span>D</span><span>C (200)</span><span>B (400)</span><span>A (600)</span><span>S (800)</span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: '⚡', label: 'Total TX', val: result.txCount.toLocaleString() },
              { icon: '🔄', label: 'Token Transfer', val: result.tokenTransfers.toLocaleString() },
              { icon: '🖼️', label: 'NFT', val: `${result.nftCount} (${result.nftCollections} koleksiyon)` },
              { icon: '💰', label: 'ETH Bakiye', val: `${result.ethBalance} ETH` },
              { icon: '💸', label: 'ETH Volume', val: `${result.volumeEth} ETH` },
              { icon: '🏗️', label: 'Farklı CA', val: `${result.uniqueContracts} contract` },
              { icon: '📅', label: 'Cüzdan Yaşı', val: result.ageDays > 0 ? `${result.ageDays} gün` : 'Yeni', sub: result.firstTxDate },
              { icon: '📊', label: 'Aktif Gün', val: `${result.activeDays} gün / 50tx` },
            ].map(s => (
              <div key={s.label} className="bg-white border border-[#E4E7EB] rounded-xl p-3">
                <p className="text-[10px] text-[#8A919E]">{s.icon} {s.label}</p>
                <p className="font-black text-[#0A0B0D] text-sm leading-tight">{s.val}</p>
                {s.sub && <p className="text-[9px] text-[#B0B7C3]">{s.sub}</p>}
              </div>
            ))}
          </div>

          {/* Sybil risk */}
          <div className={`border rounded-xl p-3 ${SYBIL_STYLE[result.sybilRisk]}`}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-black uppercase tracking-wider">🕵️ Sybil Riski</p>
              <span className="text-xs font-black">{result.sybilRisk}</span>
            </div>
            {result.sybilFlags.length > 0
              ? <ul className="space-y-0.5">{result.sybilFlags.map((f, i) => <li key={i} className="text-xs">⚠️ {f}</li>)}</ul>
              : <p className="text-xs">✅ Belirgin sybil sinyali yok</p>
            }
            {result.userType && <p className="text-xs mt-1 font-semibold">👤 {result.userType}</p>}
          </div>

          {/* AI Summary */}
          {result.aiSummary && (
            <div className="bg-[#F0F4FF] border border-[#D6E2FF] rounded-xl p-3">
              <p className="text-[10px] font-bold text-[#0052FF] mb-1">🤖 AI Değerlendirmesi</p>
              <p className="text-xs text-[#0A0B0D] leading-relaxed">{result.aiSummary}</p>
            </div>
          )}

          {/* Drop estimate */}
          <div className="bg-gradient-to-br from-[#0052FF]/8 to-[#7B61FF]/10 border border-[#0052FF]/25 rounded-2xl p-4">
            <p className="text-xs font-black text-[#0052FF] uppercase tracking-wider mb-2">🎯 Olası Base Drop Tahmini</p>
            {result.estimatedTokens > 0 ? (
              <>
                <p className="font-black text-2xl text-[#0A0B0D]">
                  ~{result.estimatedTokens.toLocaleString()}
                  <span className="text-sm font-semibold text-[#5B6271] ml-1">token</span>
                </p>
                <p className="text-sm text-[#5B6271] mt-0.5">
                  ≈ <span className="font-black text-[#0A0B0D] text-lg">${result.estimatedUsd.toLocaleString()}</span>
                  <span className="text-xs ml-1">@ $0.25/token (spec.)</span>
                </p>
                {result.dropRationale && <p className="text-xs text-[#5B6271] mt-2 italic">{result.dropRationale}</p>}
                <div className="flex gap-1 flex-wrap mt-2">
                  {result.txCount >= 100   && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">✅ {result.txCount}+ TX</span>}
                  {result.nftCount >= 1    && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">✅ NFT Holder</span>}
                  {result.ageDays >= 180   && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">✅ OG ({result.ageDays}g)</span>}
                  {result.uniqueContracts >= 10 && <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">✅ {result.uniqueContracts} CA</span>}
                  {result.sybilRisk === 'DÜŞÜK' && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">✅ Gerçek Kullanıcı</span>}
                </div>
              </>
            ) : (
              <p className="text-sm text-[#8A919E]">Aktivite çok düşük. Base'de daha fazla işlem yap.</p>
            )}
            <p className="text-[9px] text-[#B0B7C3] mt-3">⚠️ Spekülatif — resmi duyuru yok. Arbitrum/OP/zkSync precedentlerine göre AI tahmini.</p>
          </div>

        </div>
      )}
    </div>
  )
}
