'use client'
import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, usePublicClient } from 'wagmi'
import { parseUnits, formatUnits, maxUint256 } from 'viem'

const ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481' as `0x${string}`
const QUOTER = '0x3d4e44Eb1374240CE5F1B136Aa668B5be5C9e53F' as `0x${string}`
const WETH9 = '0x4200000000000000000000000000000000000006' as `0x${string}`

const FROM_TOKENS = ['ETH', 'USDC', 'cbBTC', 'WETH', 'DAI'] as const
const TO_TOKENS   = ['USDC', 'cbBTC', 'WETH', 'DAI', 'ETH'] as const

type TK = { addr: `0x${string}`; dec: number }
const T: Record<string, TK> = {
  ETH:   { addr: WETH9,                                             dec: 18 },
  WETH:  { addr: WETH9,                                             dec: 18 },
  USDC:  { addr: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',     dec: 6  },
  cbBTC: { addr: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',     dec: 8  },
  DAI:   { addr: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',     dec: 18 },
}
const FEES = [500, 3000, 100, 10000]

const QUOTER_ABI = [{
  name: 'quoteExactInputSingle', type: 'function', stateMutability: 'nonpayable',
  inputs: [{ name: 'p', type: 'tuple', components: [
    { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' },
    { name: 'amountIn', type: 'uint256' }, { name: 'fee', type: 'uint24' },
    { name: 'sqrtPriceLimitX96', type: 'uint160' },
  ]}],
  outputs: [
    { name: 'amountOut', type: 'uint256' }, { name: 'sqrtPriceX96After', type: 'uint160' },
    { name: 'initializedTicksCrossed', type: 'uint32' }, { name: 'gasEstimate', type: 'uint256' },
  ],
}] as const

const ROUTER_ABI = [{
  name: 'exactInputSingle', type: 'function', stateMutability: 'payable',
  inputs: [{ name: 'p', type: 'tuple', components: [
    { name: 'tokenIn', type: 'address' }, { name: 'tokenOut', type: 'address' },
    { name: 'fee', type: 'uint24' }, { name: 'recipient', type: 'address' },
    { name: 'amountIn', type: 'uint256' }, { name: 'amountOutMinimum', type: 'uint256' },
    { name: 'sqrtPriceLimitX96', type: 'uint160' },
  ]}],
  outputs: [{ name: 'amountOut', type: 'uint256' }],
}] as const

const ERC20_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
] as const

export default function SwapTool({ compact = false }: { compact?: boolean }) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [fromSym, setFromSym] = useState('ETH')
  const [toSym, setToSym]     = useState('USDC')
  const [amountIn, setAmountIn] = useState('')
  const [quote, setQuote]       = useState<{ out: string; fee: number } | null>(null)
  const [quotePending, setQP]   = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [txHash, setTxHash]     = useState<string | null>(null)
  const [status, setStatus]     = useState('')
  const [err, setErr]           = useState('')

  async function fetchQuote(fSym: string, tSym: string, amt: string) {
    if (!amt || parseFloat(amt) <= 0 || !publicClient) return
    setQP(true); setQuote(null); setErr('')
    const fT = T[fSym], tT = T[tSym]
    const amtIn = parseUnits(amt, fT.dec)
    let best: { amountOut: bigint; fee: number } | null = null
    for (const fee of FEES) {
      try {
        const r = await publicClient.simulateContract({
          address: QUOTER, abi: QUOTER_ABI, functionName: 'quoteExactInputSingle',
          args: [{ tokenIn: fT.addr, tokenOut: tT.addr, amountIn: amtIn, fee, sqrtPriceLimitX96: 0n }],
        })
        const amountOut = (r.result as unknown as bigint[])[0]
        if (!best || amountOut > best.amountOut) best = { amountOut, fee }
      } catch { /* no liquidity at this fee tier */ }
    }
    if (best) setQuote({ out: formatUnits(best.amountOut, tT.dec), fee: best.fee })
    else setErr('No liquidity for this pair')
    setQP(false)
  }

  useEffect(() => {
    if (!amountIn || parseFloat(amountIn) <= 0) { setQuote(null); return }
    const t = setTimeout(() => fetchQuote(fromSym, toSym, amountIn), 600)
    return () => clearTimeout(t)
  }, [fromSym, toSym, amountIn])

  async function handleSwap() {
    if (!address || !quote || !amountIn || !publicClient) return
    setSwapping(true); setErr(''); setTxHash(null)
    try {
      const fT = T[fromSym], tT = T[toSym]
      const amtIn = parseUnits(amountIn, fT.dec)
      const amtOutMin = (parseUnits(quote.out, tT.dec) * 95n) / 100n
      const isNative = fromSym === 'ETH'

      if (!isNative) {
        const allowance = await publicClient.readContract({
          address: fT.addr, abi: ERC20_ABI, functionName: 'allowance',
          args: [address, ROUTER],
        }) as bigint
        if (allowance < amtIn) {
          setStatus('Approving…')
          await writeContractAsync({ address: fT.addr, abi: ERC20_ABI, functionName: 'approve', args: [ROUTER, maxUint256] })
        }
      }

      setStatus('Swapping…')
      const hash = await writeContractAsync({
        address: ROUTER, abi: ROUTER_ABI, functionName: 'exactInputSingle',
        args: [{ tokenIn: fT.addr, tokenOut: tT.addr, fee: quote.fee, recipient: address,
                 amountIn: amtIn, amountOutMinimum: amtOutMin, sqrtPriceLimitX96: 0n }],
        value: isNative ? amtIn : 0n,
      })
      setTxHash(hash); setAmountIn(''); setQuote(null); setStatus('')
    } catch (e: unknown) {
      setErr((e instanceof Error ? e.message : String(e)).slice(0, 100))
    } finally { setSwapping(false) }
  }

  function flip() { setFromSym(toSym); setToSym(fromSym); setAmountIn(''); setQuote(null) }

  const availTo   = TO_TOKENS.filter(t => t !== fromSym)
  const availFrom = FROM_TOKENS.filter(t => t !== toSym)
  const outDisplay = quote ? parseFloat(quote.out).toPrecision(6).replace(/\.?0+$/, '') : null

  return (
    <div className={compact ? 'p-3 space-y-2' : 'space-y-3'}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-[#0A0B0D]">FlameSwap</span>
        <span className="text-[10px] text-[#8A919E]">Uniswap v3 · Base</span>
      </div>

      {/* From */}
      <div className="bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-[#8A919E]">From</span>
          <select value={fromSym} onChange={e => { setFromSym(e.target.value); setQuote(null) }}
            className="bg-white border border-[#E4E7EB] rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:border-[#0052FF]">
            {availFrom.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <input type="number" placeholder="0.0" value={amountIn} onChange={e => setAmountIn(e.target.value)}
          className="w-full bg-transparent text-xl font-bold focus:outline-none placeholder-[#C5CDD6]" />
      </div>

      {/* Flip */}
      <button onClick={flip} className="w-full flex justify-center py-0.5">
        <span className="text-[#0052FF] text-2xl leading-none hover:scale-110 transition-transform select-none">⇅</span>
      </button>

      {/* To */}
      <div className="bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-[#8A919E]">To</span>
          <select value={toSym} onChange={e => { setToSym(e.target.value); setQuote(null) }}
            className="bg-white border border-[#E4E7EB] rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:border-[#0052FF]">
            {availTo.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="text-xl font-bold text-[#8A919E]">
          {quotePending
            ? <span className="text-sm text-[#0052FF] animate-pulse">Getting quote…</span>
            : outDisplay
              ? <span className="text-[#0A0B0D]">{outDisplay}</span>
              : '0.0'}
        </div>
      </div>

      {quote && (
        <div className="text-[10px] text-[#8A919E] text-center">
          Fee tier: {(quote.fee / 10000).toFixed(2)}% · Slippage: 5%
        </div>
      )}

      {err && <p className="text-red-500 text-xs text-center break-all">{err}</p>}
      {status && !err && <p className="text-[#0052FF] text-xs text-center">{status}</p>}

      {txHash ? (
        <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noreferrer"
          className="block w-full bg-green-500 text-white text-xs py-3 rounded-xl font-bold text-center hover:bg-green-600 transition-colors">
          ✓ Swap başarılı! Basescan'de gör ↗
        </a>
      ) : (
        <button onClick={handleSwap}
          disabled={!address || !quote || !amountIn || swapping || quotePending}
          className="w-full bg-[#0052FF] text-white text-sm py-3 rounded-xl font-bold disabled:opacity-40 hover:bg-blue-700 transition-colors">
          {!address
            ? 'Cüzdan bağla'
            : swapping
            ? status || 'Swapping…'
            : quotePending
            ? 'Quote alınıyor…'
            : quote
            ? `Swap ${fromSym} → ${toSym}`
            : 'Miktar gir'}
        </button>
      )}
    </div>
  )
}
