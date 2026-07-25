'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, usePublicClient, useWatchAsset } from 'wagmi'
import { encodeFunctionData, erc20Abi, formatUnits, parseEther, parseUnits } from 'viem'
import { BUILDER_CODE_DATA_SUFFIX } from '../lib/builderCode'
import { useSafeSend } from '../lib/useSafeSend'

/*
  B20 DEX — a Uniswap-Explore-style table of every B20 token on Base, with
  in-site buy/sell. Tokens are discovered from the B20 factory's B20Created
  event; live price/volume/FDV come from DexScreener. Trades are routed by the
  KyberSwap aggregator (server proxy at /api/swap) across ALL Base DEXs —
  Aerodrome, Uniswap V2/V3/V4, etc. — so any token with liquidity is tradeable.
*/

const FACTORY = '0xB20f000000000000000000000000000000000000' as const
const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as const // aggregator native-ETH sentinel
const ADMIN = '0xa77A5D4D37d6F39C20C2441295da9fA60Ab9fD69'.toLowerCase()

// Aerodrome (Base) — used by the admin-only "add liquidity" flow to open a
// market for a token (verified addresses + IRouter.addLiquidityETH signature).
const AERO_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43' as const
const AERO_FACTORY = '0x420DD381b31aEf6683db6B902084cB0FFECe40Da' as const
const WETH = '0x4200000000000000000000000000000000000006' as const
const ROUTE_COMPONENTS = [
  { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
  { name: 'stable', type: 'bool' }, { name: 'factory', type: 'address' },
] as const
const AERO_ROUTER_ABI = [
  {
    type: 'function', name: 'addLiquidityETH', stateMutability: 'payable',
    inputs: [
      { name: 'token', type: 'address' }, { name: 'stable', type: 'bool' },
      { name: 'amountTokenDesired', type: 'uint256' }, { name: 'amountTokenMin', type: 'uint256' },
      { name: 'amountETHMin', type: 'uint256' }, { name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amountToken', type: 'uint256' }, { name: 'amountETH', type: 'uint256' }, { name: 'liquidity', type: 'uint256' }],
  },
  { type: 'function', name: 'getAmountsOut', stateMutability: 'view', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'routes', type: 'tuple[]', components: ROUTE_COMPONENTS }], outputs: [{ name: 'amounts', type: 'uint256[]' }] },
  { type: 'function', name: 'swapExactETHForTokens', stateMutability: 'payable', inputs: [{ name: 'amountOutMin', type: 'uint256' }, { name: 'routes', type: 'tuple[]', components: ROUTE_COMPONENTS }, { name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }], outputs: [{ name: 'amounts', type: 'uint256[]' }] },
  { type: 'function', name: 'swapExactTokensForETH', stateMutability: 'nonpayable', inputs: [{ name: 'amountIn', type: 'uint256' }, { name: 'amountOutMin', type: 'uint256' }, { name: 'routes', type: 'tuple[]', components: ROUTE_COMPONENTS }, { name: 'to', type: 'address' }, { name: 'deadline', type: 'uint256' }], outputs: [{ name: 'amounts', type: 'uint256[]' }] },
] as const

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

type SwapTx = {
  venue: 'kyber' | 'aero'
  amountOut: bigint
  needsApprove: boolean
  // kyber (pre-built aggregator tx):
  to?: `0x${string}`; router?: `0x${string}`; data?: `0x${string}`; value?: string
}

type Tok = { token: `0x${string}`; name: string; symbol: string; variant: number; block: bigint; dec: number }
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

function isAddressLike(s: string) { return /^0x[0-9a-fA-F]{40}$/.test(s.trim()) }

function TokenLogo({ img, symbol, size = 30 }: { img?: string; symbol: string; size?: number }) {
  const [err, setErr] = useState(false)
  const s = { width: size, height: size }
  if (img && !err) return <img src={img} alt={symbol} onError={() => setErr(true)} style={s} className="rounded-full object-cover flex-shrink-0 bg-[#F0F2F5]" />
  return <div style={s} className="rounded-full bg-gradient-to-br from-[#0052FF] to-[#7B61FF] flex items-center justify-center text-white font-black flex-shrink-0" ><span style={{ fontSize: size * 0.32 }}>{symbol.slice(0, 3)}</span></div>
}

export default function Launchpad() {
  const { address, isConnected, connector } = useAccount()
  // Base Builder Code: attribute every DEX tx to FlameBase. Skipped in the
  // Farcaster/Base App mini-app (its preview can't simulate suffixed calldata)
  // — same rule as the main app's tx wrapper.
  const suffixData = (data: `0x${string}`): `0x${string}` =>
    connector?.id === 'farcaster' ? data : ((data + BUILDER_CODE_DATA_SUFFIX.slice(2)) as `0x${string}`)
  const publicClient = usePublicClient()
  const safeSend = useSafeSend()
  const { watchAssetAsync } = useWatchAsset()

  const [toks, setToks] = useState<Tok[]>([])
  const [mkt, setMkt] = useState<Record<string, Mkt>>({})
  const [loading, setLoading] = useState(true)
  const [loadingMkt, setLoadingMkt] = useState(false)
  const [q, setQ] = useState('')
  // Most B20 tokens are brand-new, zero-liquidity spam with no DexScreener
  // data — left unfiltered, they bury the handful of actually-tradeable
  // tokens under thousands of rows of "·". Default to hiding them.
  const [tradeableOnly, setTradeableOnly] = useState(true)
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
        for (const logs of res) for (const l of logs as { blockNumber?: bigint; args?: { token?: `0x${string}`; name?: string; symbol?: string; variant?: number; decimals?: number } }[]) {
          const a = l.args?.token?.toLowerCase(); if (!a || seen.has(a)) continue; seen.add(a)
          const d = Number(l.args?.decimals ?? 18)
          rows.push({ token: l.args!.token!, name: l.args?.name || 'B20', symbol: l.args?.symbol || '???', variant: Number(l.args?.variant ?? 0), block: l.blockNumber ?? 0n, dec: d >= 1 && d <= 18 ? d : 18 })
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

  // filter + sort: tokens with volume first (desc), then rest. A search
  // query always overrides the tradeable-only filter — you can still paste
  // in a brand-new token's address before it has any liquidity/price data.
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let filtered = needle
      ? toks.filter(t => t.name.toLowerCase().includes(needle) || t.symbol.toLowerCase().includes(needle) || t.token.toLowerCase().includes(needle))
      : toks
    if (tradeableOnly && !needle) filtered = filtered.filter(t => mkt[t.token.toLowerCase()])
    const val = (t: Tok) => { const m = mkt[t.token.toLowerCase()]; return m ? (m[sortKey] || 0) : -1 }
    return [...filtered].sort((a, b) => (sortDir === 'desc' ? val(b) - val(a) : val(a) - val(b)))
  }, [toks, mkt, q, sortKey, sortDir, tradeableOnly])

  const tradeable = useMemo(() => Object.keys(mkt).length, [mkt])

  // ── detail view ──
  const [detail, setDetail] = useState<Tok | null>(null)

  // ── trade modal ──
  const [active, setActive] = useState<Tok | null>(null)
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<SwapTx | null>(null)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [bal, setBal] = useState<bigint>(0n)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; t: string } | null>(null)
  const [bought, setBought] = useState(false) // show "add token to wallet" after a buy

  // admin-only "add liquidity" (opens a market for a token via Aerodrome)
  const isAdmin = !!address && address.toLowerCase() === ADMIN
  const [showLiq, setShowLiq] = useState(false)
  const [liqToken, setLiqToken] = useState('')
  const [liqTok, setLiqTok] = useState('')
  const [liqEth, setLiqEth] = useState('')
  const [liqBusy, setLiqBusy] = useState(false)
  const [liqNote, setLiqNote] = useState<{ ok: boolean; t: string } | null>(null)
  const [liqBal, setLiqBal] = useState<{ bal: bigint; dec: number; sym: string } | null>(null)

  // live balance of the pasted token so the admin sees if they actually hold it
  useEffect(() => {
    let stop = false
    if (!isAddressLike(liqToken) || !publicClient || !address) { setLiqBal(null); return }
    const t = liqToken.trim() as `0x${string}`
    ;(async () => {
      try {
        const [bal, dec, sym] = await Promise.all([
          publicClient.readContract({ address: t, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
          publicClient.readContract({ address: t, abi: erc20Abi, functionName: 'decimals' }).catch(() => 18),
          publicClient.readContract({ address: t, abi: erc20Abi, functionName: 'symbol' }).catch(() => ''),
        ])
        if (!stop) setLiqBal({ bal: bal as bigint, dec: Number(dec), sym: String(sym) })
      } catch { if (!stop) setLiqBal(null) }
    })()
    return () => { stop = true }
  }, [liqToken, publicClient, address])

  const addLiquidity = async () => {
    if (!isAddressLike(liqToken) || !liqTok || !liqEth || !address || !publicClient || liqBusy) return
    if (Number(liqTok) <= 0 || Number(liqEth) <= 0) return
    setLiqBusy(true); setLiqNote(null)
    try {
      const token = liqToken.trim() as `0x${string}`
      let dec = 18
      try { dec = Number(await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' })) } catch {}
      const amtTok = parseUnits(liqTok, dec)
      const amtEth = parseEther(liqEth)
      // must actually hold the token
      const bal = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [address] }) as bigint
      if (bal < amtTok) { setLiqNote({ ok: false, t: `You only hold ${fmtTok(Number(formatUnits(bal, dec)))} of this token.` }); setLiqBusy(false); return }
      // approve exact token amount to the router — WAIT for it to confirm before adding
      const allowance = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [address, AERO_ROUTER] }) as bigint
      if (allowance < amtTok) {
        const approveData = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [AERO_ROUTER, amtTok] })
        const approveHash = await safeSend({ to: token, data: suffixData(approveData) })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
      }
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
      const addLiqData = encodeFunctionData({
        abi: AERO_ROUTER_ABI, functionName: 'addLiquidityETH',
        args: [token, false, amtTok, 0n, 0n, address, deadline],
      })
      const hash = await safeSend({ to: AERO_ROUTER, data: suffixData(addLiqData), value: amtEth })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Add-liquidity transaction reverted on-chain — no pool was created.')
      setLiqNote({ ok: true, t: 'Liquidity added ✓ — pool created. Aggregator indexing takes a few minutes before buys route to it.' })
      setLiqTok(''); setLiqEth('')
      setTimeout(loadToks, 4000)
    } catch (e) {
      const m = e instanceof Error ? e.message : ''
      setLiqNote({ ok: false, t: /reject|denied/i.test(m) ? 'Cancelled in wallet.' : /insufficient|exceeds|balance/i.test(m) ? 'Not enough token or ETH balance.' : (m.split('\n')[0].slice(0, 140) || 'Failed — try again.') })
    }
    setLiqBusy(false)
  }

  // Quote a trade: try the KyberSwap aggregator (best price across all Base
  // DEXs); if it has no route yet (e.g. a brand-new Aerodrome pool it hasn't
  // indexed), fall back to routing directly through Aerodrome. Returns the
  // real failure reason on the way out — a blanket "No liquidity" message
  // was hiding whether the aggregator genuinely found no route, or its
  // service call itself failed (network hiccup, rate limit, bad response),
  // which look identical to the user but need very different explanations.
  const fetchSwap = useCallback(async (side: 'buy' | 'sell', token: `0x${string}`, amountIn: bigint): Promise<{ quote: SwapTx | null; reason: string | null }> => {
    if (!address) return { quote: null, reason: 'Connect your wallet first.' }
    const tokenIn = side === 'buy' ? NATIVE : token
    const tokenOut = side === 'buy' ? token : NATIVE
    // 1) KyberSwap
    let kyberReason = ''
    try {
      const r = await fetch('/api/swap', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tokenIn, tokenOut, amountIn: amountIn.toString(), sender: address, recipient: address, slippageBps: 1000 }),
      })
      const d = await r.json()
      if (r.ok && d?.to) return { quote: { venue: 'kyber', to: d.to, router: d.router, data: d.data, value: d.value, amountOut: BigInt(d.amountOut || '0'), needsApprove: !!d.needsApprove }, reason: null }
      kyberReason = typeof d?.error === 'string' && d.error ? d.error : `route service error (${r.status})`
    } catch {
      kyberReason = 'route service unreachable — check your connection'
    }
    // 2) Aerodrome direct (our own pools) — volatile pair with WETH
    if (!publicClient) return { quote: null, reason: kyberReason }
    try {
      const routes = [{ from: (side === 'buy' ? WETH : token), to: (side === 'buy' ? token : WETH), stable: false, factory: AERO_FACTORY }]
      const amounts = await publicClient.readContract({ address: AERO_ROUTER, abi: AERO_ROUTER_ABI, functionName: 'getAmountsOut', args: [amountIn, routes] }) as bigint[]
      const out = amounts?.[amounts.length - 1] ?? 0n
      if (out > 0n) return { quote: { venue: 'aero', amountOut: out, needsApprove: side === 'sell' }, reason: null }
    } catch { /* no aero pool either */ }
    return { quote: null, reason: kyberReason || 'No liquidity route found on any Base DEX.' }
  }, [address, publicClient])

  // debounced live quote
  useEffect(() => {
    let stop = false
    if (!active || !amount || Number(amount) <= 0) { setQuote(null); setQuoteError(null); setQuoting(false); return }
    setQuoting(true)
    const id = setTimeout(async () => {
      try {
        // buy: amountIn is ETH (18 dec); sell: amountIn is the token (its own decimals)
        const amt = side === 'buy' ? parseEther(amount) : parseUnits(amount, active.dec)
        const { quote: res, reason } = await fetchSwap(side, active.token, amt)
        if (!stop) { setQuote(res); setQuoteError(res ? null : reason) }
      } catch { if (!stop) { setQuote(null); setQuoteError('Quote failed — try again.') } }
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
    try { await watchAssetAsync({ type: 'ERC20', options: { address: active.token, symbol: active.symbol.slice(0, 11) || 'B20', decimals: active.dec } }) } catch { /* user declined */ }
  }

  const doTrade = async () => {
    if (!active || !isConnected || !publicClient || !amount || Number(amount) <= 0 || !quote || busy) return
    setBusy(true); setNote(null)
    try {
      const spender = quote.venue === 'aero' ? AERO_ROUTER : quote.router!
      // sell: approve the router to pull the token first (exact amount, token
      // decimals) — WAIT for it to confirm, or transferFrom reverts.
      if (side === 'sell' && quote.needsApprove) {
        const amt = parseUnits(amount, active.dec)
        const allowance = await publicClient.readContract({ address: active.token, abi: erc20Abi, functionName: 'allowance', args: [address!, spender] }) as bigint
        if (allowance < amt) {
          const approveData = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amt] })
          const approveHash = await safeSend({ to: active.token, data: suffixData(approveData) })
          await publicClient.waitForTransactionReceipt({ hash: approveHash })
        }
      }

      if (quote.venue === 'kyber') {
        await safeSend({ to: quote.to!, data: suffixData(quote.data!), value: BigInt(quote.value || '0') })
      } else {
        // Aerodrome direct: our own volatile WETH pool
        const minOut = quote.amountOut - (quote.amountOut * 1000n) / 10000n // 10% slippage
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200)
        const routes = [{ from: (side === 'buy' ? WETH : active.token), to: (side === 'buy' ? active.token : WETH), stable: false, factory: AERO_FACTORY }]
        if (side === 'buy') {
          const swapData = encodeFunctionData({ abi: AERO_ROUTER_ABI, functionName: 'swapExactETHForTokens', args: [minOut, routes, address!, deadline] })
          await safeSend({ to: AERO_ROUTER, data: suffixData(swapData), value: parseEther(amount) })
        } else {
          const swapData = encodeFunctionData({ abi: AERO_ROUTER_ABI, functionName: 'swapExactTokensForETH', args: [parseUnits(amount, active.dec), minOut, routes, address!, deadline] })
          await safeSend({ to: AERO_ROUTER, data: suffixData(swapData) })
        }
      }
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
        <button onClick={() => { loadToks() }} className="text-xs text-[#0052FF] font-bold flex-shrink-0">Refresh</button>
      </div>

      {/* filter chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setTradeableOnly(v => !v)}
          className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${tradeableOnly ? 'bg-[#0052FF] border-[#0052FF] text-white' : 'bg-white border-[#E4E7EB] text-[#5B6271]'}`}>
          {tradeableOnly ? '✓ Tradeable only' : 'Tradeable only'}
        </button>
        {(['vol24', 'change24', 'price', 'fdv'] as const).map(k => (
          <button key={k} onClick={() => toggleSort(k)}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${sortKey === k ? 'bg-[#F0F4FF] border-[#D6E2FF] text-[#0052FF]' : 'bg-white border-[#E4E7EB] text-[#5B6271]'}`}>
            {k === 'vol24' ? 'Volume' : k === 'change24' ? '24h' : k === 'fdv' ? 'FDV' : 'Price'}{sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
          </button>
        ))}
      </div>

      {/* admin: open a market for a token */}
      {isAdmin && (
        <button onClick={() => { setShowLiq(true); setLiqNote(null) }} className="w-full text-xs font-bold text-[#0052FF] bg-[#F0F4FF] border border-[#D6E2FF] rounded-xl py-2 hover:bg-[#E6EEFF]">
          ➕ Add liquidity (admin) — open a market for your token
        </button>
      )}

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
              return (
                <tr key={t.token} onClick={() => setDetail(t)} className="border-b border-[#F5F7FA] last:border-0 transition-colors cursor-pointer hover:bg-[#F0F4FF]">
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
                    <span className="text-[#C5CBD3] text-lg leading-none">›</span>
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

      {/* admin: add-liquidity modal */}
      {showLiq && isAdmin && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[60] p-3" onClick={() => setShowLiq(false)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-5 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-black text-[#0A0B0D]">➕ Add Liquidity</span>
              <button onClick={() => setShowLiq(false)} className="text-[#8A919E] hover:text-[#0A0B0D] text-xl leading-none">✕</button>
            </div>
            <p className="text-[11px] text-[#5B6271] mb-3">Pair your token with ETH to open a market. The token↔ETH ratio you enter sets the starting price. Once added, everyone can buy &amp; sell it.</p>
            <input value={liqToken} onChange={e => setLiqToken(e.target.value)} placeholder="Token contract address (0x…)" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:border-[#0052FF] mb-1" />
            {liqBal && (
              <p className={`text-[11px] mb-2 ${liqBal.bal > 0n ? 'text-green-600' : 'text-red-500'}`}>
                You hold: {fmtTok(Number(formatUnits(liqBal.bal, liqBal.dec)))} {liqBal.sym}
                {liqBal.bal > 0n && <button onClick={() => setLiqTok(formatUnits(liqBal.bal, liqBal.dec))} className="ml-1 text-[#0052FF] font-bold">Max</button>}
              </p>
            )}
            <div className="flex gap-2 mb-2">
              <input value={liqTok} onChange={e => setLiqTok(e.target.value)} type="number" min="0" placeholder="Token amount" className="flex-1 bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#0052FF]" />
              <input value={liqEth} onChange={e => setLiqEth(e.target.value)} type="number" min="0" step="0.001" placeholder="ETH amount" className="w-28 bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#0052FF]" />
            </div>
            {liqNote && <div className={`text-sm rounded-xl px-3 py-2 mb-2 ${liqNote.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{liqNote.t}</div>}
            <button onClick={addLiquidity} disabled={liqBusy || !isAddressLike(liqToken) || !(Number(liqTok) > 0) || !(Number(liqEth) > 0)}
              className="w-full bg-[#0052FF] hover:bg-[#1652F0] text-white font-black py-3 rounded-2xl transition-colors disabled:opacity-50">
              {liqBusy ? 'Adding…' : 'Add Liquidity'}
            </button>
            <p className="text-[10px] text-[#C5CBD3] text-center mt-2">Aerodrome volatile pool · you receive LP tokens · low ETH = high slippage for buyers</p>
          </div>
        </div>
      )}

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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-stretch sm:items-center justify-center z-[60] p-0 sm:p-4" onClick={() => setDetail(null)}>
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
                <div className="h-[140px] flex flex-col items-center justify-center gap-1 text-center px-6">
                  <span className="text-2xl">📉</span>
                  <p className="text-sm text-[#8A919E]">No chart yet — thin or no liquidity.</p>
                  <p className="text-[11px] text-[#C5CBD3]">You can still try to buy below; it works only if a pool exists.</p>
                </div>
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
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-[60] p-3" onClick={() => setActive(null)}>
            <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm p-5 shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
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
                  : [['25%', 0.25], ['50%', 0.5], ['Max', 1]].map(([lbl, f]) => <button key={lbl as string} onClick={() => setAmount(formatUnits((bal * BigInt(Math.round((f as number) * 1000))) / 1000n, active.dec))} className="flex-1 text-xs font-bold bg-[#F0F4FF] text-[#0052FF] rounded-lg py-1.5 hover:bg-[#E6EEFF]">{lbl}</button>)}
              </div>

              {side === 'sell' && <p className="text-[11px] text-[#8A919E] mt-2">Balance: {fmtTok(Number(formatUnits(bal, active.dec)))} {active.symbol}</p>}

              {/* quote */}
              {quote && Number(amount) > 0 && (
                <div className="mt-3 bg-[#F0F4FF] rounded-2xl px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-[#5B6271]">You receive →</span>
                  <span className="font-black text-[#0A0B0D] text-right">{side === 'buy' ? `${fmtTok(Number(formatUnits(quote.amountOut, active.dec)))} ${active.symbol}` : `${fmtTok(Number(formatUnits(quote.amountOut, 18)))} ETH`}</span>
                </div>
              )}

              {!quote && !quoting && quoteError && Number(amount) > 0 && (
                <div className="mt-3 text-xs rounded-xl px-3 py-2 bg-red-50 text-red-600">{quoteError}</div>
              )}

              {note && <div className={`text-sm rounded-xl px-3 py-2 mt-3 ${note.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{note.t}</div>}

              {bought && (
                <button onClick={addToWallet} className="w-full mt-3 bg-[#F0F4FF] text-[#0052FF] font-bold text-sm py-2.5 rounded-xl hover:bg-[#E6EEFF]">
                  ➕ Add {active.symbol} to your wallet
                </button>
              )}

              <button onClick={doTrade} disabled={!isConnected || busy || quoting || !amount || Number(amount) <= 0 || !quote}
                className={`w-full mt-4 text-white font-black text-base py-3.5 rounded-2xl transition-colors disabled:opacity-50 ${side === 'buy' ? 'bg-[#0052FF] hover:bg-[#1652F0]' : 'bg-[#0A0B0D] hover:bg-black'}`}>
                {busy ? 'Confirm in wallet…' : !isConnected ? 'Connect wallet' : quoting && Number(amount) > 0 ? 'Finding best price…' : !quote && Number(amount) > 0 ? 'No route found' : side === 'buy' ? `Buy ${active.symbol}` : `Sell ${active.symbol}`}
              </button>
              <p className="text-[10px] text-[#C5CBD3] text-center mt-2">Goes straight to your wallet · 10% max slippage · 1% platform fee · best route across Base DEXs</p>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
