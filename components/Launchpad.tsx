'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, usePublicClient, useSendTransaction, useWatchAsset, useWriteContract } from 'wagmi'
import { erc20Abi, formatEther, parseEther } from 'viem'
import { base } from 'wagmi/chains'

/*
  B20 DEX — a Uniswap-Explore-style table of every B20 token on Base, with
  in-site buy/sell. Tokens are discovered from the B20 factory's B20Created
  event; live price/volume/FDV come from DexScreener. Trades are routed by the
  KyberSwap aggregator (server proxy at /api/swap) across ALL Base DEXs —
  Aerodrome, Uniswap V2/V3/V4, etc. — so any token with liquidity is tradeable.
*/

const FACTORY = '0xB20f000000000000000000000000000000000000' as const
const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const // aggregator native-ETH sentinel

const B20_CREATED = {
  type: 'event', name: 'B20Created',
  inputs: [
    { indexed: true, name: 'token', type: 'address' },
    { indexed: true, name: 'variant', type: 'uint8' },
    { indexed: false, name: 'name', type: 'string' },
    { indexed: false, name: 'symbol', type: 'string' },
    { indexed: false, name: 'decimals', type: 'uint8' },
    { indexed: false, name: 'variantEventParams', type: 'bytes' },
  ],
} as const

type SwapTx = { to: `0x${string}`; router: `0x${string}`; data: `0x${string}`; value: string; amountOut: bigint; needsApprove: boolean }

type Tok = { token: `0x${string}`; name: string; symbol: string; variant: number; block: bigint }
type Mkt = { price: number; vol24: number; fdv: number; change24: number; liq: number; img?: string; pair?: string }

function fmtUsd(n: number) {
  if (!n) return '-'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  if (n >= 1) return `$${n.toFixed(2)}`
  return `$${n.toPrecision(3)}`
}

// Token amount: keep small amounts meaningful (0.0000333 shows, not "0").
function fmtTok(n: number) {
  if (!n) return '0'
  if (n >= 1000) return n.toLocaleString('en', { maximumFractionDigits: 2 })
  if (n >= 1) return n.toLocaleString('en', { maximumFractionDigits: 4 })
  return Number(n.toPrecision(4)).toString() // 4 significant figures, trimmed
}

function TokenLogo({ img, symbol, size = 30 }: { img?: string; symbol: string; size?: number }) {
  const [err, setErr] = useState(false)
  const s = { width: size, height: size }
  if (img && !err) return <img src={img} alt={symbol} onError={() => setErr(true)} style={s} className="rounded-full object-cover flex-shrink-0 bg-[#F0F2F5]" />
  return <div style={s} className="rounded-full bg-gradient-to-br from-[#0052FF] to-[#7B61FF] flex items-center justify-center text-white font-black flex-shrink-0" ><span style={{ fontSize: size * 0.32 }}>{symbol.slice(0, 3)}</span></div>
}

export default function Launchpad() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const { sendTransactionAsync } = useSendTransaction()
  const { watchAssetAsync } = useWatchAsset()

  const [toks, setToks] = useState<Tok[]>([])
  const [mkt, setMkt] = useState<Record<string, Mkt>>({})
  const [loading, setLoading] = useState(true)
  const [loadingMkt, setLoadingMkt] = useState(false)
  const [q, setQ] = useState('')
  const [sortKey, setSortKey] = useState<'vol24' | 'fdv' | 'price' | 'change24'>('vol24')
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc')
  const toggleSort = (k: 'vol24' | 'fdv' | 'price' | 'change24') => {
    if (sortKey === k) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(k); setSortDir('desc') }
  }

  // discover every B20 from the factory (chunked — public RPCs reject wide ranges)
  const loadToks = useCallback(async () => {
    if (!publicClient) return
    setLoading(true)
    try {
      const latest = await publicClient.getBlockNumber()
      const CHUNK = 9000n, MAX_BACK = 800_000n
      const start = latest > MAX_BACK ? latest - MAX_BACK : 0n
      const ranges: [bigint, bigint][] = []
      for (let f = start; f <= latest; f += CHUNK + 1n) ranges.push([f, f + CHUNK > latest ? latest : f + CHUNK])
      const seen = new Set<string>(); const rows: Tok[] = []
      for (let i = 0; i < ranges.length; i += 16) {
        const res = await Promise.all(ranges.slice(i, i + 16).map(([f, t]) =>
          publicClient.getLogs({ address: FACTORY, event: B20_CREATED, fromBlock: f, toBlock: t }).catch(() => [])))
        for (const logs of res) for (const l of logs as { blockNumber?: bigint; args?: { token?: `0x${string}`; name?: string; symbol?: string; variant?: number } }[]) {
          const a = l.args?.token?.toLowerCase(); if (!a || seen.has(a)) continue; seen.add(a)
          rows.push({ token: l.args!.token!, name: l.args?.name || 'B20', symbol: l.args?.symbol || '???', variant: Number(l.args?.variant ?? 0), block: l.blockNumber ?? 0n })
        }
        rows.sort((a, b) => (b.block > a.block ? 1 : -1))
        setToks([...rows]) // stream in
      }
      loadMkt(rows.map(r => r.token))
    } catch { /* ignore */ }
    setLoading(false)
  }, [publicClient]) // eslint-disable-line react-hooks/exhaustive-deps

  // live market data from DexScreener — parallel batches so it fills in fast.
  // Only tokens with a real pool come back; we keep the most-liquid pair per token.
  const loadMkt = useCallback(async (addrs: `0x${string}`[]) => {
    setLoadingMkt(true)
    const out: Record<string, Mkt> = {}
    const chunks: `0x${string}`[][] = []
    for (let i = 0; i < addrs.length; i += 30) chunks.push(addrs.slice(i, i + 30))
    const CONC = 12
    for (let i = 0; i < chunks.length; i += CONC) {
      await Promise.all(chunks.slice(i, i + CONC).map(async chunk => {
        try {
          const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${chunk.join(',')}`)
          const d = await r.json()
          for (const p of (d?.pairs || []) as Record<string, unknown>[]) {
            if (p.chainId !== 'base') continue
            const bt = p.baseToken as { address?: string } | undefined
            const a = bt?.address?.toLowerCase(); if (!a) continue
            const liq = Number((p.liquidity as { usd?: number })?.usd || 0)
            if (out[a] && out[a].liq >= liq) continue
            out[a] = {
              price: Number(p.priceUsd || 0),
              vol24: Number((p.volume as { h24?: number })?.h24 || 0),
              fdv: Number(p.fdv || 0),
              change24: Number((p.priceChange as { h24?: number })?.h24 ?? 0),
              liq,
              img: (p.info as { imageUrl?: string } | undefined)?.imageUrl,
              pair: typeof p.pairAddress === 'string' ? p.pairAddress : undefined,
            }
          }
        } catch { /* rate limit / offline — skip */ }
      }))
      setMkt({ ...out }) // progressive fill
    }
    setLoadingMkt(false)
  }, [])

  useEffect(() => { loadToks() }, [loadToks])

  // filter + sort: tokens with volume first (desc), then rest
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const filtered = needle
      ? toks.filter(t => t.name.toLowerCase().includes(needle) || t.symbol.toLowerCase().includes(needle) || t.token.toLowerCase().includes(needle))
      : toks
    const val = (t: Tok) => { const m = mkt[t.token.toLowerCase()]; return m ? (m[sortKey] || 0) : -1 }
    return [...filtered].sort((a, b) => (sortDir === 'desc' ? val(b) - val(a) : val(a) - val(b)))
  }, [toks, mkt, q, sortKey, sortDir])

  const tradeable = useMemo(() => Object.keys(mkt).length, [mkt])

  // ── detail view ──
  const [detail, setDetail] = useState<Tok | null>(null)

  // ── trade modal ──
  const [active, setActive] = useState<Tok | null>(null)
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<SwapTx | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [bal, setBal] = useState<bigint>(0n)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; t: string } | null>(null)
  const [bought, setBought] = useState(false) // show "add token to wallet" after a buy

  // Ask the aggregator (all Base DEXs) for a route + executable tx.
  const fetchSwap = useCallback(async (tokenIn: string, tokenOut: string, amountIn: bigint): Promise<SwapTx | null> => {
    if (!address) return null
    const r = await fetch('/api/swap', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tokenIn, tokenOut, amountIn: amountIn.toString(), sender: address, recipient: address, slippageBps: 1000 }),
    })
    const d = await r.json()
    if (!r.ok || !d?.to) return null
    return { to: d.to, router: d.router, data: d.data, value: d.value, amountOut: BigInt(d.amountOut || '0'), needsApprove: !!d.needsApprove }
  }, [address])

  // debounced live quote
  useEffect(() => {
    let stop = false
    if (!active || !amount || Number(amount) <= 0) { setQuote(null); setQuoting(false); return }
    setQuoting(true)
    const id = setTimeout(async () => {
      try {
        const amt = parseEther(amount)
        const res = side === 'buy' ? await fetchSwap(NATIVE, active.token, amt) : await fetchSwap(active.token, NATIVE, amt)
        if (!stop) setQuote(res)
      } catch { if (!stop) setQuote(null) }
      if (!stop) setQuoting(false)
    }, 550)
    return () => { stop = true; clearTimeout(id) }
  }, [active, amount, side, fetchSwap])

  useEffect(() => {
    const run = async () => {
      if (!active || !publicClient || !address) { setBal(0n); return }
      try { setBal(await publicClient.readContract({ address: active.token, abi: erc20Abi, functionName: 'balanceOf', args: [address] }) as bigint) } catch { setBal(0n) }
    }
    run()
  }, [active, address, publicClient, busy])

  const openTrade = (t: Tok, s: 'buy' | 'sell') => { setActive(t); setSide(s); setAmount(''); setQuote(null); setNote(null); setBought(false) }

  const addToWallet = async () => {
    if (!active) return
    try { await watchAssetAsync({ type: 'ERC20', options: { address: active.token, symbol: active.symbol.slice(0, 11) || 'B20', decimals: 18 } }) } catch { /* user declined */ }
  }

  const doTrade = async () => {
    if (!active || !isConnected || !publicClient || !amount || Number(amount) <= 0 || !quote || busy) return
    setBusy(true); setNote(null)
    try {
      // sell: approve the aggregator router to pull the token first
      if (side === 'sell' && quote.needsApprove) {
        const amt = parseEther(amount)
        const allowance = await publicClient.readContract({ address: active.token, abi: erc20Abi, functionName: 'allowance', args: [address!, quote.router] }) as bigint
        if (allowance < amt) {
          await writeContractAsync({ chainId: base.id, address: active.token, abi: erc20Abi, functionName: 'approve', args: [quote.router, amt] })
        }
      }
      await sendTransactionAsync({ chainId: base.id, to: quote.to, data: quote.data, value: BigInt(quote.value || '0') })
      setNote({ ok: true, t: `${side === 'buy' ? 'Bought' : 'Sold'} ✓ — check your wallet` }); setAmount(''); setQuote(null)
      if (side === 'buy') setBought(true)
    } catch (e) {
      const m = e instanceof Error ? (e.message || String(e)) : String(e)
      const short = m.split('\n')[0].slice(0, 140)
      setNote({ ok: false, t: /reject|denied|rejected/i.test(m) ? 'Cancelled in wallet.' : /insufficient funds|exceeds balance/i.test(m) ? 'Not enough ETH/balance.' : short })
    }
    setBusy(false)
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="font-black text-[#0A0B0D] text-lg flex items-center gap-2">🚀 B20 DEX</h2>
        <p className="text-xs text-[#5B6271] mt-0.5">Every B20 token on Base — buy &amp; sell right here.</p>
      </div>

      {/* search */}
      <div className="flex items-center gap-2 bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-3 py-2.5 focus-within:border-[#0052FF]">
        <span className="text-[#8A919E]">🔍</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, symbol or address…" className="flex-1 bg-transparent text-sm focus:outline-none" />
        <button onClick={() => { loadToks() }} className="text-xs text-[#0052FF] font-bold">Refresh</button>
      </div>

      <p className="text-[11px] text-[#8A919E]">
        {loading ? 'Scanning Base…' : `${toks.length.toLocaleString('en')} B20 tokens`}{tradeable > 0 && ` · ${tradeable} tradeable`}{loadingMkt && ' · loading prices…'}
      </p>

      {/* table */}
      <div className="border border-[#EEF1F5] rounded-2xl overflow-hidden">
        <table className="w-full text-sm table-fixed">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-[#8A919E] bg-[#FAFBFD] border-b border-[#EEF1F5]">
              <th className="text-left font-semibold py-2.5 pl-3">Token</th>
              {([['price', 'Price', 'w-[84px]'], ['change24', '24h', 'w-[62px]'], ['vol24', 'Volume', 'w-[78px] hidden sm:table-cell'], ['fdv', 'FDV', 'w-[70px] hidden md:table-cell']] as const).map(([k, label, cls]) => (
                <th key={k} onClick={() => toggleSort(k)} className={`text-right font-semibold py-2.5 px-2 cursor-pointer select-none hover:text-[#0052FF] ${cls} ${sortKey === k ? 'text-[#0052FF]' : ''}`}>
                  {label}{sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
              <th className="w-[30px] pr-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading && toks.length === 0 && [...Array(8)].map((_, i) => (
              <tr key={i}><td colSpan={6} className="p-2"><div className="h-8 bg-[#F5F7FA] rounded-lg animate-pulse" /></td></tr>
            ))}
            {rows.slice(0, 150).map((t, i) => {
              const m = mkt[t.token.toLowerCase()]
              const up = (m?.change24 ?? 0) >= 0
              const canTrade = !!m
              return (
                <tr key={t.token} onClick={() => canTrade && setDetail(t)} className={`border-b border-[#F5F7FA] last:border-0 transition-colors ${canTrade ? 'cursor-pointer hover:bg-[#F0F4FF]' : ''}`}>
                  <td className="py-2 pl-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[10px] text-[#C5CBD3] w-3.5 text-right flex-shrink-0">{i + 1}</span>
                      <TokenLogo img={m?.img} symbol={t.symbol} size={30} />
                      <div className="min-w-0">
                        <div className="font-bold text-[#0A0B0D] text-[13px] truncate">{t.name}</div>
                        <div className="text-[10px] text-[#8A919E] truncate">${t.symbol}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-right px-2 font-mono text-[12px] text-[#0A0B0D]">{m?.price ? fmtUsd(m.price) : '·'}</td>
                  <td className={`text-right px-2 text-[12px] font-bold ${!m ? 'text-[#C5CBD3]' : up ? 'text-green-600' : 'text-red-500'}`}>{m ? `${Math.abs(m.change24) < 0.05 ? '' : up ? '▲' : '▼'} ${Math.abs(m.change24).toFixed(1)}%` : '·'}</td>
                  <td className="text-right px-2 text-[12px] text-[#5B6271] hidden sm:table-cell">{m?.vol24 ? fmtUsd(m.vol24) : '·'}</td>
                  <td className="text-right px-2 text-[12px] text-[#5B6271] hidden md:table-cell">{m?.fdv ? fmtUsd(m.fdv) : '·'}</td>
                  <td className="text-right pr-3">
                    {canTrade
                      ? <span className="text-[#C5CBD3] text-lg leading-none">›</span>
                      : <a href={`https://basescan.org/token/${t.token}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-[11px] text-[#B0B7C3] font-bold hover:text-[#0052FF]">↗</a>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <p className="text-sm text-[#8A919E] text-center py-8">No matches.</p>}
      </div>
      {rows.length > 150 && <p className="text-[10px] text-[#C5CBD3] text-center">Showing top 150 — use search to find more.</p>}

      <p className="text-[10px] text-[#C5CBD3] text-center">Trades route across all Base DEXs (Aerodrome, Uniswap V2–V4) and settle on-chain into your wallet. Only spend what you can afford to lose.</p>

      {/* token detail (chart + stats) */}
      {detail && (() => {
        const m = mkt[detail.token.toLowerCase()]
        const up = (m?.change24 ?? 0) >= 0
        const stats: [string, string][] = [
          ['Price', m?.price ? fmtUsd(m.price) : '-'],
          ['24h', m ? `${up ? '▲' : '▼'} ${Math.abs(m.change24).toFixed(1)}%` : '-'],
          ['Volume 24h', m?.vol24 ? fmtUsd(m.vol24) : '-'],
          ['Liquidity', m?.liq ? fmtUsd(m.liq) : '-'],
          ['FDV', m?.fdv ? fmtUsd(m.fdv) : '-'],
          ['Variant', detail.variant === 1 ? 'Stablecoin' : 'Asset'],
        ]
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-stretch sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setDetail(null)}>
            <div className="bg-white sm:rounded-3xl w-full max-w-lg h-[100dvh] sm:h-auto sm:max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
              {/* header */}
              <div className="flex items-center gap-3 p-4 border-b border-[#F0F2F5] sticky top-0 bg-white z-10">
                <TokenLogo img={m?.img} symbol={detail.symbol} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="font-black text-[#0A0B0D] truncate">{detail.name}</div>
                  <div className="text-xs text-[#8A919E]">${detail.symbol}</div>
                </div>
                <div className="text-right">
                  <div className="font-black text-[#0A0B0D]">{m?.price ? fmtUsd(m.price) : '-'}</div>
                  <div className={`text-xs font-bold ${up ? 'text-green-600' : 'text-red-500'}`}>{m ? `${up ? '▲' : '▼'} ${Math.abs(m.change24).toFixed(1)}%` : ''}</div>
                </div>
                <button onClick={() => setDetail(null)} className="text-[#8A919E] hover:text-[#0A0B0D] text-xl leading-none ml-1">✕</button>
              </div>

              {/* candlestick chart via DexScreener embed */}
              {m?.pair ? (
                <div className="w-full h-[44vh] sm:h-[360px] overflow-hidden bg-[#FAFBFD]">
                  <iframe
                    title="chart"
                    src={`https://dexscreener.com/base/${m.pair}?embed=1&theme=light&info=0&trades=0&chartTheme=light&chartStyle=1&interval=15`}
                    className="w-full h-[calc(44vh+38px)] sm:h-[398px] border-0"
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="h-[160px] flex items-center justify-center text-sm text-[#8A919E]">No chart — this token has no indexed pool yet.</div>
              )}

              {/* stats */}
              <div className="grid grid-cols-3 gap-2 p-4">
                {stats.map(([k, v]) => (
                  <div key={k} className="bg-[#F7F9FC] rounded-xl px-3 py-2">
                    <p className="text-[10px] text-[#8A919E] uppercase tracking-wide">{k}</p>
                    <p className="text-sm font-bold text-[#0A0B0D] truncate">{v}</p>
                  </div>
                ))}
              </div>

              {/* actions */}
              <div className="flex gap-2 px-4 pb-4">
                <button onClick={() => { const d = detail; setDetail(null); openTrade(d, 'buy') }} className="flex-1 bg-[#0052FF] hover:bg-[#1652F0] text-white font-black py-3 rounded-2xl transition-colors">Buy</button>
                <button onClick={() => { const d = detail; setDetail(null); openTrade(d, 'sell') }} className="flex-1 bg-[#0A0B0D] hover:bg-black text-white font-black py-3 rounded-2xl transition-colors">Sell</button>
              </div>
              <a href={`https://basescan.org/token/${detail.token}`} target="_blank" rel="noopener noreferrer" className="block text-center text-[11px] text-[#8A919E] pb-4 hover:text-[#0052FF]">View contract on Basescan ↗</a>
            </div>
          </div>
        )
      })()}

      {/* trade modal */}
      {active && (() => {
        const m = mkt[active.token.toLowerCase()]
        const quick = side === 'buy' ? ['0.005', '0.01', '0.05', '0.1'] : null
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-3" onClick={() => setActive(null)}>
            <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
              {/* header */}
              <div className="flex items-center gap-3 mb-4">
                <TokenLogo img={m?.img} symbol={active.symbol} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="font-black text-[#0A0B0D] truncate">{active.name}</div>
                  <div className="text-xs text-[#8A919E]">${active.symbol}{m?.price ? ` · ${fmtUsd(m.price)}` : ''}</div>
                </div>
                <button onClick={() => setActive(null)} className="text-[#8A919E] hover:text-[#0A0B0D] text-xl leading-none">✕</button>
              </div>

              {/* buy / sell toggle */}
              <div className="flex gap-1 bg-[#F0F2F5] rounded-xl p-1 mb-3">
                <button onClick={() => { setSide('buy'); setAmount(''); setQuote(null); setNote(null) }} className={`flex-1 text-sm font-black py-2 rounded-lg transition-colors ${side === 'buy' ? 'bg-white text-[#0052FF] shadow-sm' : 'text-[#8A919E]'}`}>Buy</button>
                <button onClick={() => { setSide('sell'); setAmount(''); setQuote(null); setNote(null) }} className={`flex-1 text-sm font-black py-2 rounded-lg transition-colors ${side === 'sell' ? 'bg-white text-[#0052FF] shadow-sm' : 'text-[#8A919E]'}`}>Sell</button>
              </div>

              {/* amount */}
              <div className="bg-[#F7F9FC] border border-[#E4E7EB] rounded-2xl px-4 py-3 focus-within:border-[#0052FF]">
                <div className="flex items-center justify-between">
                  <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0" step={side === 'buy' ? '0.001' : '1'} placeholder="0"
                    className="w-full bg-transparent text-2xl font-black focus:outline-none" />
                  <span className="font-bold text-[#5B6271] text-sm flex-shrink-0 ml-2">{side === 'buy' ? 'ETH' : active.symbol}</span>
                </div>
              </div>

              {/* quick amounts */}
              <div className="flex gap-1.5 mt-2">
                {side === 'buy'
                  ? quick!.map(v => <button key={v} onClick={() => setAmount(v)} className="flex-1 text-xs font-bold bg-[#F0F4FF] text-[#0052FF] rounded-lg py-1.5 hover:bg-[#E6EEFF]">{v}</button>)
                  : [['25%', 0.25], ['50%', 0.5], ['Max', 1]].map(([lbl, f]) => <button key={lbl as string} onClick={() => setAmount(formatEther(BigInt(Math.floor(Number(bal) * (f as number)))))} className="flex-1 text-xs font-bold bg-[#F0F4FF] text-[#0052FF] rounded-lg py-1.5 hover:bg-[#E6EEFF]">{lbl}</button>)}
              </div>

              {side === 'sell' && <p className="text-[11px] text-[#8A919E] mt-2">Balance: {fmtTok(Number(formatEther(bal)))} {active.symbol}</p>}

              {/* quote */}
              {quote && Number(amount) > 0 && (
                <div className="mt-3 bg-[#F0F4FF] rounded-2xl px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-[#5B6271]">You receive →</span>
                  <span className="font-black text-[#0A0B0D] text-right">{side === 'buy' ? `${fmtTok(Number(formatEther(quote.amountOut)))} ${active.symbol}` : `${fmtTok(Number(formatEther(quote.amountOut)))} ETH`}</span>
                </div>
              )}

              {note && <div className={`text-sm rounded-xl px-3 py-2 mt-3 ${note.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{note.t}</div>}

              {bought && (
                <button onClick={addToWallet} className="w-full mt-3 bg-[#F0F4FF] text-[#0052FF] font-bold text-sm py-2.5 rounded-xl hover:bg-[#E6EEFF]">
                  ➕ Add {active.symbol} to your wallet
                </button>
              )}

              <button onClick={doTrade} disabled={!isConnected || busy || quoting || !amount || Number(amount) <= 0 || !quote}
                className={`w-full mt-4 text-white font-black text-base py-3.5 rounded-2xl transition-colors disabled:opacity-50 ${side === 'buy' ? 'bg-[#0052FF] hover:bg-[#1652F0]' : 'bg-[#0A0B0D] hover:bg-black'}`}>
                {busy ? 'Confirm in wallet…' : !isConnected ? 'Connect wallet' : quoting && Number(amount) > 0 ? 'Finding best price…' : !quote && Number(amount) > 0 ? 'No liquidity for this token' : side === 'buy' ? `Buy ${active.symbol}` : `Sell ${active.symbol}`}
              </button>
              <p className="text-[10px] text-[#C5CBD3] text-center mt-2">Goes straight to your wallet · 10% max slippage · 1% platform fee · best route across Base DEXs</p>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
