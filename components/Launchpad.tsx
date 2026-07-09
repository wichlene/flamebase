'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAccount, usePublicClient, useWalletClient, useWriteContract } from 'wagmi'
import { erc20Abi, formatEther, parseEther } from 'viem'
import { base } from 'wagmi/chains'
import { LAUNCHPAD_ABI, LAUNCHPAD_ADDRESS, LAUNCHPAD_DEPLOYED } from '../lib/toolsContracts'
import { LAUNCHPAD_BYTECODE, LAUNCHPAD_CTOR_ABI } from '../lib/launchpadBytecode'

const ADMIN = '0xa77A5D4D37d6F39C20C2441295da9fA60Ab9fD69'.toLowerCase()

type TokenRow = {
  address: `0x${string}`
  name: string
  symbol: string
  ethReserve: bigint
  tokenReserve: bigint
  creator: `0x${string}`
  graduated: boolean
  realEth: bigint // ETH raised so far (liquidity)
  priceEth: number // ETH per token
  volumeEth: number // cumulative buy+sell volume in ETH
  mcapEth: number // fully-diluted market cap in ETH (price × total supply)
}

const TOTAL_SUPPLY = 1_000_000_000 // matches contract TOTAL_SUPPLY

const SLIPPAGE_BPS = 500n // 5%
const BPS = 10_000n

function fmtEth(v: bigint, dp = 4) {
  return Number(formatEther(v)).toLocaleString('en', { maximumFractionDigits: dp })
}
function fmtNum(v: bigint) {
  return Number(formatEther(v)).toLocaleString('en', { maximumFractionDigits: 0 })
}

export default function Launchpad() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { writeContractAsync } = useWriteContract()

  // Admin-only one-time deploy of the launchpad contract from the owner wallet.
  const [deploying, setDeploying] = useState(false)
  const [deployedAddr, setDeployedAddr] = useState<string | null>(null)
  const [deployErr, setDeployErr] = useState<string | null>(null)
  const isAdmin = !!address && address.toLowerCase() === ADMIN

  const deployLaunchpad = async () => {
    if (!walletClient || !publicClient || !address || deploying) return
    setDeploying(true); setDeployErr(null); setDeployedAddr(null)
    try {
      const hash = await walletClient.deployContract({
        abi: LAUNCHPAD_CTOR_ABI,
        bytecode: LAUNCHPAD_BYTECODE,
        args: [address], // feeTo = admin (fees flow here)
        chain: base,
        account: address,
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.contractAddress) setDeployedAddr(receipt.contractAddress)
      else setDeployErr('Deployed but no address in receipt — check the tx.')
    } catch (e) {
      setDeployErr(e instanceof Error && /reject|denied/i.test(e.message) ? 'Cancelled in wallet.' : 'Deploy failed — try again.')
    }
    setDeploying(false)
  }

  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [loading, setLoading] = useState(true)
  const [gradEth, setGradEth] = useState<bigint>(parseEther('4'))
  const [virtualEth, setVirtualEth] = useState<bigint>(parseEther('1'))

  // "All B20" explorer — every B20 token created on Base, from the factory's
  // B20Created event (0xB20f… precompile is the singleton factory on all chains).
  const [mode, setMode] = useState<'curve' | 'all'>('curve')
  const [allB20, setAllB20] = useState<{ token: `0x${string}`; name: string; symbol: string; variant: number }[]>([])
  const [loadingAll, setLoadingAll] = useState(false)
  const loadAllB20 = useCallback(async () => {
    if (!publicClient) return
    setLoadingAll(true)
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
    const FACTORY = '0xB20f000000000000000000000000000000000000' as const
    try {
      // Public RPCs reject getLogs over huge ranges, so scan back from the tip
      // in bounded chunks (B20 only activated recently, so a few weeks covers it).
      const latest = await publicClient.getBlockNumber()
      const CHUNK = 9000n
      const MAX_BACK = 800_000n // ~18 days of Base 2s blocks — comfortably covers B20's mainnet era
      const start = latest > MAX_BACK ? latest - MAX_BACK : 0n
      const ranges: [bigint, bigint][] = []
      for (let from = start; from <= latest; from += CHUNK + 1n) {
        ranges.push([from, from + CHUNK > latest ? latest : from + CHUNK])
      }
      const seen = new Set<string>()
      const rows: { token: `0x${string}`; name: string; symbol: string; variant: number; block: bigint }[] = []
      // Run chunks in concurrent batches to keep it fast.
      for (let i = 0; i < ranges.length; i += 10) {
        const batch = ranges.slice(i, i + 10)
        const results = await Promise.all(batch.map(([f, t]) =>
          publicClient.getLogs({ address: FACTORY, event: B20_CREATED, fromBlock: f, toBlock: t }).catch(() => [])
        ))
        for (const logs of results) {
          for (const l of logs as { blockNumber?: bigint; args?: { token?: `0x${string}`; name?: string; symbol?: string; variant?: number } }[]) {
            const t = l.args?.token?.toLowerCase()
            if (!t || seen.has(t)) continue
            seen.add(t)
            rows.push({ token: l.args!.token!, name: l.args?.name || 'B20', symbol: l.args?.symbol || '???', variant: Number(l.args?.variant ?? 0), block: l.blockNumber ?? 0n })
          }
        }
      }
      rows.sort((a, b) => (b.block > a.block ? 1 : -1)) // newest first
      setAllB20(rows.map(({ token, name, symbol, variant }) => ({ token, name, symbol, variant })))
    } catch { /* best effort */ }
    setLoadingAll(false)
  }, [publicClient])
  useEffect(() => { if (mode === 'all') loadAllB20() }, [mode, loadAllB20])

  // launch form
  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [devBuy, setDevBuy] = useState('')
  const [launching, setLaunching] = useState(false)

  // trade modal
  const [active, setActive] = useState<TokenRow | null>(null)
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [quote, setQuote] = useState<bigint | null>(null)
  const [myBalance, setMyBalance] = useState<bigint>(0n)
  const [trading, setTrading] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const loadTokens = useCallback(async () => {
    if (!publicClient || !LAUNCHPAD_DEPLOYED) { setLoading(false); return }
    try {
      const [count, g, v] = await Promise.all([
        publicClient.readContract({ address: LAUNCHPAD_ADDRESS, abi: LAUNCHPAD_ABI, functionName: 'tokensCount' }),
        publicClient.readContract({ address: LAUNCHPAD_ADDRESS, abi: LAUNCHPAD_ABI, functionName: 'GRADUATION_ETH' }),
        publicClient.readContract({ address: LAUNCHPAD_ADDRESS, abi: LAUNCHPAD_ABI, functionName: 'VIRTUAL_ETH' }),
      ])
      setGradEth(g as bigint); setVirtualEth(v as bigint)
      const n = Number(count as bigint)

      // Cumulative volume per token from Bought/Sold events (DEX-style stat).
      const vol: Record<string, bigint> = {}
      try {
        const [buys, sells] = await Promise.all([
          publicClient.getLogs({ address: LAUNCHPAD_ADDRESS, event: LAUNCHPAD_ABI.find(x => x.type === 'event' && x.name === 'Bought') as never, fromBlock: 0n, toBlock: 'latest' }),
          publicClient.getLogs({ address: LAUNCHPAD_ADDRESS, event: LAUNCHPAD_ABI.find(x => x.type === 'event' && x.name === 'Sold') as never, fromBlock: 0n, toBlock: 'latest' }),
        ])
        for (const l of buys as { args?: { token?: string; ethIn?: bigint } }[]) {
          const k = l.args?.token?.toLowerCase() ?? ''; if (k) vol[k] = (vol[k] ?? 0n) + (l.args?.ethIn ?? 0n)
        }
        for (const l of sells as { args?: { token?: string; ethOut?: bigint } }[]) {
          const k = l.args?.token?.toLowerCase() ?? ''; if (k) vol[k] = (vol[k] ?? 0n) + (l.args?.ethOut ?? 0n)
        }
      } catch { /* volume is best-effort */ }

      const rows: TokenRow[] = []
      for (let i = 0; i < n; i++) {
        const addr = await publicClient.readContract({ address: LAUNCHPAD_ADDRESS, abi: LAUNCHPAD_ABI, functionName: 'allTokens', args: [BigInt(i)] }) as `0x${string}`
        const [curve, tname, tsym] = await Promise.all([
          publicClient.readContract({ address: LAUNCHPAD_ADDRESS, abi: LAUNCHPAD_ABI, functionName: 'curves', args: [addr] }),
          publicClient.readContract({ address: addr, abi: erc20Abi, functionName: 'name' }).catch(() => 'Token'),
          publicClient.readContract({ address: addr, abi: erc20Abi, functionName: 'symbol' }).catch(() => '???'),
        ])
        const [ethReserve, tokenReserve, creator, graduated] = curve as [bigint, bigint, `0x${string}`, boolean]
        const priceEth = tokenReserve > 0n ? Number(ethReserve) / Number(tokenReserve) : 0
        rows.push({
          address: addr, name: tname as string, symbol: tsym as string,
          ethReserve, tokenReserve, creator, graduated,
          realEth: ethReserve > (v as bigint) ? ethReserve - (v as bigint) : 0n,
          priceEth,
          volumeEth: Number(formatEther(vol[addr.toLowerCase()] ?? 0n)),
          mcapEth: priceEth * TOTAL_SUPPLY,
        })
      }
      // trending = highest volume first, then most ETH raised
      rows.sort((a, b) => (b.volumeEth - a.volumeEth) || (b.realEth > a.realEth ? 1 : -1))
      setTokens(rows)
    } catch { /* keep last good state */ }
    setLoading(false)
  }, [publicClient])

  useEffect(() => { loadTokens() }, [loadTokens])

  // live quote as the user types in the trade modal
  useEffect(() => {
    let stop = false
    const run = async () => {
      if (!active || !publicClient || !amount || Number(amount) <= 0) { setQuote(null); return }
      try {
        const wei = parseEther(amount)
        const q = await publicClient.readContract({
          address: LAUNCHPAD_ADDRESS, abi: LAUNCHPAD_ABI,
          functionName: side === 'buy' ? 'quoteBuy' : 'quoteSell',
          args: [active.address, wei],
        }) as bigint
        if (!stop) setQuote(q)
      } catch { if (!stop) setQuote(null) }
    }
    run()
    return () => { stop = true }
  }, [amount, side, active, publicClient])

  // load my token balance when opening the sell side
  useEffect(() => {
    const run = async () => {
      if (!active || !publicClient || !address) { setMyBalance(0n); return }
      try {
        const b = await publicClient.readContract({ address: active.address, abi: erc20Abi, functionName: 'balanceOf', args: [address] }) as bigint
        setMyBalance(b)
      } catch { setMyBalance(0n) }
    }
    run()
  }, [active, address, publicClient, trading])

  const openTrade = (t: TokenRow, s: 'buy' | 'sell') => {
    setActive(t); setSide(s); setAmount(''); setQuote(null); setMsg(null)
  }

  const doLaunch = async () => {
    if (!isConnected || !name.trim() || !symbol.trim() || launching) return
    setLaunching(true); setMsg(null)
    try {
      await writeContractAsync({
        chainId: base.id, address: LAUNCHPAD_ADDRESS, abi: LAUNCHPAD_ABI,
        functionName: 'launch', args: [name.trim(), symbol.trim().toUpperCase()],
        value: devBuy && Number(devBuy) > 0 ? parseEther(devBuy) : 0n,
      })
      setName(''); setSymbol(''); setDevBuy('')
      setMsg({ kind: 'ok', text: 'Token launched! It will appear below shortly.' })
      setTimeout(loadTokens, 3000)
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error && /reject|denied/i.test(e.message) ? 'Cancelled.' : 'Launch failed.' })
    }
    setLaunching(false)
  }

  const doTrade = async () => {
    if (!active || !isConnected || !amount || Number(amount) <= 0 || trading) return
    setTrading(true); setMsg(null)
    try {
      const wei = parseEther(amount)
      if (side === 'buy') {
        const minOut = quote ? (quote * (BPS - SLIPPAGE_BPS)) / BPS : 0n
        await writeContractAsync({
          chainId: base.id, address: LAUNCHPAD_ADDRESS, abi: LAUNCHPAD_ABI,
          functionName: 'buy', args: [active.address, minOut], value: wei,
        })
      } else {
        // approve then sell
        const allowance = await publicClient!.readContract({ address: active.address, abi: erc20Abi, functionName: 'allowance', args: [address!, LAUNCHPAD_ADDRESS] }) as bigint
        if (allowance < wei) {
          await writeContractAsync({ chainId: base.id, address: active.address, abi: erc20Abi, functionName: 'approve', args: [LAUNCHPAD_ADDRESS, wei] })
        }
        const minEth = quote ? (quote * (BPS - SLIPPAGE_BPS)) / BPS : 0n
        await writeContractAsync({
          chainId: base.id, address: LAUNCHPAD_ADDRESS, abi: LAUNCHPAD_ABI,
          functionName: 'sell', args: [active.address, wei, minEth],
        })
      }
      setMsg({ kind: 'ok', text: `${side === 'buy' ? 'Bought' : 'Sold'} ✓` })
      setAmount(''); setQuote(null)
      setTimeout(loadTokens, 3000)
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error && /reject|denied/i.test(e.message) ? 'Cancelled in wallet.' : /slippage/i.test((e as Error).message) ? 'Price moved — try again.' : 'Trade failed.' })
    }
    setTrading(false)
  }

  if (!LAUNCHPAD_DEPLOYED) {
    return (
      <div className="p-6 text-center">
        <div className="text-4xl mb-2">🚀</div>
        <h2 className="font-black text-[#0A0B0D] text-lg">FlameBase Launchpad</h2>
        <p className="text-sm text-[#5B6271] mt-2 max-w-sm mx-auto">
          Launch a token that&apos;s instantly buyable and sellable right here — no Uniswap, no upfront liquidity. Coming online soon.
        </p>

        {isAdmin && (
          <div className="mt-6 max-w-sm mx-auto bg-[#F0F4FF] border border-[#D6E2FF] rounded-2xl p-4 text-left">
            <p className="text-xs font-black text-[#0052FF] mb-1">Admin · one-time deploy</p>
            <p className="text-[11px] text-[#5B6271] mb-3">Deploy the launchpad contract from your wallet. Fees go to your address. After it confirms, copy the address below and send it to set it live.</p>
            {!deployedAddr ? (
              <button onClick={deployLaunchpad} disabled={deploying}
                className="w-full bg-[#0052FF] text-white font-black text-sm py-2.5 rounded-xl disabled:opacity-50">
                {deploying ? 'Deploying…' : 'Deploy Launchpad 🚀'}
              </button>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                <p className="text-xs font-bold text-green-700 mb-1">✅ Deployed! Send me this address:</p>
                <code className="block text-[11px] break-all bg-white rounded-lg p-2 border border-green-200 text-[#0A0B0D] select-all">{deployedAddr}</code>
                <button onClick={() => navigator.clipboard?.writeText(deployedAddr)}
                  className="mt-2 text-xs font-bold text-[#0052FF]">Copy address</button>
              </div>
            )}
            {deployErr && <p className="text-xs text-red-600 mt-2">{deployErr}</p>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-5">
      <div>
        <h2 className="font-black text-[#0A0B0D] text-lg flex items-center gap-2">🚀 B20 DEX</h2>
        <p className="text-xs text-[#5B6271] mt-0.5">Launch & trade on the curve, or browse every B20 token on Base.</p>
      </div>

      {/* Mode switch */}
      <div className="flex gap-1 bg-[#F0F2F5] rounded-xl p-1">
        <button onClick={() => setMode('curve')} className={`flex-1 text-sm font-bold py-2 rounded-lg transition-colors ${mode === 'curve' ? 'bg-white text-[#0052FF] shadow-sm' : 'text-[#8A919E]'}`}>🔥 Launchpad</button>
        <button onClick={() => setMode('all')} className={`flex-1 text-sm font-bold py-2 rounded-lg transition-colors ${mode === 'all' ? 'bg-white text-[#0052FF] shadow-sm' : 'text-[#8A919E]'}`}>🌐 All B20</button>
      </div>

      {/* ══ ALL B20 explorer ══ */}
      {mode === 'all' && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="font-black text-sm text-[#0A0B0D]">Every B20 on Base</p>
            <button onClick={loadAllB20} className="text-xs text-[#0052FF] font-bold hover:underline">Refresh</button>
          </div>
          {loadingAll ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-[#F0F2F5] rounded-2xl animate-pulse" />)}</div>
          ) : allB20.length === 0 ? (
            <p className="text-sm text-[#8A919E] text-center py-6">No B20 tokens found yet (or the RPC limited the query). Try Refresh.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-[11px] text-[#8A919E]">{allB20.length} B20 token{allB20.length > 1 ? 's' : ''} on Base</p>
              {allB20.map(t => (
                <div key={t.token} className="bg-white border border-[#E4E7EB] rounded-2xl p-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0052FF] to-[#7B61FF] flex items-center justify-center text-white font-black text-xs flex-shrink-0">{t.symbol.slice(0, 3)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-[#0A0B0D] truncate">{t.name}</span>
                      <span className="text-[10px] bg-[#F0F2F5] text-[#5B6271] px-1.5 py-0.5 rounded-full font-semibold">${t.symbol}</span>
                      <span className="text-[10px] bg-[#E6EEFF] text-[#0052FF] px-1.5 py-0.5 rounded-full font-semibold">{t.variant === 1 ? 'Stablecoin' : 'Asset'}</span>
                    </div>
                    <p className="text-[10px] text-[#8A919E] font-mono truncate">{t.token}</p>
                  </div>
                  <a href={`https://basescan.org/token/${t.token}`} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[#0052FF] flex-shrink-0">View ↗</a>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-[#C5CBD3] text-center mt-3">In-site buy/sell for external B20s (routing to their pools) is coming next. Tokens launched here trade instantly under 🔥 Launchpad.</p>
        </div>
      )}

      {/* ══ Bonding-curve launchpad ══ */}
      {mode === 'curve' && <>

      {/* Launch form */}
      <div className="bg-gradient-to-br from-[#0052FF] to-[#4D8FFF] rounded-2xl p-4 text-white">
        <p className="font-black text-sm mb-2">Launch a new token</p>
        <div className="space-y-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Token name (e.g. Flame Cat)" maxLength={32}
            className="w-full bg-white/15 placeholder-white/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:bg-white/25" />
          <input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="Symbol (e.g. FCAT)" maxLength={10}
            className="w-full bg-white/15 placeholder-white/60 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:bg-white/25" />
          <input value={devBuy} onChange={e => setDevBuy(e.target.value)} placeholder="Optional first buy in ETH (e.g. 0.01)" type="number" step="0.001" min="0"
            className="w-full bg-white/15 placeholder-white/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:bg-white/25" />
          <button onClick={doLaunch} disabled={!isConnected || launching || !name.trim() || !symbol.trim()}
            className="w-full bg-white text-[#0052FF] font-black text-sm py-2.5 rounded-lg disabled:opacity-50">
            {launching ? 'Launching…' : !isConnected ? 'Connect wallet to launch' : 'Launch Token 🚀'}
          </button>
        </div>
      </div>

      {msg && !active && (
        <div className={`text-sm rounded-xl px-3 py-2 ${msg.kind === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>{msg.text}</div>
      )}

      {/* Trending board */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="font-black text-sm text-[#0A0B0D]">🔥 Trending</p>
          <button onClick={loadTokens} className="text-xs text-[#0052FF] font-bold hover:underline">Refresh</button>
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-20 bg-[#F0F2F5] rounded-2xl animate-pulse" />)}</div>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-[#8A919E] text-center py-6">No tokens launched yet — be the first! 🚀</p>
        ) : (
          <div className="space-y-2">
            {tokens.map(t => {
              const progress = gradEth > 0n ? Math.min(100, Number((t.realEth * 100n) / gradEth)) : 0
              return (
                <div key={t.address} className="bg-white border border-[#E4E7EB] rounded-2xl p-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0052FF] to-[#7B61FF] flex items-center justify-center text-white font-black text-xs flex-shrink-0">
                      {t.symbol.slice(0, 3)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-[#0A0B0D] truncate">{t.name}</span>
                        <span className="text-[10px] bg-[#F0F2F5] text-[#5B6271] px-1.5 py-0.5 rounded-full font-semibold">${t.symbol}</span>
                        {t.graduated && <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">🎓 Graduated</span>}
                      </div>
                      <p className="text-[11px] text-[#8A919E]">{t.priceEth.toExponential(2)} ETH</p>
                    </div>
                    {!t.graduated && (
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={() => openTrade(t, 'buy')} className="bg-[#0052FF] text-white text-xs font-bold px-3 py-1.5 rounded-lg">Buy</button>
                        <button onClick={() => openTrade(t, 'sell')} className="bg-[#F0F2F5] text-[#5B6271] text-xs font-bold px-3 py-1.5 rounded-lg">Sell</button>
                      </div>
                    )}
                  </div>
                  {/* DEX-style stats */}
                  <div className="grid grid-cols-3 gap-1.5 mt-2">
                    {[
                      { k: 'MCap', v: `${t.mcapEth.toLocaleString('en', { maximumFractionDigits: 2 })} Ξ` },
                      { k: 'Volume', v: `${t.volumeEth.toLocaleString('en', { maximumFractionDigits: 3 })} Ξ` },
                      { k: 'Liquidity', v: `${fmtEth(t.realEth, 3)} Ξ` },
                    ].map(s => (
                      <div key={s.k} className="bg-[#F7F9FC] rounded-lg px-2 py-1">
                        <p className="text-[9px] text-[#8A919E] uppercase tracking-wide">{s.k}</p>
                        <p className="text-[11px] font-bold text-[#0A0B0D] truncate">{s.v}</p>
                      </div>
                    ))}
                  </div>
                  {/* graduation progress */}
                  <div className="mt-2">
                    <div className="h-1.5 bg-[#F0F2F5] rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#0052FF] to-[#4D8FFF]" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-[10px] text-[#8A919E] mt-0.5">{progress}% to graduation ({fmtEth(gradEth, 0)} ETH)</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      </>}

      {/* Trade modal */}
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
              <p className="text-[11px] text-[#8A919E] mt-1">Balance: {fmtNum(myBalance)} {active.symbol}
                <button onClick={() => setAmount(formatEther(myBalance))} className="ml-1 text-[#0052FF] font-bold">Max</button>
              </p>
            )}

            {quote !== null && Number(amount) > 0 && (
              <p className="text-sm text-[#0A0B0D] mt-2 bg-[#F0F4FF] rounded-lg px-3 py-2">
                ≈ You get <b>{side === 'buy' ? `${fmtNum(quote)} ${active.symbol}` : `${fmtEth(quote)} ETH`}</b>
                <span className="text-[11px] text-[#8A919E] block">5% max slippage · 1% trade fee</span>
              </p>
            )}

            {msg && active && (
              <div className={`text-sm rounded-xl px-3 py-2 mt-2 ${msg.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{msg.text}</div>
            )}

            <button onClick={doTrade} disabled={!isConnected || trading || !amount || Number(amount) <= 0}
              className="w-full mt-3 bg-[#0052FF] text-white font-black text-sm py-2.5 rounded-xl disabled:opacity-50">
              {trading ? 'Processing…' : side === 'buy' ? `Buy ${active.symbol}` : `Sell ${active.symbol}`}
            </button>
          </div>
        </div>
      )}

      <p className="text-[10px] text-[#C5CBD3] text-center">Trading happens on a bonding curve on Base. Prices move with every trade. Only spend what you can afford to lose.</p>
    </div>
  )
}
