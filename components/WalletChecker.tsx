'use client'
import { useState } from 'react'
import { useWalletClient } from 'wagmi'

interface DayActivity { date: string; count: number }
interface NftItem { name: string; symbol: string; count: number }

interface WalletResult {
  txCount: number; hasMore: boolean; contractCallCount: number; tokenTransfers: number
  nftCount: number; nftCollections: number; nftList: NftItem[]
  ethBalance: number; volumeEth: number
  uniqueContracts: number; activeDays: number; activeWeeks: number; activeMonths: number
  ageDays: number; firstTxDate: string; txPerDay: string
  currentStreak: number; longestStreak: number
  dailyActivity: DayActivity[]
  sybilFlags: string[]; sybilRisk: 'DÜŞÜK' | 'ORTA' | 'YÜKSEK'
  userType: string; aiSummary: string; dropRationale: string
  badges: string[]
  score: number; tier: string
  estimatedTokens: number; estimatedUsd: number
}

const TIER_COLOR: Record<string, string> = {
  S: '#FFD700', A: '#0052FF', B: '#7B61FF', C: '#F59E0B', D: '#9CA3AF',
}
const TIER_LABEL: Record<string, string> = {
  S: 'Elite', A: 'Advanced', B: 'Intermediate', C: 'Casual User', D: 'Beginner',
}

function heatColor(count: number) {
  if (count === 0) return '#EEF0F3'
  if (count <= 2) return '#BCD4FF'
  if (count <= 5) return '#7AAAFF'
  if (count <= 10) return '#3B82F6'
  return '#0052FF'
}

function ActivityHeatmap({ data }: { data: DayActivity[] }) {
  if (!data || data.length === 0) return null
  const firstDate = new Date(data[0].date + 'T00:00:00Z')
  const startPad = firstDate.getUTCDay()
  const cells: (DayActivity | null)[] = [...Array(startPad).fill(null), ...data]
  const weeks: (DayActivity | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    const w = cells.slice(i, i + 7)
    while (w.length < 7) w.push(null)
    weeks.push(w)
  }
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-[2px]" style={{ minWidth: weeks.length * 11 }}>
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col gap-[2px]">
            {w.map((d, di) => (
              <div key={di} title={d ? `${d.date}: ${d.count} tx` : ''}
                className="w-[9px] h-[9px] rounded-[2px]"
                style={{ background: d ? heatColor(d.count) : 'transparent' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function WalletChecker({ onPay, compact }: { onPay?: () => Promise<void>; compact?: boolean }) {
  const { data: walletClient } = useWalletClient()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<WalletResult | null>(null)
  const [error, setError] = useState('')

  const address = walletClient?.account?.address

  const run = async () => {
    if (!address) return
    setLoading(true); setError('')
    try {
      if (onPay) await onPay()
      const res = await fetch('/api/wallet-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setError(data.error || 'Hata oluştu')
      else setResult(data)
    } catch (e: any) {
      setError(e?.message || 'Bağlantı hatası')
    }
    setLoading(false)
  }

  if (!address) {
    return <div className="p-4 text-center text-sm text-[#8A919E]">Analiz için cüzdanını bağla</div>
  }

  if (!result && !loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="text-center space-y-1">
          <div className="text-3xl">🔍</div>
          <p className="font-bold text-[#0A0B0D] text-sm">Cüzdanını AI ile analiz et</p>
          <p className="text-xs text-[#5B6271]">TX, NFT, streak, rozetler ve olası Base drop tahmini</p>
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-xs text-red-600">❌ {error}</div>}
        <button onClick={run} className="w-full bg-[#0052FF] hover:bg-[#1652F0] text-white font-bold py-3 rounded-xl text-sm transition-colors">
          🤖 AI ile Analiz Et {onPay ? '— $0.04' : ''}
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-3 space-y-3 animate-pulse">
        <div className="h-24 bg-[#E4E7EB] rounded-2xl" />
        <div className="grid grid-cols-4 gap-1.5">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-[#E4E7EB] rounded-xl" />)}</div>
        <div className="h-20 bg-[#E4E7EB] rounded-xl" />
        <div className="h-12 bg-[#E4E7EB] rounded-xl" />
        <div className="grid grid-cols-2 gap-1.5">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-[#E4E7EB] rounded-xl" />)}</div>
      </div>
    )
  }

  if (!result) return null

  const tc = TIER_COLOR[result.tier] ?? '#9CA3AF'

  return (
    <div className="space-y-3 p-3">
      {/* Score Card */}
      <div className="rounded-2xl p-4" style={{ background: `linear-gradient(135deg, ${tc}18, ${tc}08)`, border: `1.5px solid ${tc}33` }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-[#8A919E] uppercase tracking-wider">BASE TIER</p>
            <p className="font-black text-2xl leading-tight" style={{ color: tc }}>Tier {result.tier}</p>
            <p className="text-xs text-[#5B6271]">{TIER_LABEL[result.tier] ?? ''}</p>
            {result.userType && <p className="text-xs text-[#5B6271] mt-0.5">👤 {result.userType}</p>}
          </div>
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="#E4E7EB" strokeWidth="5" />
              <circle cx="32" cy="32" r="28" fill="none" stroke={tc} strokeWidth="5"
                strokeDasharray={`${(result.score / 100) * 175.9} 175.9`}
                strokeLinecap="round" transform="rotate(-90 32 32)" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-black text-lg leading-none" style={{ color: tc }}>{result.score}</span>
              <span className="text-[9px] text-[#8A919E]">/100</span>
            </div>
          </div>
        </div>
      </div>

      {/* Key Stats Row */}
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { icon: '⚡', label: 'TX', val: result.txCount >= 1000 ? `${(result.txCount / 1000).toFixed(1)}k` : String(result.txCount) },
          { icon: '📅', label: 'Aktif Gün', val: String(result.activeDays) },
          { icon: '🔥', label: 'Streak', val: `${result.currentStreak}g` },
          { icon: '📆', label: 'Ay', val: String(result.activeMonths) },
        ].map(s => (
          <div key={s.label} className="bg-[#F8FAFF] border border-[#E4E7EB] rounded-xl p-2 text-center">
            <div className="text-sm">{s.icon}</div>
            <div className="font-bold text-[#0A0B0D] text-sm leading-tight">{s.val}</div>
            <div className="text-[9px] text-[#8A919E]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Activity Heatmap */}
      {result.dailyActivity?.length > 0 && (
        <div className="bg-white border border-[#E4E7EB] rounded-xl p-3">
          <p className="text-[11px] font-semibold text-[#5B6271] mb-2">📊 Activity (son 52 hafta)</p>
          <ActivityHeatmap data={result.dailyActivity} />
          <div className="flex items-center gap-1 mt-2 justify-end">
            <span className="text-[9px] text-[#8A919E]">Az</span>
            {[0, 2, 5, 10, 15].map(n => (
              <div key={n} className="w-[9px] h-[9px] rounded-[2px]" style={{ background: heatColor(n) }} />
            ))}
            <span className="text-[9px] text-[#8A919E]">Çok</span>
          </div>
        </div>
      )}

      {/* Badges */}
      {result.badges?.length > 0 && (
        <div className="bg-white border border-[#E4E7EB] rounded-xl p-3">
          <p className="text-[11px] font-semibold text-[#5B6271] mb-2">🏅 Rozetler</p>
          <div className="flex flex-wrap gap-1.5">
            {result.badges.map((b, i) => (
              <span key={i} className="text-[11px] bg-[#F0F4FF] text-[#0052FF] px-2 py-1 rounded-full font-semibold border border-[#D6E2FF]">{b}</span>
            ))}
          </div>
        </div>
      )}

      {/* Stats Detail */}
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { icon: '🔄', label: 'Token Transfer', val: result.tokenTransfers.toLocaleString() },
          { icon: '💰', label: 'ETH Bakiye', val: `${result.ethBalance} ETH` },
          { icon: '💸', label: 'ETH Volume', val: `${result.volumeEth} ETH` },
          { icon: '🏗️', label: 'Farklı CA', val: String(result.uniqueContracts) },
          { icon: '📅', label: 'Yaş', val: result.ageDays > 0 ? `${result.ageDays} gün` : 'Yeni', sub: result.firstTxDate },
          { icon: '⚡', label: 'Max Streak', val: `${result.longestStreak} gün` },
        ].map(s => (
          <div key={s.label} className="bg-white border border-[#E4E7EB] rounded-xl p-2.5">
            <p className="text-[#8A919E] text-[10px]">{s.icon} {s.label}</p>
            <p className="font-bold text-[#0A0B0D] text-sm">{s.val}</p>
            {'sub' in s && s.sub && <p className="text-[9px] text-[#8A919E]">{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* NFT Collections */}
      {result.nftList?.length > 0 && (
        <div className="bg-white border border-[#E4E7EB] rounded-xl p-3">
          <p className="text-[11px] font-semibold text-[#5B6271] mb-2">🖼️ NFT ({result.nftCount} adet, {result.nftCollections} koleksiyon)</p>
          <div className="space-y-1.5">
            {result.nftList.slice(0, 5).map((nft, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0052FF] to-[#7B61FF] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {(nft.symbol || nft.name).slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-[#0A0B0D] truncate max-w-[120px]">{nft.name}</span>
                </div>
                <span className="text-xs font-bold text-[#5B6271] flex-shrink-0">×{nft.count}</span>
              </div>
            ))}
            {result.nftCollections > 5 && (
              <p className="text-[10px] text-[#8A919E]">+{result.nftCollections - 5} koleksiyon daha</p>
            )}
          </div>
        </div>
      )}

      {/* Sybil Risk */}
      <div className={`border rounded-xl p-3 ${result.sybilRisk === 'DÜŞÜK' ? 'bg-green-50 border-green-200' : result.sybilRisk === 'ORTA' ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-[#0A0B0D]">🛡️ Sybil Risk</span>
          <span className={`text-xs font-black ${result.sybilRisk === 'DÜŞÜK' ? 'text-green-600' : result.sybilRisk === 'ORTA' ? 'text-yellow-600' : 'text-red-600'}`}>{result.sybilRisk}</span>
        </div>
        {result.sybilFlags.length > 0
          ? <ul className="space-y-0.5">{result.sybilFlags.map((f, i) => <li key={i} className="text-xs text-[#5B6271]">⚠️ {f}</li>)}</ul>
          : <p className="text-xs text-green-600">✅ Belirgin sybil sinyali yok</p>
        }
        {result.userType && <p className="text-xs mt-1 font-semibold text-[#5B6271]">👤 {result.userType}</p>}
      </div>

      {/* AI Summary */}
      {result.aiSummary && (
        <div className="bg-gradient-to-br from-[#F0F4FF] to-[#EEF2FF] border border-[#D6E2FF] rounded-xl p-3">
          <p className="text-[10px] font-bold text-[#0052FF] mb-1">🤖 AI Değerlendirmesi</p>
          <p className="text-xs text-[#0A0B0D] leading-relaxed">{result.aiSummary}</p>
        </div>
      )}

      {/* Drop Estimate */}
      <div className="bg-gradient-to-br from-[#FFF7ED] to-[#FFFBF5] border border-[#FED7AA] rounded-xl p-3">
        <p className="text-[10px] font-bold text-orange-600 mb-2">🪂 Olası Base Drop Tahmini</p>
        {result.estimatedTokens > 0 ? (
          <>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-xl font-black text-orange-500">~{result.estimatedTokens.toLocaleString()}</span>
              <span className="text-xs text-[#5B6271]">$BASE token</span>
              <span className="text-base font-black text-[#0A0B0D]">≈ ${result.estimatedUsd.toLocaleString()}</span>
            </div>
            {result.dropRationale && <p className="text-[10px] text-[#5B6271] italic mb-2">{result.dropRationale}</p>}
            <div className="flex flex-wrap gap-1">
              {result.txCount >= 100 && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">✅ {result.txCount}+ TX</span>}
              {result.nftCount >= 1 && <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-semibold">✅ NFT Holder</span>}
              {result.ageDays >= 180 && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">✅ OG ({result.ageDays}g)</span>}
              {result.uniqueContracts >= 10 && <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-semibold">✅ {result.uniqueContracts} CA</span>}
              {result.sybilRisk === 'DÜŞÜK' && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">✅ Gerçek Kullanıcı</span>}
              {result.longestStreak >= 7 && <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-semibold">✅ {result.longestStreak}g Streak</span>}
            </div>
          </>
        ) : (
          <p className="text-xs text-[#5B6271]">Aktivite çok düşük. Base&apos;de daha fazla işlem yap.</p>
        )}
        <p className="text-[9px] text-[#8A919E] mt-2 italic">⚠️ Spekülatif — resmi duyuru yok. OP/ARB/EIGEN precedentlerine göre tahmin.</p>
      </div>

      <button onClick={run} className="w-full text-xs text-[#0052FF] hover:text-[#1652F0] font-semibold py-1">
        🔄 Yenile
      </button>
    </div>
  )
}
