'use client'
import { useState } from 'react'

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

export default function WalletChecker({ connectedAddress }: { connectedAddress?: string }) {
  const [address, setAddress] = useState(connectedAddress || '')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<WalletStats | null>(null)
  const [error, setError] = useState('')

  const check = async (addr?: string) => {
    const target = (addr ?? address).trim()
    if (!target) return
    setLoading(true)
    setError('')
    setResult(null)
    if (addr) setAddress(addr)
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

  const tierClass = result ? TIER_COLOR[result.tier] : ''

  return (
    <div className="p-3 space-y-3">
      <div>
        <h2 className="font-black text-[#0A0B0D] text-sm">🏦 Base Wallet Check</h2>
        <p className="text-[10px] text-[#5B6271] mt-0.5">TX sayısı, NFT, volume ve olası drop tahmini.</p>
      </div>

      <div className="space-y-1.5">
        <input
          value={address}
          onChange={e => setAddress(e.target.value)}
          placeholder="0x... wallet address"
          className="w-full border border-[#E4E7EB] rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#0052FF]/30 focus:border-[#0052FF] bg-white"
          onKeyDown={e => e.key === 'Enter' && check()}
        />
        <div className="flex gap-1.5">
          <button onClick={() => check()}
            disabled={loading || !address.trim()}
            className="flex-1 bg-[#0052FF] hover:bg-[#1652F0] disabled:opacity-40 text-white font-bold py-2 rounded-lg text-xs transition-colors">
            {loading ? <span className="animate-pulse">Checking…</span> : 'Check Wallet'}
          </button>
          {connectedAddress && (
            <button onClick={() => check(connectedAddress)}
              disabled={loading}
              className="bg-[#F0F4FF] hover:bg-[#E6EEFF] text-[#0052FF] font-bold py-2 px-2.5 rounded-lg text-xs border border-[#D6E2FF] transition-colors whitespace-nowrap">
              Mine
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-2.5 py-2">❌ {error}</p>}

      {loading && (
        <div className="space-y-2 animate-pulse">
          {[...Array(4)].map((_, i) => <div key={i} className="h-8 bg-[#F0F2F5] rounded-lg" />)}
        </div>
      )}

      {result && (
        <div className="space-y-2">
          {/* Tier badge */}
          <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${tierClass}`}>
            <div>
              <p className="text-[10px] font-semibold opacity-70">Base Activity Tier</p>
              <p className="font-black text-lg leading-tight">Tier {result.tier}</p>
              <p className="text-xs font-semibold">{TIER_LABEL[result.tier]}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] opacity-70">Score</p>
              <p className="font-black text-2xl">{result.score}</p>
              <p className="text-[10px] opacity-70">/ 1000</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-1.5">
            {[
              { icon: '⚡', label: 'Transactions', value: result.txCount.toLocaleString() },
              { icon: '🖼️', label: 'NFTs', value: result.nftCount.toLocaleString() },
              { icon: '💸', label: 'Volume (ETH)', value: `${result.volumeEth} ETH` },
              { icon: '📅', label: 'Age on Base', value: result.firstTxDaysAgo > 0 ? `${result.firstTxDaysAgo}d` : 'New' },
            ].map(s => (
              <div key={s.label} className="bg-[#F8FAFF] border border-[#E4E7EB] rounded-xl p-2.5">
                <p className="text-[10px] text-[#8A919E]">{s.icon} {s.label}</p>
                <p className="font-bold text-[#0A0B0D] text-sm">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Score bar */}
          <div>
            <div className="flex justify-between text-[10px] text-[#8A919E] mb-1">
              <span>Airdrop Score</span>
              <span>{result.score}/1000</span>
            </div>
            <div className="h-2 bg-[#E4E7EB] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${result.score / 10}%`,
                  background: result.score >= 600 ? '#22c55e' : result.score >= 400 ? '#3b82f6' : result.score >= 200 ? '#eab308' : '#ef4444',
                }}
              />
            </div>
          </div>

          {/* Drop estimate */}
          <div className="bg-gradient-to-br from-[#0052FF]/5 to-[#7B61FF]/10 border border-[#0052FF]/20 rounded-xl p-3">
            <p className="text-[10px] font-bold text-[#0052FF] mb-1.5">🎯 Olası Drop Tahmini</p>
            {result.estimatedTokens > 0 ? (
              <>
                <p className="font-black text-[#0A0B0D] text-base">
                  ~{result.estimatedTokens.toLocaleString()} <span className="text-sm font-semibold text-[#5B6271]">tokens</span>
                </p>
                <p className="text-xs text-[#5B6271]">
                  ≈ <span className="font-bold text-[#0A0B0D]">${result.estimatedUsd.toLocaleString()}</span>
                  <span className="text-[10px]"> @ $0.25/token (spec.)</span>
                </p>
              </>
            ) : (
              <p className="text-xs text-[#8A919E]">Aktivite çok düşük. Base'de daha aktif ol!</p>
            )}
            <p className="text-[9px] text-[#8A919E] mt-1.5 leading-tight">
              ⚠️ Tamamen spekülatif — resmi duyuru yok. Geçmiş L2 airdroplarına göre tahmin.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
