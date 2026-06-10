'use client'
import { useState, useEffect, useRef } from 'react'
import { useAccount, useWriteContract, usePublicClient, useBalance, useSwitchChain, useChainId } from 'wagmi'
import { parseUnits, formatUnits, maxUint256, formatEther } from 'viem'
import { base, mainnet, arbitrum, optimism, polygon } from 'wagmi/chains'

/* ─── Chain config ─────────────────────────────────────────────────────── */
const CHAINS = [
  { id: base.id,      name: 'Base',     color: '#0052FF', icon: '🔵' },
  { id: mainnet.id,   name: 'Ethereum', color: '#627EEA', icon: '⟠'  },
  { id: arbitrum.id,  name: 'Arbitrum', color: '#12AAFF', icon: '🔷' },
  { id: optimism.id,  name: 'Optimism', color: '#FF0420', icon: '🔴' },
  { id: polygon.id,   name: 'Polygon',  color: '#8247E5', icon: '🟣' },
]

const ROUTER: Record<number, `0x${string}`> = {
  [base.id]:      '0x2626664c2603336E57B271c5C0b26F421741e481',
  [mainnet.id]:   '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  [arbitrum.id]:  '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  [optimism.id]:  '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
  [polygon.id]:   '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45',
}
const QUOTER: Record<number, `0x${string}`> = {
  [base.id]:      '0x3d4e44Eb1374240CE5F1B136Aa668B5be5C9e53F',
  [mainnet.id]:   '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  [arbitrum.id]:  '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  [optimism.id]:  '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
  [polygon.id]:   '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
}

/* ─── Token config ─────────────────────────────────────────────────────── */
type TK = { addr: `0x${string}`; dec: number; symbol: string; name: string; color: string; logo?: string }

const BASE_TOKENS: TK[] = [
  { addr: '0x4200000000000000000000000000000000000006', dec: 18, symbol: 'ETH',   name: 'Ethereum',         color: '#627EEA', logo: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
  { addr: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', dec: 6,  symbol: 'USDC',  name: 'USD Coin',          color: '#2775CA', logo: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png' },
  { addr: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', dec: 8,  symbol: 'cbBTC', name: 'Coinbase BTC',      color: '#F7931A', logo: 'https://assets.coingecko.com/coins/images/34974/small/cbbtc.webp' },
  { addr: '0x4200000000000000000000000000000000000006', dec: 18, symbol: 'WETH',  name: 'Wrapped ETH',       color: '#627EEA', logo: 'https://assets.coingecko.com/coins/images/2518/small/weth.png' },
  { addr: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', dec: 18, symbol: 'DAI',   name: 'Dai Stablecoin',    color: '#F5AC37', logo: 'https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png' },
  { addr: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', dec: 18, symbol: 'AERO',  name: 'Aerodrome Finance', color: '#FF5B57', logo: 'https://assets.coingecko.com/coins/images/31745/small/token.png' },
  { addr: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', dec: 6,  symbol: 'USDT',  name: 'Tether USD',        color: '#26A17B', logo: 'https://assets.coingecko.com/coins/images/325/small/Tether.png' },
]

const ETH_TOKENS: TK[] = [
  { addr: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', dec: 18, symbol: 'WETH',  name: 'Wrapped ETH',    color: '#627EEA', logo: 'https://assets.coingecko.com/coins/images/2518/small/weth.png' },
  { addr: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', dec: 6,  symbol: 'USDC',  name: 'USD Coin',       color: '#2775CA', logo: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png' },
  { addr: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', dec: 8,  symbol: 'WBTC',  name: 'Wrapped BTC',    color: '#F7931A', logo: 'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png' },
  { addr: '0x6B175474E89094C44Da98b954EedeAC495271d0F', dec: 18, symbol: 'DAI',   name: 'Dai',            color: '#F5AC37', logo: 'https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png' },
  { addr: '0xdAC17F958D2ee523a2206206994597C13D831ec7', dec: 6,  symbol: 'USDT',  name: 'Tether',         color: '#26A17B', logo: 'https://assets.coingecko.com/coins/images/325/small/Tether.png' },
]

const ARB_TOKENS: TK[] = [
  { addr: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', dec: 18, symbol: 'WETH',  name: 'Wrapped ETH',    color: '#627EEA', logo: 'https://assets.coingecko.com/coins/images/2518/small/weth.png' },
  { addr: '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8', dec: 6,  symbol: 'USDC',  name: 'USD Coin',       color: '#2775CA', logo: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png' },
  { addr: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', dec: 6,  symbol: 'USDT',  name: 'Tether',         color: '#26A17B', logo: 'https://assets.coingecko.com/coins/images/325/small/Tether.png' },
  { addr: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', dec: 18, symbol: 'DAI',   name: 'Dai',            color: '#F5AC37', logo: 'https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png' },
]

const TOKENS_BY_CHAIN: Record<number, TK[]> = {
  [base.id]:     BASE_TOKENS,
  [mainnet.id]:  ETH_TOKENS,
  [arbitrum.id]: ARB_TOKENS,
  [optimism.id]: [
    { addr: '0x4200000000000000000000000000000000000006', dec: 18, symbol: 'WETH', name: 'Wrapped ETH', color: '#627EEA', logo: 'https://assets.coingecko.com/coins/images/2518/small/weth.png' },
    { addr: '0x7F5c764cBc14f9669B88837ca1490cCa17c31607', dec: 6,  symbol: 'USDC', name: 'USD Coin',    color: '#2775CA', logo: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png' },
    { addr: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', dec: 6,  symbol: 'USDT', name: 'Tether',      color: '#26A17B', logo: 'https://assets.coingecko.com/coins/images/325/small/Tether.png' },
  ],
  [polygon.id]: [
    { addr: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', dec: 18, symbol: 'WMATIC', name: 'Wrapped MATIC', color: '#8247E5', logo: 'https://assets.coingecko.com/coins/images/4713/small/matic-token-icon.png' },
    { addr: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', dec: 6,  symbol: 'USDC',   name: 'USD Coin',      color: '#2775CA', logo: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png' },
    { addr: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', dec: 6,  symbol: 'USDT',   name: 'Tether',        color: '#26A17B', logo: 'https://assets.coingecko.com/coins/images/325/small/Tether.png' },
  ],
}

const FEES = [500, 3000, 100, 10000]
const WETH9: Record<number, `0x${string}`> = {
  [base.id]:     '0x4200000000000000000000000000000000000006',
  [mainnet.id]:  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  [arbitrum.id]: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
  [optimism.id]: '0x4200000000000000000000000000000000000006',
  [polygon.id]:  '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
}

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
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
] as const

/* ─── Token Logo component ─────────────────────────────────────────────── */
function TokenLogo({ token, size = 32 }: { token: TK; size?: number }) {
  const [err, setErr] = useState(false)
  if (token.logo && !err) {
    return <img src={token.logo} alt={token.symbol} width={size} height={size}
      className="rounded-full" onError={() => setErr(true)} />
  }
  return (
    <div style={{ width: size, height: size, background: token.color }}
      className="rounded-full flex items-center justify-center text-white font-black text-xs flex-shrink-0">
      {token.symbol.slice(0, 2)}
    </div>
  )
}

/* ─── Token Selector Modal ─────────────────────────────────────────────── */
function TokenModal({ tokens, onSelect, onClose, exclude }: {
  tokens: TK[]; onSelect: (t: TK) => void; onClose: () => void; exclude?: `0x${string}`
}) {
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = tokens.filter(t =>
    t.addr !== exclude &&
    (t.symbol.toLowerCase().includes(search.toLowerCase()) ||
     t.name.toLowerCase().includes(search.toLowerCase()) ||
     t.addr.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#F0F2F5]">
          <span className="font-black text-[#0A0B0D]">Token Seç</span>
          <button onClick={onClose} className="text-[#8A919E] hover:text-[#0A0B0D] text-xl leading-none">✕</button>
        </div>
        <div className="p-3">
          <div className="flex items-center gap-2 bg-[#F7F9FC] border border-[#E4E7EB] rounded-2xl px-3 py-2.5">
            <span className="text-[#8A919E]">🔍</span>
            <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)}
              placeholder="İsim, sembol veya adres"
              className="flex-1 bg-transparent text-sm focus:outline-none placeholder-[#C5CDD6]" />
          </div>
        </div>
        <div className="px-3 pb-1 text-xs font-bold text-[#8A919E]">Popüler tokenlar</div>
        <div className="overflow-y-auto max-h-72 pb-3">
          {filtered.length === 0 ? (
            <div className="text-center text-[#8A919E] text-sm py-6">Token bulunamadı</div>
          ) : filtered.map(t => (
            <button key={t.addr + t.symbol} onClick={() => { onSelect(t); onClose() }}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F7F9FC] transition-colors">
              <TokenLogo token={t} size={36} />
              <div className="text-left">
                <div className="font-bold text-[#0A0B0D] text-sm">{t.symbol}</div>
                <div className="text-xs text-[#8A919E]">{t.name}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ─── Main SwapTool ────────────────────────────────────────────────────── */
export default function SwapTool({ compact = false }: { compact?: boolean }) {
  const { address } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const currentChain = CHAINS.find(c => c.id === chainId) || CHAINS[0]
  const tokens = TOKENS_BY_CHAIN[chainId] || BASE_TOKENS

  const [fromToken, setFromToken] = useState<TK>(tokens[0])
  const [toToken, setToToken]     = useState<TK>(tokens[1])
  const [amountIn, setAmountIn]   = useState('')
  const [quote, setQuote]   = useState<{ out: string; fee: number } | null>(null)
  const [qLoad, setQL]      = useState(false)
  const [swapping, setSw]   = useState(false)
  const [txHash, setTx]     = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [err, setErr]       = useState('')
  const [showFrom, setShowFrom] = useState(false)
  const [showTo, setShowTo]     = useState(false)
  const [showChains, setShowChains] = useState(false)

  // Reset tokens when chain changes
  useEffect(() => {
    const tks = TOKENS_BY_CHAIN[chainId] || BASE_TOKENS
    setFromToken(tks[0])
    setToToken(tks[1])
    setAmountIn(''); setQuote(null); setErr('')
  }, [chainId])

  const { data: ethBal } = useBalance({ address, chainId })

  async function fetchQuote(fT: TK, tT: TK, amt: string) {
    if (!amt || parseFloat(amt) <= 0 || !publicClient) return
    setQL(true); setQuote(null); setErr('')
    try {
      const amtIn = parseUnits(amt, fT.dec)
      const router = QUOTER[chainId]
      if (!router) { setErr('Bu ağ desteklenmiyor'); setQL(false); return }
      let best: { amountOut: bigint; fee: number } | null = null
      for (const fee of FEES) {
        try {
          const r = await publicClient.simulateContract({
            address: router, abi: QUOTER_ABI, functionName: 'quoteExactInputSingle',
            args: [{ tokenIn: fT.addr, tokenOut: tT.addr, amountIn: amtIn, fee, sqrtPriceLimitX96: 0n }],
          })
          const amountOut = (r.result as unknown as bigint[])[0]
          if (!best || amountOut > best.amountOut) best = { amountOut, fee }
        } catch { /* no pool at this fee */ }
      }
      if (best) setQuote({ out: formatUnits(best.amountOut, tT.dec), fee: best.fee })
      else setErr('Bu çift için likidite bulunamadı')
    } catch (e: unknown) {
      setErr('Quote hatası: ' + (e instanceof Error ? e.message : '').slice(0, 60))
    }
    setQL(false)
  }

  useEffect(() => {
    if (!amountIn || parseFloat(amountIn) <= 0) { setQuote(null); return }
    const t = setTimeout(() => fetchQuote(fromToken, toToken, amountIn), 600)
    return () => clearTimeout(t)
  }, [fromToken, toToken, amountIn, chainId])

  async function handleSwap() {
    if (!address || !quote || !amountIn || !publicClient) return
    setSw(true); setErr(''); setTx(null)
    try {
      const router = ROUTER[chainId]
      const weth   = WETH9[chainId]
      if (!router || !weth) { setErr('Bu ağ desteklenmiyor'); setSw(false); return }
      const amtIn = parseUnits(amountIn, fromToken.dec)
      const amtOutMin = (parseUnits(quote.out, toToken.dec) * 95n) / 100n
      const isNative = fromToken.addr === weth

      if (!isNative) {
        const allowance = await publicClient.readContract({
          address: fromToken.addr, abi: ERC20_ABI, functionName: 'allowance', args: [address, router],
        }) as bigint
        if (allowance < amtIn) {
          setStatus('Token onaylanıyor…')
          await writeContractAsync({ address: fromToken.addr, abi: ERC20_ABI, functionName: 'approve', args: [router, maxUint256] })
        }
      }
      setStatus('İşlem gönderiliyor…')
      const hash = await writeContractAsync({
        address: router, abi: ROUTER_ABI, functionName: 'exactInputSingle',
        args: [{ tokenIn: fromToken.addr, tokenOut: toToken.addr, fee: quote.fee,
                 recipient: address, amountIn: amtIn, amountOutMinimum: amtOutMin, sqrtPriceLimitX96: 0n }],
        value: isNative ? amtIn : 0n,
        chainId,
      })
      setTx(hash); setAmountIn(''); setQuote(null); setStatus('')
    } catch (e: unknown) {
      setErr((e instanceof Error ? e.message : String(e)).slice(0, 120))
      setStatus('')
    }
    setSw(false)
  }

  function flip() {
    setFromToken(toToken); setToToken(fromToken)
    setAmountIn(''); setQuote(null); setErr('')
  }

  const outDisplay = quote
    ? parseFloat(quote.out) < 0.000001 ? '< 0.000001'
      : parseFloat(quote.out).toLocaleString('en', { maximumSignificantDigits: 6 })
    : ''

  const chainExplorer: Record<number, string> = {
    [base.id]:     'https://basescan.org/tx/',
    [mainnet.id]:  'https://etherscan.io/tx/',
    [arbitrum.id]: 'https://arbiscan.io/tx/',
    [optimism.id]: 'https://optimistic.etherscan.io/tx/',
    [polygon.id]:  'https://polygonscan.com/tx/',
  }

  return (
    <>
      {/* Chain picker modal */}
      {showChains && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setShowChains(false)}>
          <div className="bg-white rounded-3xl w-full max-w-xs shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-[#F0F2F5]">
              <span className="font-black text-[#0A0B0D]">Ağ Seç</span>
              <button onClick={() => setShowChains(false)} className="text-[#8A919E] hover:text-[#0A0B0D] text-xl">✕</button>
            </div>
            <div className="p-3 space-y-1">
              {CHAINS.map(c => (
                <button key={c.id} onClick={() => { switchChain({ chainId: c.id }); setShowChains(false) }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-colors ${chainId === c.id ? 'bg-[#E6EEFF]' : 'hover:bg-[#F7F9FC]'}`}>
                  <span className="text-xl">{c.icon}</span>
                  <span className="font-bold text-sm text-[#0A0B0D]">{c.name}</span>
                  {chainId === c.id && <span className="ml-auto text-[#0052FF] text-xs font-bold">✓ Aktif</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Token modals */}
      {showFrom && <TokenModal tokens={tokens} exclude={toToken.addr} onSelect={t => { setFromToken(t); setQuote(null) }} onClose={() => setShowFrom(false)} />}
      {showTo   && <TokenModal tokens={tokens} exclude={fromToken.addr} onSelect={t => { setToToken(t); setQuote(null) }} onClose={() => setShowTo(false)} />}

      {/* Main widget */}
      <div className="p-3 space-y-2">
        {/* Header with chain selector */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-[#0A0B0D]">FlameSwap</span>
          <button onClick={() => setShowChains(true)}
            className="flex items-center gap-1.5 bg-[#F0F4FF] hover:bg-[#E6EEFF] border border-[#C7D7FF] rounded-xl px-2.5 py-1 text-xs font-bold text-[#0052FF] transition-colors">
            <span>{currentChain.icon}</span>
            <span>{currentChain.name}</span>
            <span className="text-[#8A919E]">▾</span>
          </button>
        </div>

        {/* From */}
        <div className="bg-[#F7F9FC] border border-[#E4E7EB] hover:border-[#0052FF]/30 rounded-2xl p-3.5 transition-colors">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[#8A919E]">Gönder</span>
            {address && ethBal && fromToken.addr === WETH9[chainId] && (
              <button onClick={() => setAmountIn(parseFloat(formatEther(ethBal.value)).toFixed(6))}
                className="text-[10px] text-[#0052FF] hover:underline">
                Bakiye: {parseFloat(formatEther(ethBal.value)).toFixed(4)}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input type="text" inputMode="decimal" placeholder="0.0" value={amountIn}
              onChange={e => setAmountIn(e.target.value.replace(/[^0-9.]/g, ''))}
              className="flex-1 bg-transparent text-2xl font-bold focus:outline-none placeholder-[#D0D5DD] min-w-0" />
            <button onClick={() => setShowFrom(true)}
              className="flex items-center gap-2 bg-white border border-[#E4E7EB] hover:border-[#0052FF] rounded-2xl pl-2 pr-3 py-2 transition-colors">
              <TokenLogo token={fromToken} size={24} />
              <span className="font-bold text-sm text-[#0A0B0D]">{fromToken.symbol}</span>
              <span className="text-[#8A919E] text-xs">▾</span>
            </button>
          </div>
        </div>

        {/* Flip */}
        <div className="flex justify-center -my-0.5">
          <button onClick={flip}
            className="w-9 h-9 bg-white border-2 border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF] rounded-xl flex items-center justify-center text-[#0052FF] transition-all active:scale-90">
            ⇅
          </button>
        </div>

        {/* To */}
        <div className="bg-[#F7F9FC] border border-[#E4E7EB] rounded-2xl p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[#8A919E]">Al</span>
            {qLoad && <span className="text-[10px] text-[#0052FF] animate-pulse">fiyat hesaplanıyor…</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 text-2xl font-bold min-w-0 truncate">
              {qLoad ? <span className="text-[#C5CDD6] text-lg animate-pulse">…</span>
                : outDisplay ? <span className="text-[#0A0B0D]">{outDisplay}</span>
                : <span className="text-[#D0D5DD]">0.0</span>}
            </div>
            <button onClick={() => setShowTo(true)}
              className="flex items-center gap-2 bg-white border border-[#E4E7EB] hover:border-[#0052FF] rounded-2xl pl-2 pr-3 py-2 transition-colors">
              <TokenLogo token={toToken} size={24} />
              <span className="font-bold text-sm text-[#0A0B0D]">{toToken.symbol}</span>
              <span className="text-[#8A919E] text-xs">▾</span>
            </button>
          </div>
        </div>

        {/* Route info */}
        {quote && !err && (
          <div className="bg-[#F7F9FC] rounded-xl px-3 py-2 flex justify-between text-[10px] text-[#8A919E]">
            <span>Uniswap v3 · Fee {(quote.fee / 10000).toFixed(2)}%</span>
            <span>Maks. slippage 5%</span>
          </div>
        )}

        {err && <p className="text-red-500 text-xs text-center px-1 break-words">{err}</p>}
        {status && !err && <p className="text-[#0052FF] text-xs text-center animate-pulse">{status}</p>}

        {/* CTA */}
        {txHash ? (
          <a href={(chainExplorer[chainId] || 'https://basescan.org/tx/') + txHash}
            target="_blank" rel="noreferrer"
            className="block w-full bg-green-500 text-white text-sm py-3.5 rounded-2xl font-bold text-center hover:bg-green-600 transition-colors">
            ✓ Swap tamamlandı! Explorer'da gör ↗
          </a>
        ) : (
          <button onClick={handleSwap}
            disabled={!address || !quote || !amountIn || swapping || qLoad}
            className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-95 disabled:opacity-40"
            style={{ background: !address || !quote || !amountIn || swapping || qLoad ? '#E4E7EB' : '#0052FF', color: !address || !quote || !amountIn || swapping || qLoad ? '#8A919E' : 'white' }}>
            {!address ? 'Cüzdan bağla'
              : swapping ? (status || 'Swap yapılıyor…')
              : qLoad ? 'Fiyat alınıyor…'
              : quote ? `${fromToken.symbol} → ${toToken.symbol} Swap`
              : 'Miktar gir'}
          </button>
        )}
      </div>
    </>
  )
}
