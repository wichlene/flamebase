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
  sybilFlags: string[]; sybilRisk: 'LOW' | 'MEDIUM' | 'HIGH'
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

// Horizontal day-by-day heatmap (last N days left→right, 7 rows = Mon–Sun)
function ActivityHeatmap({ data }: { data: DayActivity[] }) {
  if (!data || data.length === 0) return null
  // Pad start so day[0] lands on correct weekday column
  const firstDate = new Date(data[0].date + 'T00:00:00Z')
  const startPad = firstDate.getUTCDay() // 0=Sun
  const padded: (DayActivity | null)[] = [...Array(startPad).fill(null), ...data]
  // Fill remaining cells so grid is complete
  while (padded.length % 7 !== 0) padded.push(null)

  // Build week columns
  const cols: (DayActivity | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) cols.push(padded.slice(i, i + 7))

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex gap-[3px]" style={{ minWidth: cols.length * 12 }}>
        {cols.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((d, di) => (
              <div
                key={di}
                title={d ? `${d.date}: ${d.count} tx` : ''}
                className="w-[10px] h-[10px] rounded-[2px]"
                style={{ background: d ? heatColor(d.count) : 'transparent' }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function generateCard(result: WalletResult, address: string): string {
  const W = 800, H = 440
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Background
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#050D1E'); bg.addColorStop(1, '#0A1628')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

  // Border
  ctx.strokeStyle = 'rgba(0,82,255,0.25)'; ctx.lineWidth = 1.5
  ctx.strokeRect(1, 1, W - 2, H - 2)

  const tc = TIER_COLOR[result.tier] ?? '#9CA3AF'
  const sa = (f: string) => { ctx.font = f }

  // Header
  sa('bold 20px system-ui,sans-serif'); ctx.fillStyle = '#FFFFFF'
  ctx.fillText('FlameBase', 32, 46)
  sa('13px system-ui,sans-serif'); ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fillText('Base Wallet Analysis  ·  ' + address.slice(0, 6) + '...' + address.slice(-4), 32, 68)

  // Tier
  sa('bold 48px system-ui,sans-serif'); ctx.fillStyle = tc
  ctx.fillText('Tier ' + result.tier, 32, 148)
  sa('15px system-ui,sans-serif'); ctx.fillStyle = 'rgba(255,255,255,0.6)'
  ctx.fillText((TIER_LABEL[result.tier] ?? '') + (result.userType ? '  ·  ' + result.userType : ''), 32, 170)

  // Score circle
  const cx = W - 110, cy = 130, r = 55
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 8; ctx.stroke()
  ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (result.score / 100) * 2 * Math.PI)
  ctx.strokeStyle = tc; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke()
  sa('bold 26px system-ui,sans-serif'); ctx.fillStyle = tc
  ctx.textAlign = 'center'; ctx.fillText(String(result.score), cx, cy + 9)
  sa('11px system-ui,sans-serif'); ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('/100', cx, cy + 26); ctx.textAlign = 'left'

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(32, 192, W - 64, 1)

  // Stats
  const stats = [
    ['⚡', 'TX', result.txCount >= 1000 ? (result.txCount / 1000).toFixed(1) + 'k' : String(result.txCount)],
    ['📅', 'Active Days', String(result.activeDays)],
    ['🔥', 'Streak', `${result.currentStreak}d`],
    ['📆', 'Months', String(result.activeMonths)],
    ['🖼️', 'NFTs', String(result.nftCount)],
  ]
  stats.forEach(([, label, val], i) => {
    const x = 32 + i * 150
    sa('bold 22px system-ui,sans-serif'); ctx.fillStyle = '#FFFFFF'; ctx.fillText(val, x, 238)
    sa('11px system-ui,sans-serif'); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fillText(label, x, 256)
  })

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(32, 274, W - 64, 1)

  // Badges
  sa('12px system-ui,sans-serif')
  let bx = 32
  result.badges.slice(0, 6).forEach(b => {
    const bw = ctx.measureText(b).width + 22
    ctx.fillStyle = 'rgba(0,82,255,0.22)'
    ctx.beginPath()
    ;(ctx as any).roundRect(bx, 286, bw, 24, 12)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,82,255,0.45)'; ctx.lineWidth = 1; ctx.stroke()
    ctx.fillStyle = '#7AAAFF'; ctx.fillText(b, bx + 11, 302)
    bx += bw + 8
    if (bx > W - 100) return
  })

  // Drop
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(32, 326, W - 64, 1)
  sa('bold 15px system-ui,sans-serif'); ctx.fillStyle = '#FB923C'
  ctx.fillText('Estimated Base Drop: ~' + result.estimatedTokens.toLocaleString() + ' $BASE', 32, 362)
  sa('14px system-ui,sans-serif'); ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillText('≈ $' + result.estimatedUsd.toLocaleString() + ' USD   ·   Sybil Risk: ' + result.sybilRisk, 32, 384)

  // Footer
  sa('12px system-ui,sans-serif'); ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.textAlign = 'right'; ctx.fillText('flamebase.xyz', W - 32, H - 18); ctx.textAlign = 'left'

  return canvas.toDataURL('image/png')
}

export default function WalletChecker({ onPay, compact }: { onPay?: () => Promise<void>; compact?: boolean }) {
  const { data: walletClient } = useWalletClient()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<WalletResult | null>(null)
  const [error, setError] = useState('')
  const [sharing, setSharing] = useState(false)

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
      if (!res.ok || data.error) setError(data.error || 'An error occurred')
      else setResult(data)
    } catch (e: any) {
      setError(e?.message || 'Connection error')
    }
    setLoading(false)
  }

  const handleShare = async () => {
    if (!result || !address) return
    setSharing(true)
    try {
      const dataUrl = generateCard(result, address)
      // Web Share API (mobile)
      if (typeof navigator !== 'undefined' && navigator.share) {
        const blob = await (await fetch(dataUrl)).blob()
        const file = new File([blob], 'flamebase-wallet.png', { type: 'image/png' })
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'FlameBase Wallet Analysis' })
          setSharing(false); return
        }
      }
      // Desktop: download
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `flamebase-${address.slice(0, 6)}.png`
      a.click()
    } catch { /* user cancelled */ }
    setSharing(false)
  }

  if (!address) return <div className="p-4 text-center text-sm text-[#8A919E]">Connect your wallet to analyze</div>

  if (!result && !loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="text-center space-y-1">
          <div className="text-3xl">🔍</div>
          <p className="font-bold text-[#0A0B0D] text-sm">Analyze your wallet with AI</p>
          <p className="text-xs text-[#5B6271]">TX count, NFTs, streaks, badges &amp; Base drop estimate</p>
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-xs text-red-600">❌ {error}</div>}
        <button onClick={run} className="w-full bg-[#0052FF] hover:bg-[#1652F0] text-white font-bold py-3 rounded-xl text-sm transition-colors">
          🤖 Analyze with AI
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
          { icon: '📅', label: 'Active Days', val: String(result.activeDays) },
          { icon: '🔥', label: 'Streak', val: `${result.currentStreak}d` },
          { icon: '📆', label: 'Months', val: String(result.activeMonths) },
        ].map(s => (
          <div key={s.label} className="bg-[#F8FAFF] border border-[#E4E7EB] rounded-xl p-2 text-center">
            <div className="text-sm">{s.icon}</div>
            <div className="font-bold text-[#0A0B0D] text-sm leading-tight">{s.val}</div>
            <div className="text-[9px] text-[#8A919E]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Activity Heatmap — day by day */}
      {result.dailyActivity?.length > 0 && (
        <div className="bg-white border border-[#E4E7EB] rounded-xl p-3">
          <p className="text-[11px] font-semibold text-[#5B6271] mb-2">📊 Activity (last 12 months, day by day)</p>
          <ActivityHeatmap data={result.dailyActivity} />
          <div className="flex items-center gap-1 mt-2 justify-end">
            <span className="text-[9px] text-[#8A919E]">Less</span>
            {[0, 2, 5, 10, 15].map(n => (
              <div key={n} className="w-[10px] h-[10px] rounded-[2px]" style={{ background: heatColor(n) }} />
            ))}
            <span className="text-[9px] text-[#8A919E]">More</span>
          </div>
        </div>
      )}

      {/* Badges */}
      {result.badges?.length > 0 && (
        <div className="bg-white border border-[#E4E7EB] rounded-xl p-3">
          <p className="text-[11px] font-semibold text-[#5B6271] mb-2">🏅 Badges</p>
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
          { icon: '🔄', label: 'Token Transfers', val: result.tokenTransfers.toLocaleString() },
          { icon: '💰', label: 'ETH Balance', val: `${result.ethBalance} ETH` },
          { icon: '💸', label: 'ETH Volume', val: `${result.volumeEth} ETH` },
          { icon: '🏗️', label: 'Contracts Used', val: String(result.uniqueContracts) },
          { icon: '📅', label: 'Wallet Age', val: result.ageDays > 0 ? `${result.ageDays} days` : 'New', sub: result.firstTxDate },
          { icon: '⚡', label: 'Max Streak', val: `${result.longestStreak} days` },
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
          <p className="text-[11px] font-semibold text-[#5B6271] mb-2">🖼️ NFTs ({result.nftCount} items, {result.nftCollections} collections)</p>
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
            {result.nftCollections > 5 && <p className="text-[10px] text-[#8A919E]">+{result.nftCollections - 5} more collections</p>}
          </div>
        </div>
      )}

      {/* Sybil Risk */}
      <div className={`border rounded-xl p-3 ${result.sybilRisk === 'LOW' ? 'bg-green-50 border-green-200' : result.sybilRisk === 'MEDIUM' ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-[#0A0B0D]">🛡️ Sybil Risk</span>
          <span className={`text-xs font-black ${result.sybilRisk === 'LOW' ? 'text-green-600' : result.sybilRisk === 'MEDIUM' ? 'text-yellow-600' : 'text-red-600'}`}>{result.sybilRisk}</span>
        </div>
        {result.sybilFlags.length > 0
          ? <ul className="space-y-0.5">{result.sybilFlags.map((f, i) => <li key={i} className="text-xs text-[#5B6271]">⚠️ {f}</li>)}</ul>
          : <p className="text-xs text-green-600">✅ No significant sybil signals detected</p>
        }
        {result.userType && <p className="text-xs mt-1 font-semibold text-[#5B6271]">👤 {result.userType}</p>}
      </div>

      {/* AI Summary */}
      {result.aiSummary && (
        <div className="bg-gradient-to-br from-[#F0F4FF] to-[#EEF2FF] border border-[#D6E2FF] rounded-xl p-3">
          <p className="text-[10px] font-bold text-[#0052FF] mb-1">🤖 AI Analysis</p>
          <p className="text-xs text-[#0A0B0D] leading-relaxed">{result.aiSummary}</p>
        </div>
      )}

      {/* Drop Estimate */}
      <div className="bg-gradient-to-br from-[#FFF7ED] to-[#FFFBF5] border border-[#FED7AA] rounded-xl p-3">
        <p className="text-[10px] font-bold text-orange-600 mb-2">🪂 Estimated Base Drop</p>
        {result.estimatedTokens > 0 ? (
          <>
            <div className="flex items-baseline gap-1.5 mb-1">
              <span className="text-xl font-black text-orange-500">~{result.estimatedTokens.toLocaleString()}</span>
              <span className="text-xs text-[#5B6271]">$BASE tokens</span>
              <span className="text-base font-black text-[#0A0B0D]">≈ ${result.estimatedUsd.toLocaleString()}</span>
            </div>
            {result.dropRationale && <p className="text-[10px] text-[#5B6271] italic mb-2">{result.dropRationale}</p>}
            <div className="flex flex-wrap gap-1">
              {result.txCount >= 100 && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">✅ {result.txCount}+ TX</span>}
              {result.nftCount >= 1 && <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full font-semibold">✅ NFT Holder</span>}
              {result.ageDays >= 180 && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold">✅ OG ({result.ageDays}d)</span>}
              {result.uniqueContracts >= 10 && <span className="text-[9px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-semibold">✅ {result.uniqueContracts} contracts</span>}
              {result.sybilRisk === 'LOW' && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">✅ Real User</span>}
              {result.longestStreak >= 7 && <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-semibold">✅ {result.longestStreak}d Streak</span>}
            </div>
          </>
        ) : (
          <p className="text-xs text-[#5B6271]">Activity too low. Use Base more to qualify.</p>
        )}
        <p className="text-[9px] text-[#8A919E] mt-2 italic">⚠️ Speculative — no official announcement. Estimated based on OP/ARB/EIGEN precedents.</p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleShare}
          disabled={sharing}
          className="flex-1 bg-[#0052FF] hover:bg-[#1652F0] disabled:opacity-50 text-white font-bold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-1.5"
        >
          {sharing ? '⏳ Preparing…' : '📤 Share / Download Card'}
        </button>
        <button onClick={run} className="px-3 py-2.5 border border-[#E4E7EB] rounded-xl text-sm text-[#5B6271] hover:bg-[#F8FAFF] transition-colors">
          🔄
        </button>
      </div>
    </div>
  )
}
