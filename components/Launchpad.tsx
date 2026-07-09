'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { erc20Abi, encodeFunctionData, formatEther, parseEther } from 'viem'
import { base } from 'wagmi/chains'

/*
  B20 DEX — a Uniswap-Explore-style table of every B20 token on Base, with
  in-site buy/sell routed through Uniswap V3 (same router/quoter the app already
  uses for ETH↔USDC). Tokens are discovered from the B20 factory's B20Created
  event; live price/volume/FDV come from DexScreener for the ones with a pool.
*/

const WETH = '0x4200000000000000000000000000000000000006' as const
const SWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481' as const
const QUOTER = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as const
const FEE_TIERS = [500, 3000, 10000] as const
const FACTORY = '0xB20f000000000000000000000000000000000000' as const
const SLIPPAGE_BPS = 300n // 3%

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

const QUOTER_ABI = [{
  type: 'function', name: 'quoteExactInputSingle', stateMutability: 'nonpayable',
  inputs: [{ name: 'params', type: 'tuple', components: [
    { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' },
    { name: 'amountIn', type: 'uint256' }, { name: 'fee', type: 'uint24' },
    { name: 'sqrtPriceLimitX96', type: 'uint160' },
  ] }],
  outputs: [{ name: 'amountOut', type: 'uint256' }, { name: 'a', type: 'uint160' }, { name: 'b', type: 'uint32' }, { name: 'c', type: 'uint256' }],
}] as const

const ROUTER_ABI = [
  { type: 'function', name: 'exactInputSingle', stateMutability: 'payable', inputs: [{ name: 'params', type: 'tuple', components: [
    { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' }, { name: 'fee', type: 'uint24' },
    { name: 'recipient', type: 'address' }, { name: 'amountIn', type: 'uint256' }, { name: 'amountOutMinimum', type: 'uint256' }, { name: 'sqrtPriceLimitX96', type: 'uint160' },
  ] }], outputs: [{ name: 'amountOut', type: 'uint256' }] },
  { type: 'function', name: 'unwrapWETH9', stateMutability: 'payable', inputs: [{ name: 'amountMinimum', type: 'uint256' }, { name: 'recipient', type: 'address' }], outputs: [] },
  { type: 'function', name: 'multicall', stateMutability: 'payable', inputs: [{ name: 'data', type: 'bytes[]' }], outputs: [{ name: '', type: 'bytes[]' }] },
] as const

type Tok = { token: `0x${string}`; name: string; symbol: string; variant: number; block: bigint }
type Mkt = { price: number; vol24: number; fdv: number; change24: number; liq: number }

function fmtUsd(n: number) {
  if (!n) return '-'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`
  if (n >= 1) return `$${n.toFixed(2)}`
  return `$${n.toPrecision(3)}`
}

export default function Launchpad() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [toks, setToks] = useState<Tok[]>([])
  const [mkt, setMkt] = useState<Record<string, Mkt>>({})
  const [loading, setLoading] = useState(true)
  const [loadingMkt, setLoadingMkt] = useState(false)
  const [q, setQ] = useState('')

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
      for (let i = 0; i < ranges.length; i += 10) {
        const res = await Promise.all(ranges.slice(i, i + 10).map(([f, t]) =>
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

  // live market data from DexScreener (only tokens with a pool return anything)
  const loadMkt = useCallback(async (addrs: `0x${string}`[]) => {
    setLoadingMkt(true)
    const out: Record<string, Mkt> = {}
    for (let i = 0; i < addrs.length; i += 30) {
      const chunk = addrs.slice(i, i + 30)
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
          }
        }
        setMkt({ ...out })
      } catch { /* rate limit / offline — skip */ }
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
    return [...filtered].sort((a, b) => (mkt[b.token.toLowerCase()]?.vol24 || 0) - (mkt[a.token.toLowerCase()]?.vol24 || 0))
  }, [toks, mkt, q])

  const tradeable = useMemo(() => Object.values(mkt).filter(m => m.liq > 0).length, [mkt])

  // ── trade modal ──
  const [active, setActive] = useState<Tok | null>(null)
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<{ out: bigint; fee: number } | null>(null)
  const [bal, setBal] = useState<bigint>(0n)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; t: string } | null>(null)

  const bestQuote = useCallback(async (tokenIn: `0x${string}`, tokenOut: `0x${string}`, amountIn: bigint) => {
    if (!publicClient) return null
    let best: { out: bigint; fee: number } | null = null
    for (const fee of FEE_TIERS) {
      try {
        const res = await publicClient.readContract({ address: QUOTER, abi: QUOTER_ABI, functionName: 'quoteExactInputSingle', args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }] }) as readonly [bigint, bigint, number, bigint]
        if (!best || res[0] > best.out) best = { out: res[0], fee }
      } catch { /* no pool at this tier */ }
    }
    return best
  }, [publicClient])

  useEffect(() => {
    let stop = false
    const run = async () => {
      if (!active || !amount || Number(amount) <= 0) { setQuote(null); return }
      const amt = parseEther(amount)
      const res = side === 'buy'
        ? await bestQuote(WETH, active.token, amt)
        : await bestQuote(active.token, WETH, amt)
      if (!stop) setQuote(res)
    }
    run(); return () => { stop = true }
  }, [active, amount, side, bestQuote])

  useEffect(() => {
    const run = async () => {
      if (!active || !publicClient || !address) { setBal(0n); return }
      try { setBal(await publicClient.readContract({ address: active.token, abi: erc20Abi, functionName: 'balanceOf', args: [address] }) as bigint) } catch { setBal(0n) }
    }
    run()
  }, [active, address, publicClient, busy])

  const openTrade = (t: Tok, s: 'buy' | 'sell') => { setActive(t); setSide(s); setAmount(''); setQuote(null); setNote(null) }

  const doTrade = async () => {
    if (!active || !isConnected || !publicClient || !amount || Number(amount) <= 0 || !quote || busy) return
    setBusy(true); setNote(null)
    try {
      const amt = parseEther(amount)
      const minOut = quote.out - (quote.out * SLIPPAGE_BPS) / 10000n
      if (side === 'buy') {
        await writeContractAsync({ chainId: base.id, address: SWAP_ROUTER, abi: ROUTER_ABI, functionName: 'exactInputSingle',
          args: [{ tokenIn: WETH, tokenOut: active.token, fee: quote.fee, recipient: address!, amountIn: amt, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }], value: amt })
      } else {
        const allowance = await publicClient.readContract({ address: active.token, abi: erc20Abi, functionName: 'allowance', args: [address!, SWAP_ROUTER] }) as bigint
        if (allowance < amt) await writeContractAsync({ chainId: base.id, address: active.token, abi: erc20Abi, functionName: 'approve', args: [SWAP_ROUTER, amt] })
        const swap = encodeFunctionData({ abi: ROUTER_ABI, functionName: 'exactInputSingle', args: [{ tokenIn: active.token, tokenOut: WETH, fee: quote.fee, recipient: SWAP_ROUTER, amountIn: amt, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n }] })
        const unwrap = encodeFunctionData({ abi: ROUTER_ABI, functionName: 'unwrapWETH9', args: [minOut, address!] })
        await writeContractAsync({ chainId: base.id, address: SWAP_ROUTER, abi: ROUTER_ABI, functionName: 'multicall', args: [[swap, unwrap]] })
      }
      setNote({ ok: true, t: `${side === 'buy' ? 'Bought' : 'Sold'} ✓` }); setAmount(''); setQuote(null)
    } catch (e) {
      const m = e instanceof Error ? e.message : ''
      setNote({ ok: false, t: /reject|denied/i.test(m) ? 'Cancelled in wallet.' : /insufficient|exceeds|balance/i.test(m) ? 'Not enough balance.' : 'Trade failed — this token may have no pool.' })
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide text-[#8A919E] border-b border-[#EEF1F5]">
              <th className="text-left font-semibold py-2 pl-1">Token</th>
              <th className="text-right font-semibold py-2 px-2">Price</th>
              <th className="text-right font-semibold py-2 px-2 hidden sm:table-cell">24h</th>
              <th className="text-right font-semibold py-2 px-2 hidden sm:table-cell">Volume</th>
              <th className="text-right font-semibold py-2 px-2 hidden md:table-cell">FDV</th>
              <th className="py-2 pr-1"></th>
            </tr>
          </thead>
          <tbody>
            {loading && toks.length === 0 && [...Array(6)].map((_, i) => (
              <tr key={i}><td colSpan={6} className="py-2"><div className="h-9 bg-[#F0F2F5] rounded-lg animate-pulse" /></td></tr>
            ))}
            {rows.slice(0, 200).map((t, i) => {
              const m = mkt[t.token.toLowerCase()]
              const up = (m?.change24 ?? 0) >= 0
              return (
                <tr key={t.token} className="border-b border-[#F5F7FA] hover:bg-[#FAFBFD]">
                  <td className="py-2.5 pl-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-[#C5CBD3] w-4 text-right">{i + 1}</span>
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#0052FF] to-[#7B61FF] flex items-center justify-center text-white font-black text-[9px] flex-shrink-0">{t.symbol.slice(0, 3)}</div>
                      <div className="min-w-0">
                        <div className="font-bold text-[#0A0B0D] text-[13px] truncate max-w-[130px]">{t.name}</div>
                        <div className="text-[10px] text-[#8A919E]">${t.symbol}</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-right px-2 font-mono text-[12px]">{m?.price ? fmtUsd(m.price) : '-'}</td>
                  <td className={`text-right px-2 text-[12px] font-semibold hidden sm:table-cell ${!m ? 'text-[#C5CBD3]' : up ? 'text-green-600' : 'text-red-500'}`}>{m ? `${up ? '▲' : '▼'} ${Math.abs(m.change24).toFixed(1)}%` : '-'}</td>
                  <td className="text-right px-2 text-[12px] hidden sm:table-cell">{m?.vol24 ? fmtUsd(m.vol24) : '-'}</td>
                  <td className="text-right px-2 text-[12px] hidden md:table-cell">{m?.fdv ? fmtUsd(m.fdv) : '-'}</td>
                  <td className="text-right pr-1">
                    {m?.liq ? (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openTrade(t, 'buy')} className="bg-[#0052FF] text-white text-[11px] font-bold px-2.5 py-1 rounded-lg">Buy</button>
                        <button onClick={() => openTrade(t, 'sell')} className="bg-[#F0F2F5] text-[#5B6271] text-[11px] font-bold px-2.5 py-1 rounded-lg">Sell</button>
                      </div>
                    ) : (
                      <a href={`https://basescan.org/token/${t.token}`} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#8A919E] font-bold">View ↗</a>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!loading && rows.length === 0 && <p className="text-sm text-[#8A919E] text-center py-6">No matches.</p>}
        {rows.length > 200 && <p className="text-[10px] text-[#C5CBD3] text-center mt-2">Showing top 200 — search to narrow down.</p>}
      </div>

      <p className="text-[10px] text-[#C5CBD3] text-center">Trades route through Uniswap V3 on Base. Tokens without a pool show “View”. Only spend what you can afford to lose.</p>

      {/* trade modal */}
      {active && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setActive(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-black text-[#0A0B0D]">{active.name} <span className="text-[#8A919E] font-bold">${active.symbol}</span></span>
              <button onClick={() => setActive(null)} className="text-[#8A919E] font-bold">✕</button>
            </div>
            <div className="flex gap-1 bg-[#F0F2F5] rounded-lg p-1 mb-3">
              <button onClick={() => { setSide('buy'); setAmount(''); setQuote(null) }} className={`flex-1 text-sm font-bold py-1.5 rounded-md ${side === 'buy' ? 'bg-white text-[#0052FF] shadow-sm' : 'text-[#8A919E]'}`}>Buy</button>
              <button onClick={() => { setSide('sell'); setAmount(''); setQuote(null) }} className={`flex-1 text-sm font-bold py-1.5 rounded-md ${side === 'sell' ? 'bg-white text-[#0052FF] shadow-sm' : 'text-[#8A919E]'}`}>Sell</button>
            </div>
            <input value={amount} onChange={e => setAmount(e.target.value)} type="number" min="0" step={side === 'buy' ? '0.001' : '1000'}
              placeholder={side === 'buy' ? 'ETH amount' : `${active.symbol} amount`}
              className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#0052FF]" />
            {side === 'sell' && (
              <p className="text-[11px] text-[#8A919E] mt-1">Balance: {Number(formatEther(bal)).toLocaleString('en', { maximumFractionDigits: 0 })} {active.symbol}
                <button onClick={() => setAmount(formatEther(bal))} className="ml-1 text-[#0052FF] font-bold">Max</button></p>
            )}
            {quote && Number(amount) > 0 && (
              <p className="text-sm text-[#0A0B0D] mt-2 bg-[#F0F4FF] rounded-lg px-3 py-2">≈ You get <b>{side === 'buy' ? `${Number(formatEther(quote.out)).toLocaleString('en', { maximumFractionDigits: 0 })} ${active.symbol}` : `${Number(formatEther(quote.out)).toFixed(6)} ETH`}</b><span className="text-[11px] text-[#8A919E] block">3% max slippage · Uniswap V3</span></p>
            )}
            {note && <div className={`text-sm rounded-xl px-3 py-2 mt-2 ${note.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{note.t}</div>}
            <button onClick={doTrade} disabled={!isConnected || busy || !amount || Number(amount) <= 0 || !quote}
              className="w-full mt-3 bg-[#0052FF] text-white font-black text-sm py-2.5 rounded-xl disabled:opacity-50">
              {busy ? 'Processing…' : !quote && Number(amount) > 0 ? 'No pool for this amount' : side === 'buy' ? `Buy ${active.symbol}` : `Sell ${active.symbol}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
