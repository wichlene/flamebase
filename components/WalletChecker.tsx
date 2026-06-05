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
  if (count === 0) return '#E4E7EB'
  if (count <= 2) return '#BCD4FF'
  if (count <= 5) return '#7AAAFF'
  if (count <= 10) return '#3B82F6'
  return '#0052FF'
}

// Cross-browser rounded rectangle on canvas
function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function ActivityHeatmap({ data }: { data: DayActivity[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  if (!data || data.length === 0) return null
  const firstDate = new Date(data[0].date + 'T00:00:00Z')
  const startPad = firstDate.getUTCDay()
  const padded: (DayActivity | null)[] = [...Array(startPad).fill(null), ...data]
  while (padded.length % 7 !== 0) padded.push(null)
  const cols: (DayActivity | null)[][] = []
  for (let i = 0; i < padded.length; i += 7) cols.push(padded.slice(i, i + 7))

  return (
    <div className="relative overflow-x-auto pb-1" onMouseLeave={() => setTip(null)}>
      {tip && (
        <div className="fixed z-50 pointer-events-none bg-[#0A0B0D] text-white text-[11px] px-2 py-1 rounded-lg shadow-lg whitespace-nowrap"
          style={{ left: tip.x + 10, top: tip.y - 36 }}>
          {tip.text}
        </div>
      )}
      <div className="flex gap-[3px]" style={{ minWidth: cols.length * 14 }}>
        {cols.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {col.map((d, di) => (
              <div
                key={di}
                className="w-[12px] h-[12px] rounded-[2px] cursor-default"
                style={{ background: d ? heatColor(d.count) : 'transparent' }}
                onMouseEnter={(e) => d && setTip({
                  x: e.clientX, y: e.clientY,
                  text: d.count > 0 ? `${d.date} — ${d.count} tx` : `${d.date} — no activity`,
                })}
                onMouseMove={(e) => setTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function generateCard(result: WalletResult, address: string): string {
  const W = 900, H = 480
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#050D1E'); bg.addColorStop(1, '#091525')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)

  // Accent top bar
  const tc = TIER_COLOR[result.tier] ?? '#9CA3AF'
  const bar = ctx.createLinearGradient(0, 0, W, 0)
  bar.addColorStop(0, tc); bar.addColorStop(1, 'transparent')
  ctx.fillStyle = bar; ctx.fillRect(0, 0, W, 3)

  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1)

  const font = (f: string) => { ctx.font = f }

  // Logo + address
  font('bold 22px system-ui,sans-serif'); ctx.fillStyle = '#FFFFFF'
  ctx.fillText('FlameBase', 36, 52)
  font('13px system-ui,sans-serif'); ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('Base Network  ·  ' + address.slice(0, 6) + '...' + address.slice(-4), 36, 72)

  // Tier + label
  font('bold 56px system-ui,sans-serif'); ctx.fillStyle = tc
  ctx.fillText('Tier ' + result.tier, 36, 154)
  font('16px system-ui,sans-serif'); ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillText((TIER_LABEL[result.tier] ?? '') + (result.userType ? '  ·  ' + result.userType : ''), 36, 178)

  // Score circle (right)
  const scx = W - 116, scy = 120, sr = 58
  ctx.beginPath(); ctx.arc(scx, scy, sr, 0, 2 * Math.PI)
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 9; ctx.stroke()
  ctx.beginPath(); ctx.arc(scx, scy, sr, -Math.PI / 2, -Math.PI / 2 + (result.score / 100) * 2 * Math.PI)
  ctx.strokeStyle = tc; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke()
  font('bold 30px system-ui,sans-serif'); ctx.fillStyle = tc
  ctx.textAlign = 'center'; ctx.fillText(String(result.score), scx, scy + 11)
  font('12px system-ui,sans-serif'); ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillText('/100', scx, scy + 30); ctx.textAlign = 'left'

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(36, 200, W - 72, 1)

  // Stats row
  const stats = [
    ['TX', result.txCount >= 1000 ? (result.txCount / 1000).toFixed(1) + 'k' : String(result.txCount)],
    ['Active Days', String(result.activeDays)],
    ['Streak', result.currentStreak + 'd'],
    ['Months', String(result.activeMonths)],
    ['NFTs', String(result.nftCount)],
    ['Contracts', String(result.uniqueContracts)],
  ]
  stats.forEach(([label, val], i) => {
    const x = 36 + i * 142
    font('bold 24px system-ui,sans-serif'); ctx.fillStyle = '#FFFFFF'; ctx.fillText(val, x, 244)
    font('11px system-ui,sans-serif'); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillText(label, x, 262)
  })

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(36, 280, W - 72, 1)

  // Badges
  font('12px system-ui,sans-serif')
  let bx = 36
  result.badges.slice(0, 7).forEach(b => {
    const bw = ctx.measureText(b).width + 24
    if (bx + bw > W - 36) return
    ctx.fillStyle = 'rgba(0,82,255,0.2)'
    rrect(ctx, bx, 292, bw, 26, 13)
    ctx.fill()
    ctx.strokeStyle = 'rgba(0,82,255,0.5)'; ctx.lineWidth = 1
    rrect(ctx, bx, 292, bw, 26, 13)
    ctx.stroke()
    ctx.fillStyle = '#7AAAFF'; ctx.fillText(b, bx + 12, 309)
    bx += bw + 8
  })

  // Drop estimate
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(36, 334, W - 72, 1)
  font('bold 16px system-ui,sans-serif'); ctx.fillStyle = '#FB923C'
  ctx.fillText('Estimated Base Drop:  ~' + result.estimatedTokens.toLocaleString() + ' $BASE  ≈  $' + result.estimatedUsd.toLocaleString() + ' USD', 36, 370)
  font('13px system-ui,sans-serif'); ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.fillText('Sybil Risk: ' + result.sybilRisk + '   ·   Wallet Age: ' + result.ageDays + ' days   ·   Volume: ' + result.volumeEth + ' ETH', 36, 392)

  // Footer
  font('13px system-ui,sans-serif'); ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.textAlign = 'right'
  ctx.fillText('flamebase.xyz', W - 36, H - 20)
  ctx.textAlign = 'left'
  ctx.fillStyle = 'rgba(255,255,255,0.1)'
  ctx.fillText('Speculative estimate — no official announcement', 36, H - 20)

  return canvas.toDataURL('image/png')
}

export default function WalletChecker({ onPay, compact }: { onPay?: () => Promise<void>; compact?: boolean }) {
  const { data: walletClient } = useWalletClient()
  const [loading, setLoading] = useState(false)
  const [loadStep, setLoadStep] = useState(0)
  const [result, setResult] = useState<WalletResult | null>(null)
  const [error, setError] = useState('')
  const [sharing, setSharing] = useState<null | 'download' | 'x' | 'fc'>(null)

  const address = walletClient?.account?.address

  const run = async () => {
    if (!address) return
    setLoading(true); setError(''); setLoadStep(0)
    // Progress steps to give user feedback
    const steps = [0, 1, 2, 3]
    let si = 0
    const ticker = setInterval(() => { if (si < steps.length - 1) setLoadStep(++si) }, 3000)
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
    clearInterval(ticker)
    setLoading(false)
  }

  const downloadCard = (dataUrl: string, addr: string) => {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `flamebase-${addr.slice(0, 6)}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const handleDownload = async () => {
    if (!result || !address) return
    setSharing('download')
    try {
      downloadCard(generateCard(result, address), address)
    } catch { /* ignore */ }
    setSharing(null)
  }

  const handleShareX = async () => {
    if (!result || !address) return
    setSharing('x')
    try {
      const dataUrl = generateCard(result, address)
      // Download card so user can attach it
      downloadCard(dataUrl, address)
      const text = [
        `🔥 My Base wallet score: Tier ${result.tier} — ${result.score}/100`,
        ``,
        `⚡ ${result.txCount.toLocaleString()} TXs  ·  📅 ${result.activeDays} active days  ·  🔥 ${result.longestStreak}d streak`,
        `🖼️ ${result.nftCount} NFTs  ·  📆 ${result.activeMonths} active months`,
        ``,
        `🪂 Estimated drop: ~${result.estimatedTokens.toLocaleString()} $BASE`,
        ``,
        `Check yours 👇 flamebase.xyz`,
        `#Base #BuildOnBase #Web3 #BaseChain`,
      ].join('\n')
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank')
    } catch { /* ignore */ }
    setSharing(null)
  }

  const handleShareFarcaster = async () => {
    if (!result || !address) return
    setSharing('fc')
    try {
      const dataUrl = generateCard(result, address)
      downloadCard(dataUrl, address)
      const text = [
        `🔥 Base wallet score: Tier ${result.tier} (${result.score}/100)`,
        ``,
        `⚡ ${result.txCount.toLocaleString()} TXs · ${result.activeDays} active days · ${result.longestStreak}d streak`,
        `🖼️ ${result.nftCount} NFTs · ${result.activeMonths} months active`,
        `🪂 Estimated drop: ~${result.estimatedTokens.toLocaleString()} $BASE ≈ $${result.estimatedUsd.toLocaleString()}`,
        ``,
        `Check yours → flamebase.xyz`,
      ].join('\n')
      window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`, '_blank')
    } catch { /* ignore */ }
    setSharing(null)
  }

  if (!address) return (
    <div className="p-6 text-center space-y-2">
      <div className="text-3xl">🔗</div>
      <p className="font-bold text-[#0A0B0D] text-sm">Connect your wallet to analyze</p>
      <p className="text-xs text-[#8A919E]">Real on-chain data from Base network</p>
    </div>
  )

  if (!result && !loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="text-center space-y-1">
          <div className="text-3xl">🔍</div>
          <p className="font-bold text-[#0A0B0D] text-sm">Analyze your Base wallet</p>
          <p className="text-xs text-[#5B6271]">TX history · NFTs · streaks · badges · Base drop estimate</p>
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded-xl p-2 text-xs text-red-600">❌ {error}</div>}
        <button onClick={run} className="w-full bg-[#0052FF] hover:bg-[#1652F0] text-white font-bold py-3 rounded-xl text-sm transition-colors">
          🤖 Analyze with AI
        </button>
      </div>
    )
  }

  if (loading) {
    const steps = [
      'Fetching transaction history from Base…',
      'Reading NFT collections…',
      'Calculating streaks & activity…',
      'Running AI analysis…',
    ]
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-3 p-3 bg-[#F0F4FF] rounded-xl border border-[#D6E2FF]">
          <div className="w-5 h-5 border-2 border-[#0052FF] border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <div>
            <p className="text-xs font-bold text-[#0052FF]">Analyzing wallet on Base</p>
            <p className="text-[11px] text-[#5B6271] mt-0.5">{steps[loadStep]}</p>
          </div>
        </div>
        <div className="space-y-2 animate-pulse">
          <div className="h-20 bg-[#E4E7EB] rounded-2xl" />
          <div className="grid grid-cols-4 gap-1.5">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-[#E4E7EB] rounded-xl" />)}</div>
          <div className="h-16 bg-[#E4E7EB] rounded-xl" />
          <div className="grid grid-cols-2 gap-1.5">{[...Array(4)].map((_, i) => <div key={i} className="h-12 bg-[#E4E7EB] rounded-xl" />)}</div>
        </div>
        <p className="text-center text-[10px] text-[#8A919E]">Reading up to 800 txs — may take 10-20s</p>
      </div>
    )
  }

  if (!result) return null

  const tc = TIER_COLOR[result.tier] ?? '#9CA3AF'

  return (
    <div className="space-y-3 p-3">
      {/* Score Card */}
      <div className="rounded-2xl p-4" style={{ background: `linear-gradient(135deg, ${tc}18, ${tc}06)`, border: `1.5px solid ${tc}33` }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold text-[#8A919E] uppercase tracking-wider">BASE TIER</p>
            <p className="font-black text-2xl leading-tight" style={{ color: tc }}>Tier {result.tier}</p>
            <p className="text-xs text-[#5B6271]">{TIER_LABEL[result.tier] ?? ''}</p>
            {result.userType && <p className="text-xs mt-0.5 font-medium" style={{ color: tc }}>👤 {result.userType}</p>}
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

      {/* Share row — always visible at top */}
      <div className="space-y-1.5">
        <p className="text-[10px] text-[#8A919E] text-center">Card auto-downloads → attach it in the compose window</p>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={handleShareX}
            disabled={!!sharing}
            className="bg-[#0A0B0D] hover:bg-[#1A1B1D] disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1"
          >
            {sharing === 'x' ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '𝕏'}
            Share on X
          </button>
          <button
            onClick={handleShareFarcaster}
            disabled={!!sharing}
            className="bg-[#7B61FF] hover:bg-[#6B51EF] disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1"
          >
            {sharing === 'fc' ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '🟣'}
            Farcaster
          </button>
          <button
            onClick={handleDownload}
            disabled={!!sharing}
            className="bg-[#F8FAFF] hover:bg-[#EDF1FF] disabled:opacity-50 border border-[#D6E2FF] text-[#0052FF] font-bold py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1"
          >
            {sharing === 'download' ? <span className="w-3 h-3 border-2 border-[#0052FF] border-t-transparent rounded-full animate-spin" /> : '📥'}
            Download
          </button>
        </div>
        <button onClick={run} className="w-full text-[10px] text-[#8A919E] hover:text-[#5B6271] py-1 transition-colors">
          🔄 Re-analyze
        </button>
      </div>

      {/* Key Stats */}
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

      {/* Activity Heatmap */}
      {result.dailyActivity?.length > 0 && (
        <div className="bg-white border border-[#E4E7EB] rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-[#5B6271]">📊 Activity — last 12 months (each cell = 1 day)</p>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-[#8A919E]">Less</span>
              {[0, 2, 5, 10, 15].map(n => (
                <div key={n} className="w-[10px] h-[10px] rounded-[2px]" style={{ background: heatColor(n) }} />
              ))}
              <span className="text-[9px] text-[#8A919E]">More</span>
            </div>
          </div>
          <ActivityHeatmap data={result.dailyActivity} />
        </div>
      )}

      {/* Badges */}
      {result.badges?.length > 0 && (
        <div className="bg-white border border-[#E4E7EB] rounded-xl p-3">
          <p className="text-[11px] font-semibold text-[#5B6271] mb-2">🏅 Earned Badges</p>
          <div className="flex flex-wrap gap-1.5">
            {result.badges.map((b, i) => (
              <span key={i} className="text-[11px] bg-[#F0F4FF] text-[#0052FF] px-2.5 py-1 rounded-full font-semibold border border-[#D6E2FF]">{b}</span>
            ))}
          </div>
        </div>
      )}

      {/* Full On-Chain Data */}
      <div className="bg-white border border-[#E4E7EB] rounded-xl p-3">
        <p className="text-[11px] font-semibold text-[#5B6271] mb-2">📈 On-Chain Data (Base)</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { icon: '⚡', label: 'Total TX', val: result.txCount.toLocaleString() + (result.hasMore ? '+' : '') },
            { icon: '📊', label: 'TX / Day', val: result.txPerDay },
            { icon: '🔄', label: 'Token Transfers', val: result.tokenTransfers.toLocaleString() },
            { icon: '📞', label: 'Contract Calls', val: result.contractCallCount.toLocaleString() },
            { icon: '💰', label: 'ETH Balance', val: `${result.ethBalance} ETH` },
            { icon: '💸', label: 'Volume Sent', val: `${result.volumeEth} ETH` },
            { icon: '🏗️', label: 'Contracts Used', val: result.uniqueContracts.toLocaleString() },
            { icon: '📅', label: 'Wallet Age', val: result.ageDays > 0 ? `${result.ageDays} days` : 'New', sub: result.firstTxDate },
            { icon: '🔥', label: 'Best Streak', val: `${result.longestStreak} days` },
            { icon: '📆', label: 'Active Weeks', val: String(result.activeWeeks) },
          ].map(s => (
            <div key={s.label} className="bg-[#FAFAFA] border border-[#F0F0F0] rounded-lg p-2">
              <p className="text-[#8A919E] text-[10px]">{s.icon} {s.label}</p>
              <p className="font-bold text-[#0A0B0D] text-sm">{s.val}</p>
              {'sub' in s && s.sub && <p className="text-[9px] text-[#8A919E]">{s.sub}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* NFT Collections */}
      {result.nftList?.length > 0 && (
        <div className="bg-white border border-[#E4E7EB] rounded-xl p-3">
          <p className="text-[11px] font-semibold text-[#5B6271] mb-2">
            🖼️ NFT Collections — {result.nftCount} items across {result.nftCollections} collections
          </p>
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {result.nftList.map((nft, i) => (
              <div key={i} className="flex items-center justify-between py-0.5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0052FF] to-[#7B61FF] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                    {(nft.symbol || nft.name).slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[#0A0B0D] leading-tight">{nft.name}</p>
                    {nft.symbol && <p className="text-[9px] text-[#8A919E]">{nft.symbol}</p>}
                  </div>
                </div>
                <span className="text-xs font-bold text-[#5B6271] flex-shrink-0 ml-2">×{nft.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sybil Risk */}
      <div className={`border rounded-xl p-3 ${result.sybilRisk === 'LOW' ? 'bg-green-50 border-green-200' : result.sybilRisk === 'MEDIUM' ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-[#0A0B0D]">🛡️ Sybil Risk Assessment</span>
          <span className={`text-xs font-black px-2 py-0.5 rounded-full ${result.sybilRisk === 'LOW' ? 'bg-green-100 text-green-700' : result.sybilRisk === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{result.sybilRisk}</span>
        </div>
        {result.sybilFlags.length > 0
          ? <ul className="space-y-0.5">{result.sybilFlags.map((f, i) => <li key={i} className="text-xs text-[#5B6271]">⚠️ {f}</li>)}</ul>
          : <p className="text-xs text-green-700">✅ No sybil signals detected — looks like a genuine user</p>
        }
      </div>

      {/* AI Summary */}
      {result.aiSummary && (
        <div className="bg-gradient-to-br from-[#F0F4FF] to-[#EEF2FF] border border-[#D6E2FF] rounded-xl p-3">
          <p className="text-[10px] font-bold text-[#0052FF] mb-1.5">🤖 AI Analysis</p>
          <p className="text-xs text-[#0A0B0D] leading-relaxed">{result.aiSummary}</p>
        </div>
      )}

      {/* Drop Estimate */}
      <div className="bg-gradient-to-br from-[#FFF7ED] to-[#FFFBF5] border border-[#FED7AA] rounded-xl p-3">
        <p className="text-[10px] font-bold text-orange-600 mb-2">🪂 Estimated Base Airdrop</p>
        {result.estimatedTokens > 0 ? (
          <>
            <div className="flex items-baseline gap-1.5 mb-1.5">
              <span className="text-2xl font-black text-orange-500">~{result.estimatedTokens.toLocaleString()}</span>
              <span className="text-xs text-[#5B6271] font-semibold">$BASE</span>
              <span className="text-lg font-black text-[#0A0B0D] ml-1">≈ ${result.estimatedUsd.toLocaleString()} USD</span>
            </div>
            {result.dropRationale && <p className="text-[10px] text-[#5B6271] italic mb-2 leading-relaxed">{result.dropRationale}</p>}
            <div className="flex flex-wrap gap-1 mb-2">
              {result.txCount >= 100 && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">✅ {result.txCount.toLocaleString()} TX</span>}
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
        <p className="text-[9px] text-[#8A919E] italic">⚠️ Speculative — no official announcement. Based on OP/ARB/EIGEN precedents.</p>
      </div>

    </div>
  )
}
