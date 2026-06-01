'use client'
import { useState, useEffect } from 'react'

interface WalletStats {
  txCount: number
  tokenTransfers: number
  nftCount: number
  volumeEth: number
  firstTxDaysAgo: number
  score: number
  tier: 'S' | 'A' | 'B' | 'C' | 'D'
  estimatedTokens: number
  estimatedUsd: number
}

const TIER_COLOR: Record<string, string> = {
  S: 'text-purple-600 bg-purple-50 border-purple-200',
  A: 'text-green-600 bg-green-50 border-green-200',
  B: 'text-blue-600 bg-blue-50 border-blue-200',
  C: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  D: 'text-red-500 bg-red-50 border-red-200',
}

const TIER_LABEL: Record<string, string> = {
  S: 'Whale 🐋',
  A: 'Power User ⚡',
  B: 'Active User 🔥',
  C: 'Casual User 👤',
  D: 'New / Inactive',
}

interface Props {
  connectedAddress?: string
  compact?: boolean
}

export default function WalletChecker({ connectedAddress, compact = false }: Props) {
  const [customAddr, setCustomAddr] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<WalletStats | null>(null)
  const [error, setError] = useState('')
  const [checkedAddr, setCheckedAddr] = useState('')

  const check = async (addr: string) => {
    const target = addr.trim()
    if (!target) return
    setLoading(true)
    setError('')
    setResult(null)
    setCheckedAddr(target)
    try {
      const res = await fetch('/api/wallet-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: target }),
      })
      const data = await res.json()
      if (!res.ok || data.error) setError(data.error || 'Failed')
      else setResult(data)
    } catch {
      setError('Connection error')
    }
    setLoading(false)
  }

  // Auto-fetch when connected wallet is provided
  useEffect(() => {
    if (connectedAddress && connectedAddress !== checkedAddr) {
      check(connectedAddress)
    }
  }, [connectedAddress]) // eslint-disable-line react-hooks/exhaustive-deps

  const tierClass = result ? TIER_COLOR[result.tier] : ''
  const displayAddr = checkedAddr || connectedAddress || ''

  const statRows = result ? [
    { icon: '⚡', label: 'Total Transactions', value: result.txCount.toLocaleString(), sub: 'Base mainnet' },
    { icon: '🔄', label: 'Token Transfers', value: result.tokenTransfers.toLocaleString(), sub: 'ERC-20 moves' },
    { icon: '🖼️', label: 'NFTs Owned', value: result.nftCount.toLocaleString(), sub: 'ERC-721 + ERC-1155' },
    { icon: '💸', label: 'Volume', value: `${result.volumeEth} ETH`, sub: 'Last 50 txs' },
    { icon: '📅', label: 'Age on Base', value: result.firstTxDaysAgo > 0 ? `${result.firstTxDaysAgo} days` : 'Brand new', sub: 'Since first tx' },
  ] : []

  return (
    <div className={compact ? 'space-y-3' : 'p-5 space-y-4'}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-black text-[#0A0B0D] text-base">🏦 Base Wallet Analysis</h2>
          {displayAddr && (
            <p className="text-[11px] text-[#8A919E] font-mono mt-0.5">
              {displayAddr.slice(0, 10)}…{displayAddr.slice(-6)}
            </p>
          )}
        </div>
        {result && (
          <button onClick={() => check(displayAddr)}
            className="text-xs text-[#0052FF] hover:underline font-semibold">
            Refresh
          </button>
        )}
      </div>

      {/* Search any wallet */}
      {!compact && (
        <div className="flex gap-2">
          <input
            value={customAddr}
            onChange={e => setCustomAddr(e.target.value)}
            placeholder="Check any wallet: 0x..."
            className="flex-1 border border-[#E4E7EB] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0052FF]/20 focus:border-[#0052FF] bg-white"
            onKeyDown={e => e.key === 'Enter' && customAddr.trim() && check(customAddr)}
          />
          <button onClick={() => customAddr.trim() && check(customAddr)}
            disabled={loading || !customAddr.trim()}
            className="bg-[#F0F4FF] hover:bg-[#E6EEFF] disabled:opacity-40 text-[#0052FF] font-bold px-4 py-2.5 rounded-xl text-sm border border-[#D6E2FF] transition-colors">
            Check
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-xl px-4 py-3">❌ {error}</p>}

      {loading && (
        <div className="space-y-3 animate-pulse">
          <div className="h-20 bg-[#F0F2F5] rounded-2xl" />
          <div className="grid grid-cols-2 gap-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-[#F0F2F5] rounded-xl" />)}
          </div>
          <div className="h-24 bg-[#F0F2F5] rounded-2xl" />
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* Tier banner */}
          <div className={`flex items-center justify-between px-4 py-3 rounded-2xl border-2 ${tierClass}`}>
            <div>
              <p className="text-[10px] font-bold uppercase opacity-60 tracking-wider">Base Activity Tier</p>
              <p className="font-black text-2xl leading-tight">Tier {result.tier}</p>
              <p className="text-sm font-semibold">{TIER_LABEL[result.tier]}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] opacity-60 uppercase tracking-wider">Score</p>
              <p className="font-black text-4xl leading-none">{result.score}</p>
              <p className="text-[10px] opacity-60">/ 1000 pts</p>
            </div>
          </div>

          {/* Score bar */}
          <div>
            <div className="h-2.5 bg-[#E4E7EB] rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${result.score / 10}%`,
                  background: result.score >= 800 ? '#9333ea' : result.score >= 600 ? '#22c55e' : result.score >= 400 ? '#3b82f6' : result.score >= 200 ? '#eab308' : '#ef4444',
                }} />
            </div>
            <div className="flex justify-between text-[9px] text-[#8A919E] mt-1 px-0.5">
              <span>D</span><span>C</span><span>B</span><span>A</span><span>S</span>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            {statRows.map(s => (
              <div key={s.label} className="bg-white border border-[#E4E7EB] rounded-xl p-3">
                <p className="text-[#8A919E] text-[11px]">{s.icon} {s.label}</p>
                <p className="font-black text-[#0A0B0D] text-lg leading-tight">{s.value}</p>
                <p className="text-[10px] text-[#B0B7C3]">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Airdrop estimate */}
          <div className="bg-gradient-to-br from-[#0052FF]/8 to-[#7B61FF]/10 border border-[#0052FF]/25 rounded-2xl p-4">
            <p className="text-xs font-black text-[#0052FF] mb-2 uppercase tracking-wider">🎯 Olası Base Drop Tahmini</p>
            {result.estimatedTokens > 0 ? (
              <div className="space-y-1">
                <p className="font-black text-[#0A0B0D] text-2xl">
                  ~{result.estimatedTokens.toLocaleString()}
                  <span className="text-sm font-semibold text-[#5B6271] ml-1">tokens</span>
                </p>
                <p className="text-sm text-[#5B6271]">
                  ≈ <span className="font-black text-[#0A0B0D] text-lg">${result.estimatedUsd.toLocaleString()}</span>
                  <span className="text-xs text-[#8A919E] ml-1">@ $0.25/token (spekülatif)</span>
                </p>
                <div className="flex gap-1 flex-wrap mt-2">
                  {result.txCount >= 100 && <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">✅ Power TX</span>}
                  {result.nftCount >= 1 && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">✅ NFT Holder</span>}
                  {result.firstTxDaysAgo >= 180 && <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">✅ OG User</span>}
                  {result.volumeEth >= 1 && <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">✅ High Volume</span>}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-[#8A919E]">Aktivite çok düşük şu an.</p>
                <p className="text-xs text-[#8A919E] mt-1">Base'de daha fazla TX yap, NFT mint et, uzun süre aktif kal.</p>
              </div>
            )}
            <p className="text-[9px] text-[#B0B7C3] mt-3 leading-relaxed">
              ⚠️ Spekülatif tahmin — resmi duyuru yok. Arbitrum, Optimism, zkSync airdroplarındaki paternlere göre hesaplanmıştır.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
