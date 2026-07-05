'use client'

import { ConnectButton, useConnectModal } from '@rainbow-me/rainbowkit'
import { useAccount, useWriteContract, useReadContract, usePublicClient, useBalance, useSwitchChain, useChainId, useDisconnect, useConnect } from 'wagmi'
import { sdk as fcSdk } from '@farcaster/miniapp-sdk'
import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react'
import { parseEther, formatEther, erc20Abi, encodeFunctionData, keccak256, toHex } from 'viem'
import { base } from 'wagmi/chains'
import dynamic from 'next/dynamic'
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/contract'
import { BUILDER_CODE_DATA_SUFFIX } from '../lib/builderCode'
import { T, LANG_LABELS, type Lang } from '../lib/i18n'
import { TOOLS_ADDRESS, TOKEN_FACTORY_ADDRESS, NFT_FACTORY_ADDRESS, DAO_ADDRESS, FOLLOW_ADDRESS, TOOLS_ABI, TOKEN_FACTORY_ABI, NFT_FACTORY_ABI, DAO_ABI, FOLLOW_ABI, FLAME_NFT_ADDRESS, FLAME_NFT_ABI, B20_FACTORY_ADDRESS, B20_FACTORY_ABI, encodeB20AssetCreateParams, encodeB20BatchMintInitCall } from '../lib/toolsContracts'
import { SFX, isSoundEnabled, setSoundEnabled } from '../lib/sounds'
import { ToastStack, type ToastItem, type ToastKind } from '../components/Toast'
import Avatar, { IPFS_GATEWAYS } from '../components/Avatar'

const Messages = dynamic(() => import('../components/Messages'), { ssr: false, loading: () => <div className="p-8 text-center text-[#5B6271]">💬 Loading…</div> })
const AIChat = dynamic(() => import('../components/AIChat'), { ssr: false, loading: () => <div className="p-8 text-center text-[#5B6271]">🤖 Loading AI…</div> })
const Reels = dynamic(() => import('../components/Reels'), { ssr: false, loading: () => <div className="p-8 text-center text-[#5B6271]">🎬 Loading Reels…</div> })
const TokenAnalyzer = dynamic(() => import('../components/TokenAnalyzer'), { ssr: false, loading: () => <div className="p-8 text-center text-[#5B6271]">🔍 Loading…</div> })
const WalletChecker = dynamic(() => import('../components/WalletChecker'), { ssr: false, loading: () => <div className="p-3 text-center text-[#5B6271] text-xs">Loading…</div> })

const TOOLS_DEPLOYED = TOOLS_ADDRESS.length > 0
const TOKEN_FACTORY_DEPLOYED = TOKEN_FACTORY_ADDRESS.length > 0
const NFT_FACTORY_DEPLOYED = NFT_FACTORY_ADDRESS.length > 0
const DAO_DEPLOYED = DAO_ADDRESS.length > 0
const FOLLOW_DEPLOYED = FOLLOW_ADDRESS.length > 0
const B20_FACTORY_DEPLOYED = B20_FACTORY_ADDRESS.length > 0
// Base hasn't activated the B20 ASSET variant on mainnet yet (createB20 reverts
// FeatureNotActivated 0xb9b2a425). Keep the deploy path gated until it goes live.
const B20_ACTIVATED: boolean = false

const ADMIN_ADDRESS = '0xa77A5D4D37d6F39C20C2441295da9fA60Ab9fD69'
const FLM_TOKEN_ADDRESS = '0xadead5e8ca2893be6e8239cbbae83049a701cb07'
// Buy/trade link. Uniswap's web app chokes on this token's Uniswap-V4 / Clanker
// pool (fails swaps, shows $0), so point buyers at DexScreener, which renders
// the live pool and routes trades correctly for V4/Clanker tokens.
const FLM_TRADE_URL = `https://dexscreener.com/base/${FLM_TOKEN_ADDRESS}`

interface Post {
  id: bigint
  author: string
  content: string
  ipfsHash: string
  timestamp: bigint
  likes: bigint
  tips: bigint
}

interface Comment {
  commenter: string
  text: string
  timestamp: bigint
}

interface Proposal {
  id: bigint
  proposer: string
  title: string
  description: string
  votesFor: bigint
  votesAgainst: bigint
  deadline: bigint
}

function streakBadge(days: number): { emoji: string; label: string } {
  if (days >= 30) return { emoji: '👑', label: 'Legend' }
  if (days >= 14) return { emoji: '⚡', label: 'Inferno' }
  if (days >= 7) return { emoji: '🔥🔥🔥', label: 'Blaze' }
  if (days >= 3) return { emoji: '🔥🔥', label: 'Flame' }
  if (days >= 1) return { emoji: '🔥', label: 'Spark' }
  return { emoji: '', label: 'No streak yet' }
}

interface ProfileData {
  username: string
  avatarHash: string
  exists: boolean
  flames: bigint
  tips: bigint
}

type Tab = 'feed' | 'post' | 'activity' | 'messages' | 'profile' | 'ai' | 'reels' | 'tools'

function FlameLogo({ size = 32 }: { size?: number }) {
  return (
    <img src="/logo.png" alt="FlameBase" width={size} height={size} className="flex-shrink-0 object-contain" />
  )
}

function VerifiedBadge({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const cls = size === 'lg'
    ? 'w-6 h-6'
    : 'w-4 h-4'
  return (
    <span
      title="Coinbase Verified Account"
      className={`inline-flex items-center justify-center ${cls} rounded-full bg-[#0052FF] flex-shrink-0`}
    >
      <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5">
        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

function IpfsImage({ hash, className, alt = '' }: { hash: string; className?: string; alt?: string }) {
  const [gatewayIndex, setGatewayIndex] = useState(0)
  const src = IPFS_GATEWAYS[gatewayIndex] + hash
  return (
    <img
      src={src}
      className={`max-w-full ${className ?? ''}`}
      alt={alt}
      onError={() => {
        if (gatewayIndex < IPFS_GATEWAYS.length - 1) setGatewayIndex(i => i + 1)
      }}
    />
  )
}

function IpfsVideo({ hash, className }: { hash: string; className?: string }) {
  const [gatewayIndex, setGatewayIndex] = useState(0)
  const src = IPFS_GATEWAYS[gatewayIndex] + hash
  return (
    <video
      src={src}
      controls
      playsInline
      className={`max-w-full ${className ?? ''}`}
      onError={() => {
        if (gatewayIndex < IPFS_GATEWAYS.length - 1) setGatewayIndex(i => i + 1)
      }}
    />
  )
}

function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  const emojis = [
    '😀','😂','😍','🥰','😊','😎','🤔','😢','😅','🙏',
    '👍','👎','❤️','🔥','✨','💯','🎉','🙌','💪','🤝',
    '😏','🤩','😤','🥳','😭','🥺','😡','🤗','😜','🤪',
    '🌟','💫','⚡','🎯','🚀','💎','🏆','💸','😈','🤣',
    '👀','💀','🫡','🤯','🎊','🌈','🍀','🐐','💥','🫶',
  ]
  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-[#F0F2F5] transition-colors text-xl"
        title="Add emoji"
      >
        😊
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute z-30 bottom-full mb-2 left-0 bg-white border border-[#E4E7EB] rounded-2xl shadow-xl p-3 w-72">
            <div className="grid grid-cols-10 gap-0.5">
              {emojis.map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => { onSelect(e); setOpen(false) }}
                  className="w-[26px] h-[26px] flex items-center justify-center text-lg hover:bg-[#F0F2F5] rounded-lg transition-colors"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ConnectPrompt({ message, label = 'Connect Wallet', onConnect }: { message: string; label?: string; onConnect?: () => void }) {
  return (
    <div className="bg-white border border-[#E4E7EB] rounded-2xl p-8 text-center shadow-sm">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#E6EEFF] flex items-center justify-center mb-4">
        <span className="text-2xl">🔐</span>
      </div>
      <p className="text-[#0A0B0D] font-bold mb-1 text-lg">{label}</p>
      <p className="text-[#5B6271] text-sm mb-6">{message}</p>
      <div className="flex justify-center">
        {onConnect ? (
          <button onClick={onConnect}
            className="bg-[#0052FF] hover:bg-[#1652F0] text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors">
            {label}
          </button>
        ) : (
          <ConnectButton />
        )}
      </div>
    </div>
  )
}

function AITabContent() {
  const [aiSubTab, setAiSubTab] = useState<'chat' | 'analyze'>('chat')
  return (
    <div>
      <div className="flex border-b border-[#E4E7EB] px-4 gap-1 pt-2">
        {([['chat', '🤖 AI Chat'], ['analyze', '🔍 Token Analyzer']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setAiSubTab(id)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-xl transition-colors ${aiSubTab === id ? 'bg-[#F0F4FF] text-[#0052FF] border-b-2 border-[#0052FF]' : 'text-[#5B6271] hover:text-[#0A0B0D]'}`}>
            {label}
          </button>
        ))}
      </div>
      {aiSubTab === 'chat' ? <AIChat /> : <TokenAnalyzer />}
    </div>
  )
}

export default function Home() {
  const { address, isConnected, connector } = useAccount()
  const { disconnect } = useDisconnect()
  const { connect, connectors: wagmiConnectors } = useConnect()
  const chainId = useChainId()
  const { switchChain, switchChainAsync } = useSwitchChain()
  const { openConnectModal } = useConnectModal()
  const [isInFarcaster, setIsInFarcaster] = useState(false)
  const [showWalletSheet, setShowWalletSheet] = useState(false)

  // On mobile browsers without an injected wallet, show the direct-link
  // sheet; everywhere else (desktop, wallet in-app browsers) the RainbowKit
  // modal works fine.
  const openWallet = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768 && !(window as unknown as { ethereum?: unknown }).ethereum) {
      setShowWalletSheet(true)
    } else {
      openConnectModal?.()
    }
  }, [openConnectModal])

  // PWA install prompt (Chrome fires beforeinstallprompt when installable)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [installDismissed, setInstallDismissed] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Token-gated posts: postId -> whether the connected wallet holds enough tokens
  const [gateUnlocked, setGateUnlocked] = useState<Record<string, boolean>>({})

  useEffect(() => {
    fcSdk.isInMiniApp().then(setIsInFarcaster).catch(() => setIsInFarcaster(false))
  }, [])

  const connectFarcaster = useCallback(() => {
    const fc = wagmiConnectors.find(c => c.id === 'farcaster')
    if (fc) connect({ connector: fc, chainId: base.id })
  }, [connect, wagmiConnectors])
  const [activeTab, setActiveTab] = useState<Tab>('feed')
  const [reelsEverOpened, setReelsEverOpened] = useState(false)
  const [aiEverOpened, setAiEverOpened] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  // Hydrate theme from localStorage on mount, then sync to <html data-theme>.
  useEffect(() => {
    const saved = (localStorage.getItem('flamebase_theme') as 'light' | 'dark' | null) || 'light'
    setTheme(saved)
  }, [])
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('flamebase_theme', theme)
  }, [theme])
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark')

  // Sound on/off — persists in localStorage, default off.
  const [soundOn, setSoundOn] = useState(false)
  useEffect(() => { setSoundOn(isSoundEnabled()) }, [])
  const toggleSound = () => { const next = !soundOn; setSoundOn(next); setSoundEnabled(next); if (next) SFX.click() }

  // Toast stack — append via showToast(), auto-dismiss handled inside ToastStack.
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const showToast = useCallback((kind: ToastKind, message: string) => {
    setToasts(prev => [...prev, { id: Date.now() + Math.random(), kind, message }])
    if (kind === 'success') SFX.notify()
    else if (kind === 'error') SFX.error()
  }, [])
  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Track which post was just liked so we can run the bounce animation once.
  const [animatingLike, setAnimatingLike] = useState<string | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [seenActivity, setSeenActivity] = useState<Record<string, number>>({})

  // Deep-link: /post/<id> redirects into the app as /?post=<id>. Once the feed
  // has that post in the DOM, jump to it and flash a highlight. Runs at most
  // once per load (retries as posts stream in until the target appears).
  const deepLinkedRef = useRef(false)
  useEffect(() => {
    if (deepLinkedRef.current || typeof window === 'undefined') return
    const pid = new URLSearchParams(window.location.search).get('post')
    if (!pid) { deepLinkedRef.current = true; return }
    // Make sure we're on the feed first — the post article only renders there,
    // so switching tabs is required before the element can be found/scrolled to.
    setActiveTab('feed')
    const el = document.getElementById(`post-${pid}`)
    if (!el) return
    deepLinkedRef.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.style.transition = 'background-color 1s'
    el.style.backgroundColor = '#EAF1FF'
    setTimeout(() => { el.style.backgroundColor = '' }, 2000)
  }, [posts])

  // Derive unseen activity count: likes+comments on user's posts since last visit to activity tab
  const myPosts = address ? posts.filter(p => p.author.toLowerCase() === address.toLowerCase()) : []
  const activityCount = myPosts.reduce((sum, p) => {
    const key = p.id.toString()
    const prev = seenActivity[key] ?? 0
    // Count new likes only — tips are a wei AMOUNT, not a count, so adding them
    // blew the badge up to absurd numbers whenever a post got tipped.
    const current = Number(p.likes)
    return sum + Math.max(0, current - prev)
  }, 0)
  const [profiles, setProfiles] = useState<Record<string, ProfileData>>({})
  const [newPost, setNewPost] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [tipAmounts, setTipAmounts] = useState<Record<string, string>>({})
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({})
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({})
  const [postComments, setPostComments] = useState<Record<string, Comment[]>>({})
  const [replyingTo, setReplyingTo] = useState<Record<string, string>>({})
  const [nextPostIndex, setNextPostIndex] = useState<number | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [allPostsLoaded, setAllPostsLoaded] = useState(false)
  const [lang, setLang] = useState<Lang>('en')
  const t = (key: string, vars?: Record<string, string>) => {
    let str = T[lang][key] || T['en'][key] || key
    if (vars) Object.entries(vars).forEach(([k, v]) => { str = str.replace(`{${k}}`, v) })
    return str
  }
  const [loading, setLoading] = useState(false)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [ethPrice, setEthPrice] = useState(2500)
  const [txLog, setTxLog] = useState<Array<{ hash: string; type: string; time: number; pending?: boolean }>>([])
  const [showTerminal, setShowTerminal] = useState(false)
  const publicClient = usePublicClient()
  const { writeContractAsync: rawWriteContract } = useWriteContract()

  // Wrap writeContractAsync: auto-switch to Base if needed, then log tx
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writeContractAsync = async (config: any, type?: string) => {
    // Pre-flight simulate the call so a guaranteed on-chain revert surfaces its
    // REAL reason (e.g. "Insufficient fee", "Create profile first", "Profile
    // exists", "Post not found") instead of the wallet's opaque error. The Base
    // App's Smart Wallet rejects reverting txs at sign time with only
    // "transaction cannot be signed", giving the user no idea what's wrong — so
    // we catch the revert here first. Best-effort: only block on an actual
    // contract revert (it carries a reason string); transient RPC/simulation
    // noise falls through so a valid tx is never blocked.
    if (publicClient && address && config?.abi && config?.functionName) {
      try {
        await publicClient.simulateContract({
          address: config.address,
          abi: config.abi,
          functionName: config.functionName,
          args: config.args,
          value: config.value,
          account: address,
        })
      } catch (simErr: any) {
        // Walk the viem error chain to decide: is this a genuine CONTRACT
        // REVERT (the call WILL fail on-chain — block it and show the reason),
        // or just RPC/transport noise (rate limit, timeout — let the tx through
        // so a valid action is never blocked by a flaky public node)?
        //
        // Previously this only blocked on a hardcoded allowlist of reason
        // strings. Any other revert reason ("Already followed", "Already
        // voted", "Cannot tip yourself", a custom error, …) slipped through —
        // the user signed, gas burned, and the wallet showed a bare "failed"
        // with no explanation. Now ANY detected revert is surfaced up front.
        let node: any = simErr
        let isRevert = false
        let reason = ''
        for (let i = 0; node && i < 8; i++) {
          const name: string = node?.name || ''
          if (name === 'ContractFunctionRevertedError') {
            isRevert = true
            reason = node?.reason || node?.shortMessage || reason
            break
          }
          const sm: string = (node?.shortMessage || '').toString()
          if (/revert|execution reverted/i.test(sm)) { isRevert = true; if (!reason) reason = sm }
          node = node?.cause
        }
        if (isRevert) {
          if (!reason) reason = simErr?.shortMessage || simErr?.details || (simErr instanceof Error ? simErr.message : '') || 'transaction would revert'
          const reasonMatch = reason.match(/reverted with the following reason:\s*(.+)/i)
          // Custom error our ABI can't decode to a name: viem's message ends
          // with "...following signature:\n0xabcd1234" — the selector is on
          // the NEXT line, so a plain split('\n')[0] above used to discard it
          // and show a sentence fragment with no actual information.
          const sigMatch = reason.match(/reverted with the following signature:\s*\n?\s*(0x[0-9a-fA-F]+)/i)
          const clean = (reasonMatch?.[1] || (sigMatch ? `unrecognized error ${sigMatch[1]}` : reason.split('\n')[0])).trim()
          throw new Error(`CONTRACT_REVERT:${clean}`)
        }
      }
    }

    const isSmartWalletMiniApp = connector?.id === 'farcaster'

    let hash: `0x${string}` | undefined
    let pendingId: string | undefined

    // The Base App's in-app Smart Wallet (Coinbase Smart Wallet) frequently
    // fails the classic eth_sendTransaction path for contract calls with a bare
    // "transaction cannot be signed. try again" — but it implements EIP-5792
    // wallet_sendCalls. Route smart-wallet contract writes through that. If the
    // wallet doesn't support the method, fall back to the classic path so
    // behaviour is never worse than before (a genuine failure/rejection is
    // surfaced, not retried, to avoid a double prompt).
    if (isSmartWalletMiniApp && address && config?.abi && config?.functionName) {
      try {
        const provider: any = await connector?.getProvider()
        if (!provider) throw new Error('no provider')
        const data = encodeFunctionData({ abi: config.abi, functionName: config.functionName, args: config.args ?? [] })
        const call: any = { to: config.address, data }
        if (config.value) call.value = `0x${BigInt(config.value).toString(16)}`
        const chainIdHex = `0x${base.id.toString(16)}`

        // EIP-5792 changed shape across versions. The Base App / Farcaster
        // hosts updated their wallets (Beryl, 2026-06-25) to the "2.0.0" spec,
        // which rejects our old "1.0" payload with "method not supported",
        // dropping us onto the classic path the smart wallet can't sign — so
        // every action broke. Try the current "2.0.0" shape first, then fall
        // back to legacy "1.0" for older hosts. Only a genuine method-missing
        // / invalid-params error advances to the next shape; a user rejection
        // or other real failure is rethrown.
        const shapes = [
          { version: '2.0.0', from: address, chainId: chainIdHex, atomicRequired: false, calls: [call] },
          { version: '1.0', chainId: chainIdHex, from: address, calls: [call] },
        ]
        let id: string | undefined
        let lastErr: any
        for (const params of shapes) {
          try {
            const res: any = await provider.request({ method: 'wallet_sendCalls', params: [params] })
            id = typeof res === 'string' ? res : res?.id
            break
          } catch (sendErr: any) {
            const code = sendErr?.code
            const msg = (sendErr?.message || '').toLowerCase()
            const userRejected =
              code === 4001 || msg.includes('user rejected') || msg.includes('user denied') || msg.includes('rejected the request')
            if (userRejected) throw sendErr
            // Wrong-shape signals: method unsupported (-32601/4200) or invalid
            // params (-32602) → try the next version. Anything else is a real
            // failure for this method; stop and let the classic path try.
            const wrongShape =
              code === -32601 || code === 4200 || code === -32602 ||
              msg.includes('not support') || msg.includes('unsupported') ||
              msg.includes('method not found') || msg.includes('invalid param')
            lastErr = sendErr
            if (!wrongShape) throw sendErr
          }
        }
        if (!id) throw lastErr || new Error('wallet_sendCalls failed')
        // Best-effort: resolve the bundle id to a real tx hash for the log.
        for (let i = 0; i < 8 && !hash; i++) {
          try {
            const st: any = await provider.request({ method: 'wallet_getCallsStatus', params: [id] })
            const h = st?.receipts?.[0]?.transactionHash
            if (h) hash = h as `0x${string}`
          } catch {}
          if (!hash) await new Promise(r => setTimeout(r, 1500))
        }
        // Didn't resolve in time — the bundle id is NOT a real tx hash (wrong
        // format for Basescan), so don't pass it off as one. Log it as
        // pending; the tx-log UI shows it without a (broken) explorer link.
        if (!hash) pendingId = id
      } catch (e: any) {
        // Only a deliberate user rejection stops here; ANY other error
        // (unsupported method, -32602 invalid params from a wallet that speaks
        // a different 5792 dialect, etc.) falls through to the classic path so
        // we never get stuck on the experimental route. The Farcaster wallet
        // returns -32602 for wallet_sendCalls — that must degrade gracefully.
        const m = (e?.message || '').toLowerCase()
        const userRejected =
          e?.code === 4001 || m.includes('user rejected') || m.includes('user denied') || m.includes('rejected the request')
        if (userRejected) throw e
      }
    }

    // Classic path (non-smart-wallet wallets, or smart wallets without 5792).
    // Always include chainId so wagmi auto-switches to Base before sending.
    // dataSuffix appends Base Builder Code so every tx is attributed to
    // FlameBase (skipped for the smart-wallet mini-app — its preview can't
    // simulate the suffixed calldata).
    if (!hash) {
      try {
        hash = await rawWriteContract({
          ...config,
          chainId: base.id,
          ...(isSmartWalletMiniApp ? {} : { dataSuffix: BUILDER_CODE_DATA_SUFFIX }),
        })
      } catch (e: any) {
        // Tag mini-app failures so the diagnostic toast tells us the classic
        // path (eth_sendTransaction) is the one failing, with its real code.
        if (isSmartWalletMiniApp && e) {
          try { e.message = `classic:${e.message}` } catch {}
        }
        throw e
      }
    }
    if (hash || pendingId) {
      const entry = { hash: (hash || pendingId) as string, type: type || config?.functionName || 'tx', time: Date.now(), pending: !hash }
      setTxLog(prev => {
        const next = [entry, ...prev].slice(0, 50)
        localStorage.setItem('flamebase_tx_log', JSON.stringify(next))
        return next
      })
    }
    return hash
  }

  const txError = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : String(e)
    // A revert we caught in pre-flight simulation — show the contract's real
    // reason verbatim so the user knows exactly what to fix.
    if (msg.startsWith('CONTRACT_REVERT:')) return `⚠️ ${msg.slice('CONTRACT_REVERT:'.length).trim()}`
    // Diagnostic (Base App mini-app only): the in-app Smart Wallet swallows the
    // real reason behind its own opaque "transaction cannot be signed" toast.
    // Surface the raw provider error (code + first line) so we can finally see
    // what it actually rejects on. Other wallets keep the clean messages below.
    if (connector?.id === 'farcaster') {
      const code = (e as any)?.code
      const raw = ((e as any)?.shortMessage || (e as any)?.details || (e as any)?.cause?.message || msg || 'unknown')
        .toString().split('\n')[0].slice(0, 180)
      return `⚠️ ${raw}${code !== undefined && code !== null ? ` [code ${code}]` : ''}`
    }
    if (msg.toLowerCase().includes('user rejected') || msg.toLowerCase().includes('denied')) return t('errUserRejected')
    if (msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('funds')) return t('errInsufficientFunds')
    if (msg.toLowerCase().includes('chain') || msg.toLowerCase().includes('network')) return t('errWrongNetwork')
    if (msg.toLowerCase().includes('rpc') || msg.toLowerCase().includes('request failed') || msg.toLowerCase().includes('fetch')) return t('errNetworkError')
    return t('errTxFailed')
  }

  // $0.04 fixed fee in ETH — recalculated when ETH price updates
  const fixedFeeETH = (0.04 / ethPrice).toFixed(10)
  const fixedFee = parseEther(fixedFeeETH)
  // Contract default prices (must match FlameBase.sol constructor values)
  const DEFAULT_LIKE_PRICE = parseEther('0.0001')
  const DEFAULT_COMMENT_PRICE = parseEther('0.0003')
  const DEFAULT_POST_PRICE = parseEther('0.0002')
  const DEFAULT_PHOTO_PRICE = parseEther('0.0005')
  // Use the higher of contract price or fixedFee; fall back to contractDefault if price not loaded yet
  const effectiveFee = (contractFee: bigint | undefined, contractDefault: bigint) => {
    const base = contractFee !== undefined ? contractFee : contractDefault
    return base > fixedFee ? base : fixedFee
  }
  // Show real USD price based on what's actually sent
  const usdLabel = (ethAmount: bigint) => {
    const eth = Number(formatEther(ethAmount))
    const usd = eth * ethPrice
    return `$${usd.toFixed(2)}`
  }
  // NFT mint price fixed at $0.50 in ETH
  const nftMintPriceETH = (0.50 / ethPrice).toFixed(10)
  const nftMintPriceWei = parseEther(nftMintPriceETH)

  // New state variables
  const [hiddenPosts, setHiddenPosts] = useState<Set<string>>(new Set())
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [pendingDmTarget, setPendingDmTarget] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [notifications, setNotifications] = useState<Array<{type: 'like' | 'tip'; postId: string; delta: string; preview: string; timestamp: number}>>([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  // Tool form states
  const [counterLoading, setCounterLoading] = useState(false)
  const [streakLoading, setStreakLoading] = useState(false)
  const [logText, setLogText] = useState('')
  const [logLoading, setLogLoading] = useState(false)
  const [greetText, setGreetText] = useState('')
  const [greetLoading, setGreetLoading] = useState(false)
  const [tokenName, setTokenName] = useState('FlameBase')
  const [tokenSymbol, setTokenSymbol] = useState('FLAME')
  const [tokenSupply, setTokenSupply] = useState('1000000')
  const [tokenLoading, setTokenLoading] = useState(false)
  const [b20Name, setB20Name] = useState('FlameBase B20')
  const [b20Symbol, setB20Symbol] = useState('FB20')
  const [b20Supply, setB20Supply] = useState('1000000')
  const [b20Loading, setB20Loading] = useState(false)
  const [nftName, setNftName] = useState('FlameBase NFT')
  const [nftSymbol, setNftSymbol] = useState('FNFT')
  const [nftMaxSupply, setNftMaxSupply] = useState('1000')
  const [nftLoading, setNftLoading] = useState(false)
  const [daoTitle, setDaoTitle] = useState('')
  const [daoDesc, setDaoDesc] = useState('')
  const [daoLoading, setDaoLoading] = useState(false)
  const [proposalLoading, setProposalLoading] = useState<string | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [userVotes, setUserVotes] = useState<Record<string, boolean>>({})
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Unread message count from Messages component
  const [unreadMessages, setUnreadMessages] = useState(0)
  // Share popover state — which post's share menu is open + brief "copied" flash
  const [sharePost, setSharePost] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  // AI post improvement
  const [improving, setImproving] = useState(false)

  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set())
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [quotingPost, setQuotingPost] = useState<Post | null>(null)
  const [showPollCreator, setShowPollCreator] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState(['', ''])
  const [pollVotes, setPollVotes] = useState<Record<string, number>>({})
  const [boostedPosts, setBoostedPosts] = useState<Record<string, number>>({})
  const [tokenGateEnabled, setTokenGateEnabled] = useState(false)
  const [tokenGateAddress, setTokenGateAddress] = useState('')
  const [tokenGateMin, setTokenGateMin] = useState('1')

  // ── Feature state ──
  const [pushEnabled, setPushEnabled] = useState(false)
  const [translatedPosts, setTranslatedPosts] = useState<Record<string, string>>({})
  const [translatingPost, setTranslatingPost] = useState<string | null>(null)
  const [profileBanners, setProfileBanners] = useState<Record<string, string>>({})
  const [uploadingBanner, setUploadingBanner] = useState(false)
  const [premiumUsers, setPremiumUsers] = useState<Set<string>>(new Set())
  const [verifiedAddresses, setVerifiedAddresses] = useState<Record<string, boolean>>({})
  const [buyingPremium, setBuyingPremium] = useState(false)
  const [postViews, setPostViews] = useState<Record<string, number>>({})
  const seenInSession = useRef<Set<string>>(new Set())
  const [ensNames, setEnsNames] = useState<Record<string, string>>({})
  const [nfts, setNfts] = useState<Array<{name: string; image: string; collection: string}>>([])
  const [loadingNfts, setLoadingNfts] = useState(false)
  const [nftsFetched, setNftsFetched] = useState(false)
  const [deployingLogoNft, setDeployingLogoNft] = useState(false)
  const [mintingLogoNft, setMintingLogoNft] = useState(false)
  const [deployedLogoNftAddr, setDeployedLogoNftAddr] = useState<string>('')
  const [walletBannerDismissed, setWalletBannerDismissed] = useState(false)

  // Follow graph. When the FlameFollow contract is deployed the source of
  // truth is on-chain (getFollowing); localStorage acts only as an optimistic
  // cache so the UI feels instant. Before the contract is deployed it falls
  // back to localStorage-only so the feature still works.
  const [following, setFollowing] = useState<Set<string>>(new Set())

  // Profile: hide/show the ETH balance (persisted), and which relationship
  // list (following / followers) is currently expanded under the stats row.
  const [balanceHidden, setBalanceHidden] = useState(false)
  useEffect(() => {
    try { setBalanceHidden(localStorage.getItem('flamebase_hide_balance') === '1') } catch {}
  }, [])
  const toggleBalanceHidden = () => {
    setBalanceHidden(prev => {
      const next = !prev
      try { localStorage.setItem('flamebase_hide_balance', next ? '1' : '0') } catch {}
      return next
    })
  }
  const [profileList, setProfileList] = useState<null | 'following' | 'followers'>(null)
  const [followersList, setFollowersList] = useState<string[]>([])
  const [followersLoading, setFollowersLoading] = useState(false)

  const persistFollowing = useCallback((set: Set<string>) => {
    if (!address) return
    try { localStorage.setItem(`flamebase_following_${address.toLowerCase()}`, JSON.stringify([...set])) } catch {}
  }, [address])

  // Hydrate from localStorage immediately, then reconcile against chain.
  useEffect(() => {
    if (!address) { setFollowing(new Set()); return }
    try {
      const raw = localStorage.getItem(`flamebase_following_${address.toLowerCase()}`)
      if (raw) setFollowing(new Set(JSON.parse(raw)))
    } catch {}
    if (!FOLLOW_DEPLOYED || !publicClient) return
    let cancelled = false
    ;(async () => {
      try {
        const list = await publicClient.readContract({
          address: FOLLOW_ADDRESS, abi: FOLLOW_ABI, functionName: 'getFollowing', args: [address],
        }) as readonly string[]
        if (cancelled) return
        const onchain = new Set(list.map(a => a.toLowerCase()))
        setFollowing(onchain)
        persistFollowing(onchain)
      } catch (e) { console.error('Failed to load follow graph', e) }
    })()
    return () => { cancelled = true }
  }, [address, publicClient, persistFollowing])

  // My own follower count (the contract exposes a count but no follower list).
  const { data: myFollowerCount } = useReadContract({
    address: FOLLOW_ADDRESS,
    abi: FOLLOW_ABI,
    functionName: 'followerCount',
    args: address ? [address as `0x${string}`] : undefined,
    query: { enabled: FOLLOW_DEPLOYED && !!address },
  })

  // Resolve the follower LIST on demand (when the user opens it). There's no
  // on-chain getter for followers, so we gather candidate addresses (known
  // profiles, post authors, plus Followed-event logs when the RPC allows it)
  // and confirm each with isFollowing(candidate, me).
  useEffect(() => {
    if (profileList !== 'followers' || !address || !publicClient || !FOLLOW_DEPLOYED) return
    let cancelled = false
    ;(async () => {
      setFollowersLoading(true)
      try {
        const me = address.toLowerCase()
        let eventFollowers: string[] = []
        try {
          const logs = await publicClient.getLogs({
            address: FOLLOW_ADDRESS,
            event: {
              type: 'event', name: 'Followed',
              inputs: [
                { name: 'follower', type: 'address', indexed: true },
                { name: 'target', type: 'address', indexed: true },
              ],
            },
            args: { target: address as `0x${string}` },
            fromBlock: 0n,
            toBlock: 'latest',
          })
          eventFollowers = logs.map((l: any) => (l.args?.follower || '').toLowerCase()).filter(Boolean)
        } catch { /* RPC may reject a full-range getLogs — fall back to known addresses */ }

        const candidates = Array.from(new Set([
          ...Object.keys(profiles),
          ...posts.map(p => p.author.toLowerCase()),
          ...following,
          ...eventFollowers,
        ])).filter(a => a && a !== me)

        const checks = await Promise.all(candidates.map(async a => {
          try {
            const isF = await publicClient.readContract({
              address: FOLLOW_ADDRESS, abi: FOLLOW_ABI, functionName: 'isFollowing',
              args: [a as `0x${string}`, address as `0x${string}`],
            })
            return isF ? a : null
          } catch { return null }
        }))
        if (cancelled) return
        setFollowersList(checks.filter(Boolean) as string[])
      } finally {
        if (!cancelled) setFollowersLoading(false)
      }
    })()
    return () => { cancelled = true }
    // Fetch once each time the followers list is opened; intentionally not
    // re-running on every profiles/posts change while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileList, address, publicClient])

  const followUser = async (target: string) => {
    if (!address) return
    const t = target.toLowerCase()
    if (following.has(t)) return
    // Optimistic update.
    const next = new Set(following); next.add(t)
    setFollowing(next); persistFollowing(next)
    if (!FOLLOW_DEPLOYED) return
    setLoadingAction(`follow-${t}`)
    try {
      await writeContractAsync({ address: FOLLOW_ADDRESS, abi: FOLLOW_ABI, functionName: 'follow', args: [target as `0x${string}`], value: fixedFee }, 'follow')
      showToast('success', 'Followed on-chain 🤝')
    } catch (e) {
      console.error(e)
      const revert = new Set(next); revert.delete(t)
      setFollowing(revert); persistFollowing(revert)
      showToast('error', txError(e))
    }
    setLoadingAction(null)
  }

  const unfollowUser = async (target: string) => {
    if (!address) return
    const t = target.toLowerCase()
    if (!following.has(t)) return
    const next = new Set(following); next.delete(t)
    setFollowing(next); persistFollowing(next)
    if (!FOLLOW_DEPLOYED) return
    setLoadingAction(`follow-${t}`)
    try {
      await writeContractAsync({ address: FOLLOW_ADDRESS, abi: FOLLOW_ABI, functionName: 'unfollow', args: [target as `0x${string}`], value: fixedFee }, 'unfollow')
      showToast('success', 'Unfollowed on-chain')
    } catch (e) {
      console.error(e)
      const revert = new Set(next); revert.add(t)
      setFollowing(revert); persistFollowing(revert)
      showToast('error', txError(e))
    }
    setLoadingAction(null)
  }

  const { data: myProfile, refetch: refetchProfile } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'profiles',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  // Real on-chain follower/following counts for whoever's profile modal is open.
  const { data: selectedUserFollowerCount } = useReadContract({
    address: FOLLOW_ADDRESS,
    abi: FOLLOW_ABI,
    functionName: 'followerCount',
    args: selectedUser ? [selectedUser as `0x${string}`] : undefined,
    query: { enabled: FOLLOW_DEPLOYED && !!selectedUser },
  })
  const { data: selectedUserFollowingCount } = useReadContract({
    address: FOLLOW_ADDRESS,
    abi: FOLLOW_ABI,
    functionName: 'followingCount',
    args: selectedUser ? [selectedUser as `0x${string}`] : undefined,
    query: { enabled: FOLLOW_DEPLOYED && !!selectedUser },
  })

  // Keep the shared `profiles` cache in sync with the connected wallet's own
  // profile — otherwise <Avatar> only knows about authors of fetched posts,
  // so a freshly uploaded avatar never shows up for a user with 0 posts.
  useEffect(() => {
    if (!address || !myProfile) return
    setProfiles(prev => ({
      ...prev,
      [address.toLowerCase()]: { username: myProfile[0], avatarHash: myProfile[1], exists: myProfile[2], flames: myProfile[3], tips: myProfile[4] },
    }))
  }, [address, myProfile])

  const { data: postCount, refetch: refetchCount } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'postCount',
  })

  const { data: likePrice } = useReadContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'likePrice' })
  const { data: commentPrice } = useReadContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'commentPrice' })
  const { data: postPrice } = useReadContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'postPrice' })
  const { data: photoPrice } = useReadContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'photoPrice' })

  const { data: walletBalance, refetch: refetchBalance } = useBalance({
    address: address,
    query: { enabled: !!address },
  })

  // Tools read contracts
  const { data: globalCounter } = useReadContract({
    address: TOOLS_ADDRESS,
    abi: TOOLS_ABI,
    functionName: 'globalCounter',
    query: { enabled: TOOLS_DEPLOYED },
  })

  const { data: userCounter } = useReadContract({
    address: TOOLS_ADDRESS,
    abi: TOOLS_ABI,
    functionName: 'userCounters',
    args: address ? [address] : undefined,
    query: { enabled: TOOLS_DEPLOYED && !!address },
  })

  const { data: userStreakDays } = useReadContract({
    address: TOOLS_ADDRESS,
    abi: TOOLS_ABI,
    functionName: 'streakDays',
    args: address ? [address] : undefined,
    query: { enabled: TOOLS_DEPLOYED && !!address },
  })

  const { data: userMaxStreak } = useReadContract({
    address: TOOLS_ADDRESS,
    abi: TOOLS_ABI,
    functionName: 'maxStreak',
    args: address ? [address] : undefined,
    query: { enabled: TOOLS_DEPLOYED && !!address },
  })

  const { data: canCheckIn } = useReadContract({
    address: TOOLS_ADDRESS,
    abi: TOOLS_ABI,
    functionName: 'canCheckInToday',
    args: address ? [address] : undefined,
    query: { enabled: TOOLS_DEPLOYED && !!address },
  })

  const { data: userGreeting } = useReadContract({
    address: TOOLS_ADDRESS,
    abi: TOOLS_ABI,
    functionName: 'greetings',
    args: address ? [address] : undefined,
    query: { enabled: TOOLS_DEPLOYED && !!address },
  })

  const { data: tokenCount } = useReadContract({
    address: TOKEN_FACTORY_ADDRESS,
    abi: TOKEN_FACTORY_ABI,
    functionName: 'tokenCount',
    query: { enabled: TOKEN_FACTORY_DEPLOYED },
  })

  const { data: nftCollectionCount } = useReadContract({
    address: NFT_FACTORY_ADDRESS,
    abi: NFT_FACTORY_ABI,
    functionName: 'collectionCount',
    query: { enabled: NFT_FACTORY_DEPLOYED },
  })

  const { data: proposalCount } = useReadContract({
    address: DAO_ADDRESS,
    abi: DAO_ABI,
    functionName: 'proposalCount',
    query: { enabled: DAO_DEPLOYED },
  })

  // Load all DAO proposals (newest first) whenever the count changes.
  const refetchProposals = useCallback(async () => {
    if (!publicClient || !DAO_DEPLOYED || !proposalCount) { setProposals([]); return }
    const count = Number(proposalCount)
    if (count === 0) { setProposals([]); return }
    try {
      const ids = Array.from({ length: count }, (_, i) => count - 1 - i)
      const results = await Promise.all(
        ids.map(id => publicClient.readContract({ address: DAO_ADDRESS, abi: DAO_ABI, functionName: 'getProposal', args: [BigInt(id)] }))
      )
      setProposals(results as unknown as Proposal[])
    } catch (e) { console.error('Failed to load proposals', e) }
  }, [publicClient, proposalCount])

  useEffect(() => { refetchProposals() }, [refetchProposals])

  // Check which proposals the connected wallet has already voted on.
  useEffect(() => {
    if (!publicClient || !address || proposals.length === 0) { setUserVotes({}); return }
    let cancelled = false
    ;(async () => {
      const entries = await Promise.all(proposals.map(async p => {
        const voted = await publicClient.readContract({ address: DAO_ADDRESS, abi: DAO_ABI, functionName: 'hasVoted', args: [p.id, address] })
        return [p.id.toString(), voted as boolean] as const
      }))
      if (!cancelled) setUserVotes(Object.fromEntries(entries))
    })()
    return () => { cancelled = true }
  }, [publicClient, address, proposals])

  const voteOnProposal = async (id: bigint, support: boolean) => {
    setProposalLoading(`${id}-${support}`)
    try {
      await writeContractAsync({ address: DAO_ADDRESS, abi: DAO_ABI, functionName: 'vote', args: [id, support], value: fixedFee }, 'vote')
      setUserVotes(prev => ({ ...prev, [id.toString()]: true }))
      setProposals(prev => prev.map(p => p.id === id
        ? { ...p, votesFor: support ? p.votesFor + 1n : p.votesFor, votesAgainst: !support ? p.votesAgainst + 1n : p.votesAgainst }
        : p))
      showToast('success', 'Vote cast on-chain 🗳️')
    } catch (e) {
      console.error(e)
      showToast('error', txError(e))
    }
    setProposalLoading(null)
  }

  const renderProposalsList = () => (
    <div className="mt-3 space-y-2 max-h-80 overflow-y-auto">
      {proposals.length === 0 && (
        <p className="text-[10px] text-[#8A919E] text-center py-2">No proposals yet</p>
      )}
      {proposals.map(p => {
        const voted = userVotes[p.id.toString()]
        const ended = Number(p.deadline) * 1000 < Date.now()
        const totalVotes = p.votesFor + p.votesAgainst
        const forPct = totalVotes > 0n ? Number((p.votesFor * 100n) / totalVotes) : 0
        return (
          <div key={p.id.toString()} className="bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg p-2.5">
            <p className="text-xs font-bold text-[#0A0B0D] truncate">{p.title}</p>
            {p.description && <p className="text-[10px] text-[#5B6271] mt-0.5 line-clamp-2">{p.description}</p>}
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="flex-1 h-1.5 bg-[#E4E7EB] rounded-full overflow-hidden">
                <div className="h-full bg-[#0052FF]" style={{ width: `${forPct}%` }} />
              </div>
              <span className="text-[10px] text-[#8A919E] font-semibold whitespace-nowrap">{p.votesFor.toString()} / {p.votesAgainst.toString()}</span>
            </div>
            {ended ? (
              <p className="text-[10px] text-[#8A919E] font-semibold mt-1.5">Voting ended</p>
            ) : voted ? (
              <p className="text-[10px] text-green-600 font-semibold mt-1.5">✓ You voted</p>
            ) : (
              <div className="flex gap-1.5 mt-1.5">
                <button onClick={() => voteOnProposal(p.id, true)} disabled={!isConnected || proposalLoading === `${p.id}-true`}
                  className="flex-1 bg-green-50 text-green-600 hover:bg-green-100 text-[10px] font-bold py-1.5 rounded-md disabled:opacity-40">
                  {proposalLoading === `${p.id}-true` ? '…' : '👍 Yes'}
                </button>
                <button onClick={() => voteOnProposal(p.id, false)} disabled={!isConnected || proposalLoading === `${p.id}-false`}
                  className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 text-[10px] font-bold py-1.5 rounded-md disabled:opacity-40">
                  {proposalLoading === `${p.id}-false` ? '…' : '👎 No'}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // Resolve which Logo NFT address to use: env var, or locally deployed (admin only, current session)
  const logoNftAddr = (FLAME_NFT_ADDRESS || deployedLogoNftAddr) as `0x${string}`
  const logoNftDeployed = logoNftAddr.length > 0

  const { data: logoNftTotalSupply, refetch: refetchLogoNftSupply } = useReadContract({
    address: logoNftAddr,
    abi: FLAME_NFT_ABI,
    functionName: 'totalSupply',
    query: { enabled: logoNftDeployed },
  })
  const { data: logoNftMaxSupply } = useReadContract({
    address: logoNftAddr,
    abi: FLAME_NFT_ABI,
    functionName: 'maxSupply',
    query: { enabled: logoNftDeployed },
  })
  const { data: logoNftMintPrice } = useReadContract({
    address: logoNftAddr,
    abi: FLAME_NFT_ABI,
    functionName: 'mintPrice',
    query: { enabled: logoNftDeployed },
  })
  const { data: logoNftBalance, refetch: refetchLogoNftBalance } = useReadContract({
    address: logoNftAddr,
    abi: FLAME_NFT_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: logoNftDeployed && !!address },
  })

  const hasProfile = myProfile && myProfile[2]
  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase()
  const isWrongNetwork = isConnected && chainId !== base.id

  // Fetch ETH price for $0.04 calculation
  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
      .then(r => r.json())
      // Clamp to a sane range so a bad/manipulated price feed can't inflate the
      // ETH value of any fee/tip (fee = usd / ethPrice — a tiny price would blow
      // the value up). $100–$100k covers any realistic ETH price.
      .then(d => { const p = Number(d?.ethereum?.usd); if (p >= 100 && p <= 100000) setEthPrice(p) })
      .catch(() => {})
  }, [])

  // Auto-switch to Base on connect / whenever the wallet lands on another
  // chain. Use the async form and swallow rejections so a wallet that declines
  // (or is slow) doesn't throw; the global "wrong network" banner is the manual
  // fallback.
  useEffect(() => {
    if (isConnected && chainId !== base.id) {
      switchChainAsync({ chainId: base.id }).catch(() => {})
    }
  }, [isConnected, chainId, switchChainAsync])

  // Load hidden posts from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('flamebase_hidden_posts')
    if (stored) setHiddenPosts(new Set(JSON.parse(stored)))
    const txStored = localStorage.getItem('flamebase_tx_log')
    if (txStored) {
      try { setTxLog(JSON.parse(txStored)) } catch {}
    }
    const actStored = localStorage.getItem('flamebase_seen_activity')
    if (actStored) {
      try { setSeenActivity(JSON.parse(actStored)) } catch {}
    }
    const bkStored = localStorage.getItem('flamebase_bookmarks')
    if (bkStored) { try { setBookmarks(new Set(JSON.parse(bkStored))) } catch {} }
    const boostStored = localStorage.getItem('flamebase_boosted')
    if (boostStored) { try { const p = JSON.parse(boostStored) as Record<string, number>; const now = Date.now(); setBoostedPosts(Object.fromEntries(Object.entries(p).filter(([,v]) => v > now))) } catch {} }
    const pvStored = localStorage.getItem('flamebase_poll_votes')
    if (pvStored) { try { setPollVotes(JSON.parse(pvStored)) } catch {} }
    if (localStorage.getItem('flamebase_push') === 'true' && typeof Notification !== 'undefined' && Notification.permission === 'granted') setPushEnabled(true)
    const bannerStored = localStorage.getItem('flamebase_banners')
    if (bannerStored) { try { setProfileBanners(JSON.parse(bannerStored)) } catch {} }
    const premiumStored = localStorage.getItem('flamebase_premium')
    if (premiumStored) { try { setPremiumUsers(new Set(JSON.parse(premiumStored))) } catch {} }
    const viewsStored = localStorage.getItem('flamebase_views')
    if (viewsStored) { try { setPostViews(JSON.parse(viewsStored)) } catch {} }
  }, [])

  // Notifications: detect new likes AND tips on the connected user's posts
  // by comparing each post's current count against the snapshot in localStorage.
  useEffect(() => {
    if (!address || posts.length === 0) return
    const myPosts = posts.filter(p => p.author.toLowerCase() === address.toLowerCase())
    if (myPosts.length === 0) return

    const likesRaw = localStorage.getItem('flamebase_last_likes')
    const tipsRaw = localStorage.getItem('flamebase_last_tips')
    const lastLikes: Record<string, string> = likesRaw ? JSON.parse(likesRaw) : {}
    const lastTips: Record<string, string> = tipsRaw ? JSON.parse(tipsRaw) : {}
    const firstSeen = !likesRaw && !tipsRaw  // skip notifs on initial load

    const newNotifs: Array<{type: 'like' | 'tip'; postId: string; delta: string; preview: string; timestamp: number}> = []
    const nextLikes: Record<string, string> = {}
    const nextTips: Record<string, string> = {}

    for (const post of myPosts) {
      const key = post.id.toString()
      const prevLikes = BigInt(lastLikes[key] || '0')
      const prevTips = BigInt(lastTips[key] || '0')
      const preview = post.content ? post.content.slice(0, 60) : (post.ipfsHash ? '📎 media post' : '')

      if (!firstSeen && post.likes > prevLikes) {
        newNotifs.push({
          type: 'like', postId: key,
          delta: (post.likes - prevLikes).toString(),
          preview, timestamp: Date.now(),
        })
      }
      if (!firstSeen && post.tips > prevTips) {
        newNotifs.push({
          type: 'tip', postId: key,
          delta: parseFloat(formatEther(post.tips - prevTips)).toFixed(4),
          preview, timestamp: Date.now(),
        })
      }
      nextLikes[key] = post.likes.toString()
      nextTips[key] = post.tips.toString()
    }

    if (newNotifs.length > 0) {
      setNotifications(prev => [...newNotifs, ...prev].slice(0, 30))
    }
    localStorage.setItem('flamebase_last_likes', JSON.stringify(nextLikes))
    localStorage.setItem('flamebase_last_tips', JSON.stringify(nextTips))
  }, [posts, address])

  useEffect(() => {
    if (!pushEnabled || notifications.length === 0) return
    const latest = notifications[0]
    if (Date.now() - latest.timestamp < 8000 && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('FlameBase 🔥', {
        body: latest.type === 'tip' ? `💸 You received ${latest.delta} ETH in tips!` : `🔥 +${latest.delta} new flames on your post!`,
        icon: '/icon.png',
      })
    }
  }, [notifications, pushEnabled])

  const fetchProfileData = useCallback(async (addr: string): Promise<ProfileData | null> => {
    if (!publicClient) return null
    try {
      const data = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'profiles',
        args: [addr as `0x${string}`],
      }) as [string, string, boolean, bigint, bigint]
      return { username: data[0], avatarHash: data[1], exists: data[2], flames: data[3], tips: data[4] }
    } catch { return null }
  }, [publicClient])

  const BATCH = 20

  const loadPostsBatch = useCallback(async (fromIndex: number, append: boolean) => {
    if (!publicClient) return
    setLoadingMore(true)
    const stopAt = Math.max(0, fromIndex - BATCH + 1)
    const indices = Array.from({ length: fromIndex - stopAt + 1 }, (_, k) => fromIndex - k)
    const results = await Promise.allSettled(
      indices.map(i => publicClient.readContract({
        address: CONTRACT_ADDRESS, abi: CONTRACT_ABI,
        functionName: 'getPost', args: [BigInt(i)],
      }) as Promise<Post>)
    )
    const fetched = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : [])
    const authors = new Set(fetched.map(p => p.author.toLowerCase()))
    if (append) setPosts(prev => [...prev, ...fetched])
    else setPosts(fetched)
    const nextIdx = stopAt - 1
    if (nextIdx < 0) { setAllPostsLoaded(true); setNextPostIndex(null) }
    else setNextPostIndex(nextIdx)
    const profileResults = await Promise.allSettled([...authors].map(a => fetchProfileData(a)))
    const map: Record<string, ProfileData> = {}
    ;[...authors].forEach((a, i) => {
      const r = profileResults[i]
      if (r.status === 'fulfilled' && r.value) map[a] = r.value
    })
    setProfiles(prev => ({ ...prev, ...map }))
    setLoadingMore(false)
  }, [publicClient, fetchProfileData])

  useEffect(() => {
    if (!postCount || !publicClient) return
    const count = Number(postCount)
    if (count === 0) return
    setAllPostsLoaded(false)
    setNextPostIndex(null)
    setPosts([])
    loadPostsBatch(count - 1, false)
  }, [postCount, publicClient, loadPostsBatch])

  useEffect(() => {
    const addrs = [...new Set(posts.map(p => p.author.toLowerCase()))]
    addrs.forEach(addr => {
      if (ensNames[addr] !== undefined) return
      setEnsNames(prev => ({ ...prev, [addr]: '' })) // mark as loading
      fetch(`https://api.ensideas.com/ens/resolve/${addr}`)
        .then(r => r.json())
        .then(d => { if (d?.name) setEnsNames(prev => ({ ...prev, [addr]: d.name })) })
        .catch(() => {})
    })
  }, [posts]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const addrs = [...new Set([
      ...posts.map(p => p.author.toLowerCase()),
      ...(address ? [address.toLowerCase()] : []),
      ...(selectedUser ? [selectedUser.toLowerCase()] : []),
    ])]
    addrs.forEach(addr => {
      if (verifiedAddresses[addr] !== undefined) return
      setVerifiedAddresses(prev => ({ ...prev, [addr]: false }))
      fetch(`/api/verified?address=${addr}`)
        .then(r => r.json())
        .then(d => { if (d?.verified) setVerifiedAddresses(prev => ({ ...prev, [addr]: true })) })
        .catch(() => {})
    })
  }, [posts, address, selectedUser]) // eslint-disable-line react-hooks/exhaustive-deps

  const getUsername = (addr: string) => {
    const ens = ensNames[addr.toLowerCase()]
    if (ens) return ens
    const p = profiles[addr.toLowerCase()]
    return p?.exists ? p.username : `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  // Check ERC-20 balances for token-gated posts so the gate actually works.
  useEffect(() => {
    if (!publicClient || !address) return
    posts.forEach(post => {
      const m = post.content?.match(/^\[GATE:(0x[a-fA-F0-9]{40}):(\d+)\]/)
      if (!m) return
      const key = post.id.toString()
      if (gateUnlocked[key] !== undefined) return
      const tokenAddr = m[1] as `0x${string}`
      ;(async () => {
        try {
          const [bal, dec] = await Promise.all([
            publicClient.readContract({ address: tokenAddr, abi: erc20Abi, functionName: 'balanceOf', args: [address] }),
            publicClient.readContract({ address: tokenAddr, abi: erc20Abi, functionName: 'decimals' }),
          ])
          const min = BigInt(m[2]) * 10n ** BigInt(dec)
          setGateUnlocked(prev => ({ ...prev, [key]: (bal as bigint) >= min }))
        } catch {
          setGateUnlocked(prev => ({ ...prev, [key]: false }))
        }
      })()
    })
  }, [posts, address, publicClient]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset gate results when the wallet changes
  useEffect(() => { setGateUnlocked({}) }, [address])

  // Infinite scroll: auto-load the next batch when the sentinel nears the viewport
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = loadMoreRef.current
    if (!el) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && nextPostIndex !== null && !loadingMore) {
        loadPostsBatch(nextPostIndex, true)
      }
    }, { rootMargin: '600px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [nextPostIndex, loadingMore, loadPostsBatch, activeTab])

  // Leaderboard: aggregate flames + tips per author from loaded posts
  const leaderboard = useMemo(() => {
    const acc: Record<string, { likes: number; tips: bigint }> = {}
    posts.forEach(p => {
      const a = p.author.toLowerCase()
      if (!acc[a]) acc[a] = { likes: 0, tips: 0n }
      acc[a].likes += Number(p.likes)
      acc[a].tips += p.tips
    })
    return Object.entries(acc)
      .map(([addr, s]) => ({ addr, ...s }))
      .sort((x, y) => (y.likes - x.likes) || (y.tips > x.tips ? 1 : y.tips < x.tips ? -1 : 0))
      .slice(0, 5)
  }, [posts])

  const loadComments = async (postId: string) => {
    if (!publicClient) return
    try {
      const comments = await publicClient.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'getPostComments',
        args: [BigInt(postId)],
      }) as Comment[]
      setPostComments(prev => ({ ...prev, [postId]: comments }))
      const newAuthors = new Set(comments.map(c => c.commenter.toLowerCase()))
      const missing = [...newAuthors].filter(a => !profiles[a])
      if (missing.length > 0) {
        const newMap: Record<string, ProfileData> = {}
        for (const a of missing) {
          const p = await fetchProfileData(a)
          if (p) newMap[a] = p
        }
        if (Object.keys(newMap).length > 0) setProfiles(prev => ({ ...prev, ...newMap }))
      }
    } catch {}
  }

  const toggleComments = async (postId: string) => {
    const next = !expandedComments[postId]
    setExpandedComments(prev => ({ ...prev, [postId]: next }))
    if (next && !postComments[postId]) await loadComments(postId)
  }

  // Prefetch comments for feed posts (once each) so the 💬 count is visible
  // without having to open each post first.
  const prefetchedComments = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (activeTab !== 'feed' || !publicClient) return
    const targets = posts.filter(p => {
      const k = p.id.toString()
      return !postComments[k] && !prefetchedComments.current.has(k)
    }).slice(0, 40)
    if (targets.length === 0) return
    targets.forEach(p => { prefetchedComments.current.add(p.id.toString()); loadComments(p.id.toString()) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, activeTab, publicClient])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    if (file && file.size > 50 * 1024 * 1024) {
      showToast('error', t('errFileTooLarge'))
      e.target.value = ''
      return
    }
    setSelectedFile(file)
    setPreviewUrl(file ? URL.createObjectURL(file) : null)
  }

  const createProfile = async () => {
    if (!newUsername) return
    setLoading(true)
    try {
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'createProfile', args: [newUsername, ''] })
      setTimeout(() => refetchProfile(), 3000)
    } catch (e) { console.error(e); showToast('error', t('errProfileFailed')) }
    setLoading(false)
  }

  const createPost = async () => {
    if (!newPost) return
    setLoading(true)
    try {
      let ipfsHash = ''
      if (selectedFile) {
        const fd = new FormData()
        fd.append('file', selectedFile)
        const res = await fetch('/api/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok || !data.ipfsHash) {
          showToast('error', 'Upload failed — try a smaller file or different format')
          setLoading(false)
          return
        }
        ipfsHash = selectedFile.type.startsWith('video/') ? `vid_${data.ipfsHash}` : data.ipfsHash
      }
      await writeContractAsync({
        address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'createPost',
        args: [newPost, ipfsHash], value: effectiveFee(postPrice as bigint | undefined, DEFAULT_POST_PRICE),
      })
      setNewPost(''); setSelectedFile(null); setPreviewUrl(null)
      setTimeout(() => refetchCount(), 3000)
      setActiveTab('feed')
      setQuotingPost(null)
      setShowPollCreator(false)
      SFX.post()
      showToast('success', 'Post published — confirming on Base…')
    } catch (e) {
      console.error(e)
      showToast('error', 'Post failed — transaction rejected')
    }
    setLoading(false)
  }

  // When you like/tip your OWN post, advance the notification snapshot so the
  // notifications effect doesn't fire a "someone engaged with your post" alert
  // to yourself (it's count-based and can't tell the actor apart otherwise).
  const markSelfSeen = (postId: bigint, kind: 'likes' | 'tips', delta: bigint) => {
    const mine = posts.find(p => p.id === postId)
    if (!mine || !address || mine.author.toLowerCase() !== address.toLowerCase()) return
    const storageKey = kind === 'likes' ? 'flamebase_last_likes' : 'flamebase_last_tips'
    const newTotal = (kind === 'likes' ? mine.likes : mine.tips) + delta
    try {
      const raw = localStorage.getItem(storageKey)
      const m = raw ? JSON.parse(raw) : {}
      m[postId.toString()] = newTotal.toString()
      localStorage.setItem(storageKey, JSON.stringify(m))
    } catch {}
  }

  const handleLike = async (postId: bigint) => {
    if (!isConnected) return
    const key = postId.toString()
    setAnimatingLike(key)
    setTimeout(() => setAnimatingLike(prev => prev === key ? null : prev), 500)
    SFX.like()
    setLoadingAction(`like-${postId}`)
    try {
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'like', args: [postId], value: effectiveFee(likePrice as bigint | undefined, DEFAULT_LIKE_PRICE) })
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: p.likes + 1n } : p))
      markSelfSeen(postId, 'likes', 1n)
    } catch (e: unknown) {
      console.error(e)
      showToast('error', txError(e))
    }
    setLoadingAction(null)
  }

  const handleComment = async (postId: bigint) => {
    const key = postId.toString()
    const text = commentTexts[key]
    if (!text) return
    setLoadingAction(`comment-${postId}`)
    try {
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'comment', args: [postId, text], value: effectiveFee(commentPrice as bigint | undefined, DEFAULT_COMMENT_PRICE) })
      setCommentTexts(prev => ({ ...prev, [key]: '' }))
      setReplyingTo(prev => ({ ...prev, [key]: '' }))
      await loadComments(key)
    } catch (e) { console.error(e); showToast('error', t('errCommentFailed')) }
    setLoadingAction(null)
  }

  const handleTip = async (postId: bigint, usdAmount?: number) => {
    const key = postId.toString()
    const usd = usdAmount || parseFloat(tipAmounts[key] || '0')
    if (!usd || usd <= 0) return
    const ethAmount = (usd / ethPrice).toFixed(10)
    const weiAmount = parseEther(ethAmount)
    setLoadingAction(`tip-${postId}`)
    try {
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'tip', args: [postId], value: weiAmount })
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, tips: p.tips + weiAmount } : p))
      markSelfSeen(postId, 'tips', weiAmount)
      setTipAmounts(prev => ({ ...prev, [key]: '' }))
      SFX.tip()
      showToast('success', `Tipped $${usd}`)
    } catch (e) {
      console.error(e)
      showToast('error', 'Tip failed — transaction rejected or reverted')
    }
    setLoadingAction(null)
  }

  const setReply = (postId: string, commenterAddr: string) => {
    const uname = getUsername(commenterAddr)
    setReplyingTo(prev => ({ ...prev, [postId]: uname }))
    setCommentTexts(prev => ({ ...prev, [postId]: `@${uname} ` }))
    setExpandedComments(prev => ({ ...prev, [postId]: true }))
  }

  const timeAgo = (ts: bigint) => {
    const d = Date.now() / 1000 - Number(ts)
    if (d < 60) return `${Math.floor(d)}s`
    if (d < 3600) return `${Math.floor(d / 60)}m`
    if (d < 86400) return `${Math.floor(d / 3600)}h`
    return `${Math.floor(d / 86400)}d`
  }

  const fmtPrice = (p: unknown) => (typeof p === 'bigint' ? formatEther(p) : '...')

  // Hide post
  const hidePost = (postId: string) => {
    const updated = new Set(hiddenPosts)
    updated.add(postId)
    setHiddenPosts(updated)
    localStorage.setItem('flamebase_hidden_posts', JSON.stringify([...updated]))
  }

  const toggleBookmark = (postId: string) => {
    const next = new Set(bookmarks)
    if (next.has(postId)) next.delete(postId); else next.add(postId)
    setBookmarks(next)
    localStorage.setItem('flamebase_bookmarks', JSON.stringify([...next]))
  }

  const requestPush = async () => {
    if (typeof Notification === 'undefined') { showToast('error', 'Browser notifications not supported'); return }
    const perm = await Notification.requestPermission()
    if (perm === 'granted') {
      setPushEnabled(true)
      localStorage.setItem('flamebase_push', 'true')
      showToast('success', '🔔 Push notifications enabled!')
    } else {
      showToast('error', 'Notification permission denied')
    }
  }

  const translatePost = async (postId: string, content: string) => {
    if (translatedPosts[postId]) { setTranslatedPosts(prev => { const n = {...prev}; delete n[postId]; return n }); return }
    setTranslatingPost(postId)
    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: `Translate the following text to English. Reply with ONLY the translation, nothing else: "${content}"` }] }),
      })
      const data = await res.json()
      if (data.content) {
        // Strip quotes the model may echo back, then compare — if the post was
        // already English the "translation" is just the original text, so skip
        // showing a redundant box and tell the user instead.
        const norm = (s: string) => s.trim().replace(/^["'“”]+|["'“”]+$/g, '').toLowerCase()
        if (norm(data.content) === norm(content)) {
          showToast('info', t('alreadyInLanguage'))
        } else {
          setTranslatedPosts(prev => ({ ...prev, [postId]: data.content }))
        }
      }
    } catch {}
    setTranslatingPost(null)
  }

  const uploadBanner = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !address) return
    setUploadingBanner(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.ipfsHash) {
        const next = { ...profileBanners, [address.toLowerCase()]: data.ipfsHash }
        setProfileBanners(next)
        localStorage.setItem('flamebase_banners', JSON.stringify(next))
        showToast('success', 'Banner uploaded!')
      }
    } catch {}
    setUploadingBanner(false)
  }

  const buyPremium = async () => {
    if (!address || buyingPremium) return
    setBuyingPremium(true)
    try {
      const weiAmount = parseEther((0.09 / ethPrice).toFixed(10))
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'tip', args: [0n], value: weiAmount }, 'premium')
      const next = new Set(premiumUsers); next.add(address.toLowerCase())
      setPremiumUsers(next)
      localStorage.setItem('flamebase_premium', JSON.stringify([...next]))
      showToast('success', '✨ Premium badge activated!')
    } catch { showToast('error', 'Purchase failed') }
    setBuyingPremium(false)
  }

  const fetchNFTs = async (addr: string) => {
    setLoadingNfts(true)
    try {
      const res = await fetch(`https://base.blockscout.com/api/v2/addresses/${addr}/nft/collections?type=ERC-721,ERC-1155`)
      const data = await res.json()
      const items: Array<{name: string; image: string; collection: string}> = []
      if (data.items) {
        for (const col of data.items) {
          const instances = col.token_instances || []
          for (const t of instances.slice(0, 3)) {
            items.push({
              name: t.metadata?.name || col.token?.name || 'NFT',
              image: t.image_url || t.metadata?.image || '',
              collection: col.token?.name || '',
            })
            if (items.length >= 12) break
          }
          if (items.length >= 12) break
        }
      }
      setNfts(items)
      setNftsFetched(true)
    } catch { setNftsFetched(true) }
    setLoadingNfts(false)
  }

  // Deploy the official FlameBase Logo NFT collection (admin only)
  const deployLogoNft = async () => {
    if (deployingLogoNft || !NFT_FACTORY_DEPLOYED) return
    setDeployingLogoNft(true)
    try {
      // 1. Upload logo to IPFS — get imageHash + baseURI (our metadata API)
      showToast('success', 'Uploading logo to IPFS…')
      const setupRes = await fetch('/api/setup-logo-nft', { method: 'POST' })
      const setupData = await setupRes.json()
      if (!setupRes.ok || !setupData.baseURI) {
        showToast('error', 'IPFS setup failed')
        setDeployingLogoNft(false)
        return
      }
      // 2. Deploy via factory — $0.50 mint price
      const mintPriceWei = parseEther((0.50 / ethPrice).toFixed(10))
      showToast('success', 'Deploying NFT collection on Base…')
      await writeContractAsync({
        address: NFT_FACTORY_ADDRESS, abi: NFT_FACTORY_ABI, functionName: 'deployNFT',
        args: ['FlameBase Logo', 'FLAME', 10000n, mintPriceWei, setupData.baseURI],
        value: fixedFee,
      }, 'deployLogoNft')
      showToast('success', '🎉 Logo NFT collection deployed! Find address in factory.')
      // Wait a bit and try to grab the latest collection address from factory
      setTimeout(async () => {
        try {
          if (!publicClient) return
          const cols = await publicClient.readContract({
            address: NFT_FACTORY_ADDRESS, abi: NFT_FACTORY_ABI, functionName: 'getCollections',
          }) as unknown as Array<{ addr: string; name: string; creator: string }>
          const mine = cols.filter(c => c.creator.toLowerCase() === address?.toLowerCase() && c.name === 'FlameBase Logo').pop()
          if (mine) {
            setDeployedLogoNftAddr(mine.addr)
            showToast('success', `📍 Contract: ${mine.addr} — Save as NEXT_PUBLIC_FLAME_NFT in Vercel`)
            if (setupData.imageHash) {
              showToast('success', `🖼️ Image hash: ${setupData.imageHash} — Save as FLAME_NFT_IMAGE_HASH in Vercel`)
            }
          }
        } catch {}
      }, 5000)
    } catch (e) {
      console.error(e)
      showToast('error', 'Deploy failed')
    }
    setDeployingLogoNft(false)
  }

  // Mint the FlameBase Logo NFT (public — any wallet)
  const mintLogoNft = async () => {
    if (mintingLogoNft) return
    if (!logoNftDeployed) { showToast('error', 'NFT contract not configured'); return }
    if (logoNftMintPrice === undefined) { showToast('error', 'Mint price loading… try again'); return }
    setMintingLogoNft(true)
    try {
      await writeContractAsync({
        address: logoNftAddr, abi: FLAME_NFT_ABI, functionName: 'mint',
        value: logoNftMintPrice as bigint,
      }, 'mintLogoNft')
      showToast('success', '🎉 Minted! Welcome to the FlameBase NFT family')
      setTimeout(() => { refetchLogoNftSupply(); refetchLogoNftBalance() }, 3000)
    } catch (e) {
      console.error('mintLogoNft failed', e)
      const msg = e instanceof Error ? e.message : 'Mint failed'
      showToast('error', msg.length > 80 ? msg.slice(0, 80) + '…' : msg)
    }
    setMintingLogoNft(false)
  }

  const quotePost = (post: Post) => {
    const author = getUsername(post.author)
    const preview = post.content ? post.content.slice(0, 120) : '📎 media'
    setNewPost(`\n\n📌 @${author}: "${preview}${post.content.length > 120 ? '…' : ''}"`)
    setQuotingPost(post)
    setActiveTab('post')
  }

  const boostPost = async (postId: string) => {
    const weiAmount = parseEther((0.09 / ethPrice).toFixed(10))
    setLoadingAction(`boost-${postId}`)
    try {
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'tip', args: [BigInt(postId)], value: weiAmount }, 'boost')
      const expires = Date.now() + 24 * 60 * 60 * 1000
      const next = { ...boostedPosts, [postId]: expires }
      setBoostedPosts(next)
      localStorage.setItem('flamebase_boosted', JSON.stringify(next))
      showToast('success', '🚀 Boosted! Post will appear at the top for 24h')
    } catch { showToast('error', 'Boost failed') }
    setLoadingAction(null)
  }

  // Mint a post as a 1-of-1 NFT via the existing NFT Factory: deploy a
  // single-edition collection whose metadata describes this post, then
  // immediately mint token #0 into the caller's wallet.
  const mintPostAsNft = async (post: Post) => {
    if (!NFT_FACTORY_DEPLOYED || !publicClient || !address) return
    const postId = post.id.toString()
    setLoadingAction(`mintnft-${postId}`)
    try {
      const image = post.ipfsHash && !post.ipfsHash.startsWith('vid_')
        ? `ipfs://${post.ipfsHash}`
        : 'https://flamebase.xyz/logo.png'
      const params = new URLSearchParams({
        postId,
        author: post.author,
        content: (post.content || '').slice(0, 280),
        image,
      })
      const baseURI = `https://flamebase.xyz/api/nft-metadata/post?${params.toString()}&t=`
      const name = `FlameBase Post #${postId}`
      await writeContractAsync({
        address: NFT_FACTORY_ADDRESS, abi: NFT_FACTORY_ABI, functionName: 'deployNFT',
        args: [name, 'FBPOST', 1n, 0n, baseURI],
        value: fixedFee,
      }, 'mintPostNft')
      showToast('success', 'Deploying your post NFT…')
      setTimeout(async () => {
        try {
          const cols = await publicClient.readContract({
            address: NFT_FACTORY_ADDRESS, abi: NFT_FACTORY_ABI, functionName: 'getCollections',
          }) as unknown as Array<{ addr: `0x${string}`; name: string; creator: string }>
          const mine = cols.filter(c => c.creator.toLowerCase() === address.toLowerCase() && c.name === name).pop()
          if (!mine) { showToast('error', 'Deployed, but could not auto-mint — check Basescan'); return }
          await writeContractAsync({ address: mine.addr, abi: FLAME_NFT_ABI, functionName: 'mint', value: 0n }, 'mintPostNftFinal')
          showToast('success', `🎉 Post minted as NFT! ${mine.addr.slice(0, 8)}…${mine.addr.slice(-4)}`)
        } catch (e) {
          console.error(e)
          showToast('error', 'Collection deployed, but mint step failed — try minting it on Basescan')
        }
      }, 5000)
    } catch (e) {
      console.error(e)
      showToast('error', txError(e))
    }
    setLoadingAction(null)
  }

  const votePoll = (postId: string, optionIndex: number) => {
    if (pollVotes[postId] !== undefined) return
    const next = { ...pollVotes, [postId]: optionIndex }
    setPollVotes(next)
    localStorage.setItem('flamebase_poll_votes', JSON.stringify(next))
  }

  // Avatar upload
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data.ipfsHash) {
        console.error('Avatar upload failed', data)
        showToast('error', t('errAvatarUploadFailed'))
        setUploadingAvatar(false)
        return
      }
      await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'uploadAvatar',
        args: [data.ipfsHash],
        value: effectiveFee(photoPrice as bigint | undefined, DEFAULT_PHOTO_PRICE),
      })
      showToast('success', t('avatarUpdated'))
      setTimeout(() => refetchProfile(), 3000)
    } catch (e) {
      console.error(e)
      showToast('error', txError(e))
    }
    setUploadingAvatar(false)
  }

  // Tool action helper
  const toolAction = async (action: () => Promise<void>, setLoad: (b: boolean) => void) => {
    setLoad(true)
    try { await action() } catch (e) { console.error(e); showToast('error', txError(e)) }
    setLoad(false)
  }

  // Deploy a token via Base's native B-20 precompile factory instead of FlameBase's
  // own TokenFactory: no protocol fee (gas only), admin-less / fixed-supply forever.
  const deployB20 = async () => {
    if (!address) return
    // B20 ASSET variant isn't activated on Base yet — the factory reverts with
    // FeatureNotActivated (0xb9b2a425). Stop here with a clear message instead
    // of letting the user sign a tx that's guaranteed to fail. Flip B20_ACTIVATED
    // to true once Base turns the activation flag on.
    if (!B20_ACTIVATED) { showToast('error', t('errB20NotActive')); return }
    const decimals = 18
    const supply = BigInt(b20Supply || '1000000')
    const params = encodeB20AssetCreateParams(b20Name, b20Symbol, '0x0000000000000000000000000000000000000000', decimals)
    const initCalls = [encodeB20BatchMintInitCall(address, supply * (10n ** BigInt(decimals)))]
    const salt = keccak256(toHex(`${address}-${b20Symbol}-${b20Name}-${Date.now()}-${Math.random()}`))
    await writeContractAsync({ address: B20_FACTORY_ADDRESS, abi: B20_FACTORY_ABI, functionName: 'createB20', args: [0, salt, params, initCalls], value: 0n })
    setB20Name('FlameBase B20'); setB20Symbol('FB20'); setB20Supply('1000000')
  }

  // Filter posts
  const visiblePosts = posts.filter(p => {
    if (hiddenPosts.has(p.id.toString())) return false
    if (searchQuery) {
      const un = getUsername(p.author).toLowerCase()
      const content = p.content.toLowerCase()
      const q = searchQuery.toLowerCase()
      return un.includes(q) || content.includes(q)
    }
    return true
  })

  const sortedVisiblePosts = (() => {
    const now = Date.now()
    if (showBookmarks) return visiblePosts.filter(p => bookmarks.has(p.id.toString()))
    return [...visiblePosts].sort((a, b) => {
      const aB = (boostedPosts[a.id.toString()] || 0) > now
      const bB = (boostedPosts[b.id.toString()] || 0) > now
      if (aB && !bB) return -1
      if (!aB && bB) return 1
      return 0
    })
  })()

  // Track post views — must come after sortedVisiblePosts is declared
  useEffect(() => {
    if (activeTab !== 'feed') return
    const toUpdate: Record<string, number> = {}
    sortedVisiblePosts.slice(0, 10).forEach(p => {
      const k = p.id.toString()
      if (!seenInSession.current.has(k)) {
        seenInSession.current.add(k)
        toUpdate[k] = (postViews[k] || 0) + 1
      }
    })
    if (Object.keys(toUpdate).length === 0) return
    setPostViews(prev => {
      const next = { ...prev, ...toUpdate }
      localStorage.setItem('flamebase_views', JSON.stringify(next))
      return next
    })
  }, [sortedVisiblePosts, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Trending hashtags: pull #tags from post content, count by frequency,
  // boost recent posts a bit so yesterday's news doesn't dominate forever.
  const trendingTags = useMemo(() => {
    const now = Date.now() / 1000
    const counts = new Map<string, number>()
    for (const p of posts) {
      if (!p.content) continue
      const tags = p.content.match(/#[\p{L}0-9_]{2,30}/gu)
      if (!tags) continue
      const ageHours = Math.max(1, (now - Number(p.timestamp)) / 3600)
      const recencyWeight = 1 + Math.max(0, 72 - ageHours) / 72  // 2x for fresh, 1x for >3 days
      const seen = new Set<string>()
      for (const raw of tags) {
        const tag = raw.toLowerCase()
        if (seen.has(tag)) continue  // a post counts once per unique tag
        seen.add(tag)
        counts.set(tag, (counts.get(tag) || 0) + recencyWeight)
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag)
  }, [posts])

  const TOOL_CARDS = [
    { id: 'counter', symbol: '[##]', label: 'COUNTER', desc: 'Increment the global on-chain counter', deployed: TOOLS_DEPLOYED },
    { id: 'streak', symbol: '[~]', label: 'STREAK', desc: 'Daily check-in streak tracker', deployed: TOOLS_DEPLOYED },
    { id: 'logbook', symbol: '[📖]', label: 'LOGBOOK', desc: 'Write entries to the blockchain', deployed: TOOLS_DEPLOYED },
    { id: 'greeter', symbol: '[👋]', label: 'GREETER', desc: 'Set your on-chain greeting', deployed: TOOLS_DEPLOYED },
    { id: 'token', symbol: '[$]', label: 'TOKEN', desc: 'Deploy your own ERC-20 token', deployed: TOKEN_FACTORY_DEPLOYED },
    { id: 'nft', symbol: '[*]', label: 'NFT', desc: 'Launch an NFT collection', deployed: NFT_FACTORY_DEPLOYED },
    { id: 'dao', symbol: '[△]', label: 'SIMPLE DAO', desc: 'Create and vote on proposals', deployed: DAO_DEPLOYED },
  ]

  const navItems: { tab: Tab; icon: string; labelKey: string }[] = [
    { tab: 'feed', icon: '🏠', labelKey: 'navFeed' },
    { tab: 'post', icon: '✏️', labelKey: 'navNewPost' },
    { tab: 'reels', icon: '🎬', labelKey: 'navReels' },
    { tab: 'activity', icon: '🔔', labelKey: 'navActivity' },
    { tab: 'messages', icon: '💬', labelKey: 'navMessages' },
    { tab: 'ai', icon: '🤖', labelKey: 'navAI' },
    { tab: 'profile', icon: '👤', labelKey: 'navProfile' },
    { tab: 'tools', icon: '🛠️', labelKey: 'navTools' },
  ]

  // Measure the real rendered height of the fixed mobile header and bottom
  // nav instead of guessing — emoji glyphs and wallet-address text overshoot
  // their CSS line-height, so a hardcoded constant drifts from the actual
  // layout across devices/fonts (confirmed: header renders taller than the
  // assumed 60px, which hid the Messages thread header behind it).
  const mobileHeaderRef = useRef<HTMLElement | null>(null)
  const bottomNavRef = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (typeof ResizeObserver === 'undefined') return
    const observers: ResizeObserver[] = []
    ;([['--mobile-header-h', mobileHeaderRef], ['--bottom-nav-h', bottomNavRef]] as const).forEach(([varName, ref]) => {
      const el = ref.current
      if (!el) return
      const setVar = () => {
        document.documentElement.style.setProperty(varName, `${el.getBoundingClientRect().height}px`)
      }
      setVar()
      const obs = new ResizeObserver(setVar)
      obs.observe(el)
      observers.push(obs)
    })
    return () => observers.forEach(o => o.disconnect())
  }, [])

  return (
    <div className="min-h-screen bg-white text-[#0A0B0D] flex flex-col">

      {/* Mobile Wallet Connection Sheet */}
      {showWalletSheet && (
        <div className="fixed inset-0 z-[500] flex flex-col items-end justify-end md:items-center md:justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowWalletSheet(false)} />
          <div className="relative bg-white w-full md:max-w-[400px] rounded-t-3xl md:rounded-3xl shadow-2xl z-10">
            {/* Handle bar (mobile only) */}
            <div className="flex justify-center pt-3 pb-1 md:hidden">
              <div className="w-10 h-1 rounded-full bg-[#D1D5DB]" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4">
              <div>
                <p className="font-black text-xl text-[#0A0B0D]">Connect Wallet</p>
                <p className="text-xs text-[#9CA3AF] mt-0.5">Select your wallet to continue</p>
              </div>
              <button
                onClick={() => setShowWalletSheet(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-[#F3F4F6] hover:bg-[#E5E7EB] transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#6B7280]" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Wallet list */}
            <div className="px-4 pb-6 space-y-1.5">
              {/* MetaMask */}
              <a
                href="https://metamask.app.link/dapp/flamebase.xyz"
                onClick={() => setShowWalletSheet(false)}
                className="flex items-center gap-4 w-full px-4 py-3.5 rounded-2xl hover:bg-[#F9FAFB] active:bg-[#F3F4F6] transition-colors group"
              >
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{background:'linear-gradient(135deg,#F6851B,#E4761B)'}}>
                  <svg viewBox="0 0 35 33" className="w-7 h-7" fill="none">
                    <path d="M32.96 1L19.37 10.99l2.55-6.05L32.96 1z" fill="#E17726" stroke="#E17726" strokeWidth=".25"/>
                    <path d="M2.04 1l13.46 10.08-2.42-6.14L2.04 1z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
                    <path d="M28.23 23.53l-3.6 5.51 7.72 2.12 2.22-7.48-6.34-.15zM.44 23.68l2.2 7.48 7.71-2.12-3.6-5.51-6.31.15z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
                    <path d="M9.94 14.51l-2.15 3.26 7.67.34-.26-8.23-5.26 4.63zM25.06 14.51l-5.3-4.72-.17 8.32 7.66-.34-2.19-3.26z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
                    <path d="M10.35 29.04l4.6-2.23-3.97-3.1-.63 5.33zM20.05 26.81l4.6 2.23-.64-5.33-3.96 3.1z" fill="#E27625" stroke="#E27625" strokeWidth=".25"/>
                    <path d="M24.65 29.04l-4.6-2.23.37 3.01-.04 1.31 4.27-2.09zM10.35 29.04l4.28 2.09-.04-1.31.37-3.01-4.61 2.23z" fill="#D5BFB2" stroke="#D5BFB2" strokeWidth=".25"/>
                    <path d="M14.7 21.84l-3.82-1.12 2.69-1.24 1.13 2.36zM20.3 21.84l1.13-2.36 2.7 1.24-3.83 1.12z" fill="#233447" stroke="#233447" strokeWidth=".25"/>
                    <path d="M10.35 29.04l.65-5.51-4.26.12 3.61 5.39zM24 23.53l.65 5.51 3.62-5.39-4.27-.12zM27.59 17.77l-7.66.34.71 3.73 1.13-2.36 2.7 1.24 3.12-2.95zM11.88 20.72l2.69-1.24 1.13 2.36.71-3.73-7.67-.34 3.14 2.95z" fill="#CC6228" stroke="#CC6228" strokeWidth=".25"/>
                    <path d="M7.79 17.77l3.22 6.28-.11-3.33-3.11-2.95zM24.1 20.72l-.1 3.33 3.22-6.28-3.12 2.95zM15.42 18.11l-.71 3.73.89 4.62.2-6.08-.38-2.27zM19.58 18.11l-.37 2.26.18 6.09.9-4.62-.71-3.73z" fill="#E27525" stroke="#E27525" strokeWidth=".25"/>
                    <path d="M20.3 21.84l-.9 4.62.65.45 3.96-3.1.1-3.33-3.81 1.36zM11.88 20.72l.1 3.33 3.97 3.1.65-.45-.9-4.62-3.82-1.36z" fill="#F5841F" stroke="#F5841F" strokeWidth=".25"/>
                    <path d="M20.38 31.13l.04-1.31-.34-.3h-5.16l-.33.3.04 1.31-4.28-2.09 1.5 1.23 3.04 2.1h5.22l3.05-2.1 1.49-1.23-4.27 2.09z" fill="#C0AD9E" stroke="#C0AD9E" strokeWidth=".25"/>
                    <path d="M20.05 26.81l-.65-.45h-3.8l-.65.45-.37 3.01.33-.3h5.16l.34.3-.36-3.01z" fill="#161616" stroke="#161616" strokeWidth=".25"/>
                    <path d="M33.52 11.37l1.15-5.61L32.96 1l-12.91 9.6 4.97 4.2 7.02 2.05 1.55-1.81-.67-.49 1.07-.97-.82-.64 1.07-.83-.72-.54zM0 5.76l1.16 5.61-.74.54 1.07.83-.82.64 1.07.97-.67.49 1.55 1.81 7.02-2.05 4.97-4.2L2.7 1 0 5.76z" fill="#763D16" stroke="#763D16" strokeWidth=".25"/>
                    <path d="M32.04 16.85l-7.02-2.05 2.12 3.2-3.17 6.18 4.19-.05h6.26l-2.38-7.28zM9.98 14.8L2.96 16.85.58 24.13h6.25l4.18.05-3.16-6.18 2.13-3.2zM19.93 18.11l.44-7.69 2.03-5.49h-9.02l2.03 5.49.44 7.69.17 2.29.01 6.08h3.71l.02-6.08.17-2.29z" fill="#F6851B" stroke="#F6851B" strokeWidth=".25"/>
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-sm text-[#0A0B0D]">MetaMask</p>
                  <p className="text-xs text-[#9CA3AF]">Open in MetaMask browser</p>
                </div>
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#D1D5DB] group-hover:text-[#9CA3AF] transition-colors flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </a>

              {/* Coinbase Wallet */}
              <a
                href="https://go.cb-w.com/dapp?cb_url=https%3A%2F%2Fflamebase.xyz"
                onClick={() => setShowWalletSheet(false)}
                className="flex items-center gap-4 w-full px-4 py-3.5 rounded-2xl hover:bg-[#F9FAFB] active:bg-[#F3F4F6] transition-colors group"
              >
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{background:'#1652F0'}}>
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="white">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 4c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6 2.69-6 6-6zm0 2a4 4 0 100 8 4 4 0 000-8zm0 1.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5z"/>
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-sm text-[#0A0B0D]">Coinbase Wallet</p>
                  <p className="text-xs text-[#9CA3AF]">Smart Wallet — no app required</p>
                </div>
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#D1D5DB] group-hover:text-[#9CA3AF] transition-colors flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </a>

              {/* Trust Wallet */}
              <a
                href="https://link.trustwallet.com/open_url?coin_id=60&url=https%3A%2F%2Fflamebase.xyz"
                onClick={() => setShowWalletSheet(false)}
                className="flex items-center gap-4 w-full px-4 py-3.5 rounded-2xl hover:bg-[#F9FAFB] active:bg-[#F3F4F6] transition-colors group"
              >
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 overflow-hidden" style={{background:'linear-gradient(135deg,#3375BB,#2660A4)'}}>
                  <svg viewBox="0 0 40 40" className="w-7 h-7" fill="white">
                    <path d="M20 4L7 9v10c0 8.3 5.5 16 13 18.5C27.5 35 33 27.3 33 19V9L20 4zm0 17.5h-8V13h8v8.5zm0 0v8c-4.5-2-8-7-8-12h8zm0 0h8c0 5-3.5 10-8 12v-12zm0 0V13h8v8.5h-8z"/>
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-sm text-[#0A0B0D]">Trust Wallet</p>
                  <p className="text-xs text-[#9CA3AF]">Open in Trust Wallet browser</p>
                </div>
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#D1D5DB] group-hover:text-[#9CA3AF] transition-colors flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </a>

              {/* Divider */}
              <div className="flex items-center gap-3 py-1">
                <div className="flex-1 h-px bg-[#F3F4F6]" />
                <span className="text-xs text-[#D1D5DB] font-medium">or</span>
                <div className="flex-1 h-px bg-[#F3F4F6]" />
              </div>

              {/* WalletConnect */}
              <button
                onClick={() => { setShowWalletSheet(false); setTimeout(() => openConnectModal?.(), 50) }}
                className="flex items-center gap-4 w-full px-4 py-3.5 rounded-2xl hover:bg-[#F9FAFB] active:bg-[#F3F4F6] transition-colors group"
              >
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0" style={{background:'#3B99FC'}}>
                  <svg viewBox="0 0 40 40" className="w-7 h-7" fill="white">
                    <path d="M10.6 14.8c5.2-5.1 13.7-5.1 18.9 0l.6.6c.3.2.3.6 0 .9l-2.1 2c-.1.2-.4.2-.5 0l-.9-.8c-3.6-3.6-9.5-3.6-13.1 0l-.9.9c-.1.2-.4.2-.5 0l-2.1-2c-.2-.2-.2-.6 0-.8l.6-.8zm23.3 4.3l1.9 1.9c.3.2.3.6 0 .9L26 31.6c-.2.3-.6.3-.8 0l-6.3-6.3c-.1-.1-.2-.1-.3 0l-6.3 6.3c-.2.3-.6.3-.9 0L2 21.9c-.2-.2-.2-.6 0-.9l1.8-1.9c.3-.2.6-.2.9 0l6.3 6.3c.1.1.2.1.3 0L17.6 19c.2-.3.6-.3.9 0l6.3 6.4c.1.1.2.1.3 0l6.4-6.3c.1-.3.5-.3.7 0z"/>
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-sm text-[#0A0B0D]">WalletConnect</p>
                  <p className="text-xs text-[#9CA3AF]">Scan QR with any compatible wallet</p>
                </div>
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#D1D5DB] group-hover:text-[#9CA3AF] transition-colors flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Terminal Modal */}
      {showTerminal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowTerminal(false)} />
          <div className="relative bg-[#0A0B0D] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden border border-green-400/30 z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-green-400/20 bg-[#1a1c20]">
              <div className="flex items-center gap-2 font-mono text-green-400 text-sm">
                <span>●</span><span>●</span><span>●</span>
                <span className="ml-3">flamebase@base ~ $ tx-log</span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setTxLog([]); localStorage.removeItem('flamebase_tx_log') }}
                  className="text-green-400/60 hover:text-green-400 text-xs font-mono">clear</button>
                <button onClick={() => setShowTerminal(false)}
                  className="text-green-400/60 hover:text-green-400 text-xs font-mono px-2">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto font-mono text-xs p-4 text-green-400 bg-[#0A0B0D]">
              <p className="text-green-400/60 mb-3">
                {`> Showing last ${txLog.length} on-chain transactions. Click hash to view on Basescan.`}
              </p>
              {txLog.length === 0 ? (
                <p className="text-green-400/40 mt-8 text-center">No transactions yet. Press a button to start.</p>
              ) : (
                <div className="space-y-1">
                  {txLog.map((tx, i) => {
                    const time = new Date(tx.time)
                    const hh = time.getHours().toString().padStart(2, '0')
                    const mm = time.getMinutes().toString().padStart(2, '0')
                    const ss = time.getSeconds().toString().padStart(2, '0')
                    return (
                      <div key={i} className="flex items-start gap-2 hover:bg-green-400/5 px-2 py-1 rounded">
                        <span className="text-green-400/50 flex-shrink-0">[{hh}:{mm}:{ss}]</span>
                        <span className="text-yellow-400 flex-shrink-0">{tx.type}</span>
                        {tx.pending ? (
                          <span className="text-green-400/50 truncate" title="Wallet hasn't confirmed an on-chain hash yet">
                            {tx.hash.slice(0,10)}...{tx.hash.slice(-8)} (confirming…)
                          </span>
                        ) : (
                          <a href={`https://basescan.org/tx/${tx.hash}`} target="_blank"
                            className="text-cyan-400 hover:text-cyan-300 underline truncate">
                            {tx.hash.slice(0,10)}...{tx.hash.slice(-8)}
                          </a>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1">

        {/* ── Left Sidebar (desktop) ── */}
        <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-60 bg-white border-r border-[#E4E7EB] z-40 px-3 py-5">
          <div className="flex items-center gap-2.5 mb-8 px-3">
            <FlameLogo size={36} />
            <span className="text-lg font-black text-[#0A0B0D]">FlameBase</span>
          </div>
          <nav className="flex-1 space-y-1">
            {navItems.map(({ tab, icon, labelKey }) => (
              <button key={tab} onClick={() => {
                setActiveTab(tab)
                if (tab === 'reels') setReelsEverOpened(true)
                if (tab === 'ai') setAiEverOpened(true)
                if (tab === 'activity') {
                  const snapshot: Record<string, number> = {}
                  myPosts.forEach(p => { snapshot[p.id.toString()] = Number(p.likes) })
                  setSeenActivity(snapshot)
                  localStorage.setItem('flamebase_seen_activity', JSON.stringify(snapshot))
                  myPosts.forEach(p => { if (!postComments[p.id.toString()]) loadComments(p.id.toString()) })
                }
              }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold transition-all text-left text-sm ${
                  activeTab === tab ? 'bg-[#E6EEFF] text-[#0052FF]' : 'text-[#5B6271] hover:bg-[#F7F9FC] hover:text-[#0A0B0D]'
                }`}>
                <span className="text-lg">{icon}</span>
                <span className="flex-1 flex items-center gap-1.5">
                  {t(labelKey)}
                  {tab === 'ai' && (
                    <span className="text-[9px] bg-gradient-to-r from-[#7B3FE4] to-[#0052FF] text-white px-1.5 py-0.5 rounded-full font-black shadow-sm">402</span>
                  )}
                </span>
                {tab === 'activity' && activityCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{activityCount > 99 ? '99+' : activityCount}</span>
                )}
                {tab === 'messages' && unreadMessages > 0 && activeTab !== 'messages' && (
                  <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{unreadMessages > 99 ? '99+' : unreadMessages}</span>
                )}
              </button>
            ))}

            {/* $FLM token — under Tools */}
            <a
              href={FLM_TRADE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold text-left text-sm text-[#5B6271] hover:bg-[#F7F9FC] hover:text-[#0A0B0D] transition-all"
            >
              <img src="/logo.png" alt="FLM" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
              <span className="flex-1">$FLM Token</span>
              <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold border border-orange-200">BASE</span>
            </a>
          </nav>

          <div className="border-t border-[#EEF1F5] pt-4 mt-4 space-y-3">
            {isConnected && address && (
              <div className="flex items-center gap-2.5 px-2 mb-1">
                <Avatar addr={address} profiles={profiles} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate text-[#0A0B0D]">{myProfile?.[0] || 'Connected'}</p>
                  <p className="text-xs text-[#8A919E] truncate">{address.slice(0,6)}...{address.slice(-4)}</p>
                </div>
              </div>
            )}
            {isConnected ? (
              <button
                onClick={() => disconnect()}
                className="w-full flex items-center justify-center gap-2 bg-[#FEE2E2] hover:bg-red-100 text-red-600 font-bold text-sm px-3 py-2.5 rounded-xl transition-colors"
              >
                <span>🔌</span><span>Disconnect</span>
              </button>
            ) : isInFarcaster ? (
              <button
                onClick={connectFarcaster}
                className="w-full flex items-center justify-center gap-2 bg-[#855DCD] hover:bg-[#7449C2] text-white font-bold text-sm px-3 py-2.5 rounded-xl transition-colors"
              >
                <span>🟣</span><span>{t('connectFarcaster')}</span>
              </button>
            ) : (
              <ConnectButton />
            )}
            {/* Language selector + theme toggle */}
            <div className="mt-2 flex gap-2">
              <select value={lang} onChange={e => setLang(e.target.value as Lang)}
                className="flex-1 bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-3 py-2 text-xs text-[#5B6271] focus:outline-none focus:border-[#0052FF] cursor-pointer">
                {(Object.entries(LANG_LABELS) as [Lang, string][]).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
              <button onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                className="bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-3 py-2 text-sm hover:bg-[#F0F2F5] transition-colors flex-shrink-0"
                aria-label="Toggle theme">
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
              <button onClick={toggleSound} title={soundOn ? 'Mute sound effects' : 'Enable sound effects'}
                className="bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-3 py-2 text-sm hover:bg-[#F0F2F5] transition-colors flex-shrink-0"
                aria-label="Toggle sound">
                {soundOn ? '🔊' : '🔇'}
              </button>
            </div>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 md:ml-60 xl:mr-96 min-h-screen border-x border-[#EEF1F5] overflow-x-hidden">

          {/* Mobile header */}
          <header
            ref={mobileHeaderRef}
            className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-b border-[#E4E7EB] px-4 pb-3 flex items-center justify-between gap-2"
            style={{ paddingTop: 'max(0.75rem, var(--inset-top, 0px))' }}
          >
            <div className="flex items-center gap-2">
              <FlameLogo size={32} />
              <span className="font-black text-base text-[#0A0B0D]">FlameBase</span>
            </div>
            <div className="flex items-center gap-1.5 ml-auto">
              {/* Wallet button — always first/most prominent */}
              {isConnected ? (
                <button
                  onClick={() => disconnect()}
                  className="flex items-center gap-1 bg-[#FEE2E2] hover:bg-red-100 text-red-600 font-bold text-xs px-2.5 py-2 rounded-xl transition-colors flex-shrink-0"
                  title="Disconnect wallet"
                >
                  <span>🔌</span>
                  <span className="text-[10px]">{address ? address.slice(0,4)+'…'+address.slice(-3) : 'Disconnect'}</span>
                </button>
              ) : isInFarcaster ? (
                <button
                  onClick={connectFarcaster}
                  className="flex items-center gap-1 bg-[#855DCD] hover:bg-[#7449C2] text-white font-bold text-xs px-2.5 py-2 rounded-xl transition-colors flex-shrink-0"
                >
                  <span>🟣</span><span>{t('connectFarcaster')}</span>
                </button>
              ) : (
                <button
                  onClick={openWallet}
                  className="bg-[#0052FF] hover:bg-[#1652F0] text-white font-bold text-xs px-3 py-2 rounded-xl transition-colors flex-shrink-0"
                >
                  Connect
                </button>
              )}
              <button onClick={() => setShowTerminal(true)}
                className="h-8 flex items-center bg-[#0A0B0D] text-green-400 font-mono text-[11px] px-2 rounded-lg hover:bg-[#1f2125] flex-shrink-0">
                ${txLog.length > 0 ? `(${txLog.length})` : ''}
              </button>
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F7F9FC] transition-colors flex-shrink-0"
              >
                <span className="text-base">🔔</span>
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white" />
                )}
              </button>
              <button onClick={toggleTheme}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#F7F9FC] transition-colors flex-shrink-0"
                aria-label="Toggle theme">
                <span className="text-base">{theme === 'dark' ? '☀️' : '🌙'}</span>
              </button>
            </div>
          </header>

          {/* Notification dropdown */}
          {showNotifications && (
            <div className="fixed top-16 left-2 right-2 md:left-auto md:right-4 md:w-80 z-[200] bg-white rounded-2xl shadow-2xl border border-[#EEF1F5] max-h-[70vh] md:max-h-96 overflow-y-auto">
              <div className="px-4 py-3 border-b border-[#EEF1F5] flex items-center justify-between sticky top-0 bg-white">
                <h3 className="font-black text-sm text-[#0A0B0D]">🔔 Notifications</h3>
                {notifications.length > 0 && (
                  <button onClick={() => { setNotifications([]); setShowNotifications(false) }} className="text-xs text-[#8A919E] hover:text-[#0A0B0D] font-semibold">Clear all</button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-3xl mb-2">📭</p>
                  <p className="text-[#8A919E] text-sm">No new notifications</p>
                  <p className="text-[#C5CBD3] text-xs mt-1">Likes &amp; tips on your posts show up here.</p>
                </div>
              ) : (
                notifications.map((n, i) => (
                  <button
                    key={`${n.postId}-${n.type}-${n.timestamp}-${i}`}
                    onClick={() => { setActiveTab('feed'); setShowNotifications(false) }}
                    className="w-full text-left px-4 py-3 border-b border-[#EEF1F5] hover:bg-[#F7F9FC] transition-colors flex items-start gap-3"
                  >
                    <span className="text-xl flex-shrink-0">{n.type === 'tip' ? '💸' : '🔥'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[#0A0B0D] font-semibold">
                        {n.type === 'tip'
                          ? <>You received <span className="text-[#0052FF]">{n.delta} ETH</span> in tips</>
                          : <>+{n.delta} new {Number(n.delta) === 1 ? 'flame' : 'flames'} on your post</>}
                      </p>
                      {n.preview && (
                        <p className="text-xs text-[#5B6271] mt-0.5 truncate">&ldquo;{n.preview}&rdquo;</p>
                      )}
                      <p className="text-[10px] text-[#8A919E] mt-1">Post #{n.postId}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}

          <div className="pt-[var(--mobile-header-h,calc(60px+var(--inset-top,0px)))] md:pt-0">

          {/* Banners are suppressed on the Messages tab: its mobile layout
              (.messages-shell) is sized to fit exactly between the fixed
              header and bottom nav, and any banner rendered above it here
              would push its bottom edge down underneath the bottom nav. */}
          {activeTab !== 'messages' && (
            <>
              {/* Wrong network banner */}
              {isWrongNetwork && (
                <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center justify-between">
                  <p className="text-amber-800 text-sm font-semibold">⚠️ {t('wrongNetwork')}</p>
                  <button onClick={() => switchChain({ chainId: base.id })}
                    className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors">
                    {t('switchToBase')}
                  </button>
                </div>
              )}

              {/* PWA install banner */}
              {installPrompt && !installDismissed && (
                <div className="md:hidden mx-3 mt-2 flex items-center gap-2 bg-[#F0F4FF] border border-[#D6E2FF] rounded-xl px-3 py-2.5 text-xs text-[#0052FF]">
                  <span className="flex-shrink-0">📲</span>
                  <span className="flex-1 font-semibold">Install FlameBase as an app</span>
                  <button
                    onClick={async () => {
                      try { installPrompt.prompt(); await installPrompt.userChoice } catch {}
                      setInstallPrompt(null)
                    }}
                    className="flex-shrink-0 bg-[#0052FF] text-white font-bold px-3 py-1.5 rounded-lg"
                  >
                    Install
                  </button>
                  <button onClick={() => setInstallDismissed(true)} className="flex-shrink-0 text-[#0052FF]/50 hover:text-[#0052FF] font-bold text-sm leading-none">✕</button>
                </div>
              )}

              {/* Mobile wallet browser tip — only shown if not in a wallet's in-app browser */}
              {!walletBannerDismissed && typeof window !== 'undefined' && !(window as any).ethereum && (
                <div className="md:hidden mx-3 mt-2 flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 text-xs text-blue-800">
                  <span className="flex-shrink-0 mt-0.5">💡</span>
                  <span className="flex-1">{t('walletBrowserTip')}</span>
                  <button onClick={() => setWalletBannerDismissed(true)} className="flex-shrink-0 text-blue-400 hover:text-blue-700 font-bold text-sm leading-none ml-1">✕</button>
                </div>
              )}
            </>
          )}

          <div className="pb-24 md:pb-10 max-w-2xl mx-auto">

            {/* ══ FEED ══ */}
            {activeTab === 'feed' && (
              <div>
                {/* Search bar */}
                <div className="px-4 pt-3 pb-2">
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search posts and users..."
                    className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-2.5 text-sm text-[#0A0B0D] placeholder-[#8A919E] focus:outline-none focus:border-[#0052FF]"
                  />
                </div>

                {/* Trending hashtags — clickable chips that filter the feed */}
                {trendingTags.length > 0 && (
                  <div className="px-4 pb-3 border-b border-[#EEF1F5]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-black text-[#8A919E] uppercase tracking-wider">📈 Trending</span>
                      {searchQuery.startsWith('#') && (
                        <button onClick={() => setSearchQuery('')}
                          className="text-xs text-[#0052FF] hover:underline font-semibold ml-auto">
                          Clear
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                      {trendingTags.map(tag => {
                        const active = searchQuery.toLowerCase() === tag
                        return (
                          <button key={tag}
                            onClick={() => setSearchQuery(active ? '' : tag)}
                            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                              active
                                ? 'bg-[#0052FF] text-white'
                                : 'bg-[#F0F2F5] text-[#5B6271] hover:bg-[#E6EEFF] hover:text-[#0052FF]'
                            }`}>
                            {tag}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {posts.length === 0 && postCount === undefined && (
                  <div className="divide-y divide-[#EEF1F5]">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="p-4 flex gap-3">
                        <div className="skeleton w-10 h-10 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <div className="skeleton h-3 w-24" />
                            <div className="skeleton h-3 w-16" />
                          </div>
                          <div className="skeleton h-4 w-full" />
                          <div className="skeleton h-4 w-4/5" />
                          <div className="flex gap-2 pt-2">
                            <div className="skeleton h-7 w-14" />
                            <div className="skeleton h-7 w-14" />
                            <div className="skeleton h-7 w-14" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {posts.length === 0 && postCount !== undefined && Number(postCount) === 0 && (
                  <div className="text-center text-[#5B6271] mt-32 px-6 animate-fade-in">
                    <div className="text-7xl mb-4 animate-bounce">🔥</div>
                    <p className="font-black text-[#0A0B0D] text-xl">{t('noPostsTitle')}</p>
                    <p className="text-sm mt-2 mb-5 max-w-xs mx-auto">{t('noPostsSub')}</p>
                    {isConnected && (
                      <button onClick={() => setActiveTab('post')}
                        className="bg-[#0052FF] hover:bg-[#1652F0] text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm">
                        ✏️ Write the first post
                      </button>
                    )}
                  </div>
                )}

                {visiblePosts.length === 0 && posts.length > 0 && searchQuery && (
                  <div className="text-center text-[#5B6271] mt-20 px-6 animate-fade-in">
                    <div className="text-5xl mb-3">🔍</div>
                    <p className="font-bold text-[#0A0B0D]">No matches for &ldquo;{searchQuery}&rdquo;</p>
                    <button onClick={() => setSearchQuery('')}
                      className="mt-3 text-[#0052FF] hover:underline text-sm font-semibold">
                      Clear search
                    </button>
                  </div>
                )}

                {loadingMore && posts.length === 0 && (
                  <div className="divide-y divide-[#EEF1F5]">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="p-4 flex gap-3">
                        <div className="skeleton w-10 h-10 rounded-full flex-shrink-0" />
                        <div className="flex-1 space-y-2">
                          <div className="skeleton h-3 w-24" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-3/4" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {sortedVisiblePosts.map((post) => {
                  const key = post.id.toString()
                  const comments = postComments[key] || []
                  const isLiking = loadingAction === `like-${post.id}`
                  const isTipping = loadingAction === `tip-${post.id}`
                  const isCommenting = loadingAction === `comment-${post.id}`
                  const isOwnPost = address && post.author.toLowerCase() === address.toLowerCase()

                  return (
                    <article key={key} id={`post-${key}`} className="border-b border-[#EEF1F5] hover:bg-[#FAFBFD] hover:shadow-sm transition-all duration-200 overflow-hidden">
                      <div className="p-4">
                        <div className="flex gap-3">
                          <button onClick={() => setSelectedUser(post.author)} className="flex-shrink-0 cursor-pointer">
                            <Avatar addr={post.author} profiles={profiles} />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <button
                                onClick={() => setSelectedUser(post.author)}
                                className="font-bold text-[#0A0B0D] text-[15px] hover:underline cursor-pointer"
                              >
                                {getUsername(post.author)}
                              </button>
                              {verifiedAddresses[post.author.toLowerCase()] && <VerifiedBadge />}
                              {premiumUsers.has(post.author.toLowerCase()) && <span className="text-yellow-500 text-sm" title="Premium">✨</span>}
                              <span className="text-[#8A919E] text-xs">{post.author.slice(0,6)}...{post.author.slice(-4)}</span>
                              <span className="text-[#8A919E] text-xs">·</span>
                              <span className="text-[#8A919E] text-xs">{timeAgo(post.timestamp)}</span>
                              {postViews[key] && postViews[key] > 1 && (
                                <span className="text-[#C5CBD3] text-xs">· 👁 {postViews[key] > 999 ? `${(postViews[key]/1000).toFixed(1)}k` : postViews[key]}</span>
                              )}
                              {(boostedPosts[key] || 0) > Date.now() && (
                                <span className="bg-orange-100 text-orange-600 text-[10px] font-black px-2 py-0.5 rounded-full">🚀 Boosted</span>
                              )}
                              <a href={`https://basescan.org/address/${post.author}`} target="_blank"
                                className="ml-auto text-[#8A919E] hover:text-[#0052FF] text-xs transition-colors">↗</a>
                              {isOwnPost && (
                                <button
                                  onClick={() => hidePost(key)}
                                  className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-[#FEE2E2] text-[#8A919E] hover:text-red-500 text-xs transition-colors"
                                  title="Hide post"
                                >
                                  ×
                                </button>
                              )}
                            </div>

                            {post.content && (() => {
                              const content = post.content
                              // Poll rendering
                              const pollMatch = content.match(/^\[POLL\](.*?)\[OPTIONS\](.*?)\[\/POLL\]([\s\S]*)/);
                              if (pollMatch) {
                                const question = pollMatch[1].trim()
                                const options = pollMatch[2].split('|').map((o: string) => o.trim())
                                const voted = pollVotes[key]
                                return (
                                  <div className="mb-3">
                                    {pollMatch[3].trim() && <p className="text-[#0A0B0D] text-[15px] leading-relaxed mb-2 whitespace-pre-wrap">{pollMatch[3].trim()}</p>}
                                    <div className="bg-[#F7F9FC] border border-[#E4E7EB] rounded-2xl p-4">
                                      <p className="font-bold text-[#0A0B0D] mb-3">📊 {question}</p>
                                      <div className="space-y-2">
                                        {options.map((opt: string, i: number) => {
                                          const isVoted = voted === i
                                          const pct = voted !== undefined ? (isVoted ? 100 : 0) : null
                                          return (
                                            <button key={i} onClick={() => isConnected && votePoll(key, i)}
                                              disabled={voted !== undefined || !isConnected}
                                              className={`w-full text-left rounded-xl px-4 py-2.5 text-sm font-semibold transition-all relative overflow-hidden border ${isVoted ? 'border-[#0052FF] text-[#0052FF]' : 'border-[#E4E7EB] text-[#0A0B0D] hover:border-[#0052FF]'}`}>
                                              {pct !== null && <div className={`absolute inset-0 ${isVoted ? 'bg-[#E6EEFF]' : 'bg-[#F7F9FC]'}`} style={{ width: `${pct}%` }} />}
                                              <span className="relative">{opt} {isVoted && '✓'}</span>
                                              {pct !== null && <span className="relative float-right text-[#8A919E] text-xs">{pct}%</span>}
                                            </button>
                                          )
                                        })}
                                      </div>
                                      {voted === undefined && isConnected && <p className="text-[10px] text-[#8A919E] mt-2">Tap to vote</p>}
                                      {!isConnected && <p className="text-[10px] text-[#8A919E] mt-2">Connect wallet to vote</p>}
                                    </div>
                                  </div>
                                )
                              }
                              // Token gate rendering
                              const gateMatch = content.match(/^\[GATE:(0x[a-fA-F0-9]{40}):(\d+)\]([\s\S]*)/)
                              if (gateMatch) {
                                const tokenAddr = gateMatch[1]
                                const minBal = BigInt(gateMatch[2])
                                const hiddenContent = gateMatch[3].trim()
                                const isAuthor = address?.toLowerCase() === post.author.toLowerCase()
                                const access = gateUnlocked[key]
                                const unlocked = isAuthor || access === true
                                return (
                                  <div className="mb-3">
                                    <div className={`border rounded-2xl p-4 ${unlocked ? 'bg-green-50 border-green-200' : 'bg-[#FFF8E6] border-[#FFD97D]'}`}>
                                      <p className={`font-bold text-sm mb-1 ${unlocked ? 'text-green-700' : 'text-[#856404]'}`}>
                                        {unlocked ? '🔓 Token Gated — access granted' : '🔒 Token Gated Post'}
                                      </p>
                                      <p className={`text-xs ${unlocked ? 'text-green-700' : 'text-[#856404]'}`}>
                                        Requires {minBal.toString()} of{' '}
                                        <a href={`https://basescan.org/token/${tokenAddr}`} target="_blank" rel="noopener noreferrer" className="underline">
                                          {tokenAddr.slice(0,8)}…{tokenAddr.slice(-4)}
                                        </a>
                                      </p>
                                      {!unlocked && isConnected && access === undefined && <p className="text-[#856404] text-xs mt-1 opacity-60">Checking your balance…</p>}
                                      {!unlocked && isConnected && access === false && <p className="text-[#856404] text-xs mt-1 opacity-60">Your wallet doesn&apos;t hold enough of this token.</p>}
                                      {!isConnected && <p className="text-[#856404] text-xs mt-1 opacity-60">Connect wallet to check access</p>}
                                    </div>
                                    {unlocked && hiddenContent && (
                                      <p className="text-[#0A0B0D] text-[15px] leading-relaxed mt-2 whitespace-pre-wrap">{hiddenContent}</p>
                                    )}
                                  </div>
                                )
                              }
                              // Normal content: hashtags + @mentions
                              return (
                                <p className="text-[#0A0B0D] text-[15px] leading-relaxed mb-3 whitespace-pre-wrap">
                                  {content.split(/(#[\p{L}0-9_]{2,30}|@[\w]+)/gu).map((part, i) =>
                                    part.startsWith('#')
                                      ? <span key={i} role="button" tabIndex={0}
                                          onClick={(e) => { e.stopPropagation(); setSearchQuery(part.toLowerCase()) }}
                                          onKeyDown={(e) => { if (e.key === 'Enter') setSearchQuery(part.toLowerCase()) }}
                                          className="text-[#0052FF] hover:underline cursor-pointer font-semibold">{part}</span>
                                      : part.startsWith('@')
                                        ? <span key={i} className="text-[#0052FF] font-semibold">{part}</span>
                                        : <span key={i}>{part}</span>
                                  )}
                                </p>
                              )
                            })()}

                            {translatedPosts[key] && (
                              <div className="mb-3 px-3 py-2.5 bg-green-50 border border-green-200 rounded-xl">
                                <p className="text-[10px] font-black text-green-700 uppercase tracking-wide mb-1">🌐 Translation</p>
                                <p className="text-[#0A0B0D] text-sm leading-relaxed">{translatedPosts[key]}</p>
                              </div>
                            )}

                            {post.ipfsHash && (
                              <div className="rounded-2xl overflow-hidden mb-3 border border-[#E4E7EB]">
                                {post.ipfsHash.startsWith('vid_') ? (
                                  <IpfsVideo hash={post.ipfsHash.slice(4)} className="w-full max-h-[520px] bg-black" />
                                ) : (
                                  <IpfsImage hash={post.ipfsHash} className="w-full max-h-[520px] object-cover" alt="post" />
                                )}
                              </div>
                            )}

                            <div className="flex items-center gap-0.5 -ml-2 mt-1 flex-wrap">
                              <button onClick={() => handleLike(post.id)} disabled={isLiking || !isConnected}
                                title={!isConnected ? t('connectWallet') : ''}
                                className="flex items-center gap-1.5 text-[#5B6271] hover:text-[#FF6B35] hover:bg-[#FFF0EB] rounded-xl px-3 py-2 text-sm transition-all group disabled:opacity-50 disabled:hover:bg-transparent">
                                <span className={`text-lg inline-block transition-transform ${animatingLike === key ? 'animate-flame-pop' : 'group-hover:scale-125'}`}>🔥</span>
                                <span className="font-bold">{post.likes.toString()}</span>
                                <span className="text-[11px] opacity-60 hidden sm:inline"></span>
                              </button>

                              <button onClick={() => toggleComments(key)}
                                className={`flex items-center gap-1.5 hover:bg-[#E6EEFF] rounded-xl px-3 py-2 text-sm transition-all ${expandedComments[key] ? 'text-[#0052FF] bg-[#E6EEFF]' : 'text-[#5B6271] hover:text-[#0052FF]'}`}>
                                <span className="text-lg">💬</span>
                                <span className="font-bold">{comments.length > 0 ? comments.length : ''}</span>
                              </button>

                              <button onClick={() => quotePost(post)}
                                title="Repost / quote"
                                className="flex items-center gap-1 text-[#5B6271] hover:text-[#0052FF] hover:bg-[#E6EEFF] rounded-xl px-3 py-2 text-sm transition-all">
                                <span className="text-lg">🔁</span>
                              </button>

                              <div className="flex items-center gap-1 ml-auto">
                                {[0.5, 1, 5].map(amt => (
                                  <button key={amt} onClick={() => handleTip(post.id, amt)} disabled={isTipping || !isConnected}
                                    className="bg-[#F0F4FF] hover:bg-[#0052FF] hover:text-white text-[#0052FF] disabled:opacity-40 px-2 py-1.5 rounded-lg text-xs font-bold transition-all">
                                    ${amt}
                                  </button>
                                ))}
                                <div className="flex items-center">
                                  <span className="text-[#8A919E] text-xs mr-0.5">$</span>
                                  <input type="number" placeholder="0"
                                    value={tipAmounts[key] || ''}
                                    onChange={e => setTipAmounts(prev => ({ ...prev, [key]: e.target.value }))}
                                    disabled={!isConnected}
                                    className="w-12 bg-white border border-[#E4E7EB] rounded-lg px-1 py-1.5 text-xs text-[#0A0B0D] text-center focus:outline-none focus:border-[#0052FF] disabled:opacity-50"
                                    step="0.5" min="0.1" />
                                </div>
                                <button onClick={() => handleTip(post.id)} disabled={isTipping || !tipAmounts[key] || !isConnected}
                                  className="bg-[#0052FF] hover:bg-[#1652F0] text-white disabled:opacity-40 px-2 py-1.5 rounded-lg text-xs font-bold transition-all">
                                  {isTipping ? '…' : '💸'}
                                </button>
                              </div>
                            </div>

                            {post.tips > 0n && (
                              <p className="text-xs text-[#0052FF] mt-1 ml-1 font-semibold">{parseFloat(formatEther(post.tips)).toFixed(4)} {t('tippedTotal')}</p>
                            )}
                          </div>
                        </div>

                        {expandedComments[key] && (
                          <div className="mt-4 ml-[52px] border-l-2 border-[#E4E7EB] pl-3 space-y-1">
                            {comments.length === 0 && (
                              <p className="text-[#8A919E] text-sm py-2">{t('noComments')}</p>
                            )}
                            {comments.map((c, idx) => (
                              <div key={idx} className="flex items-start gap-2 py-2 px-2 hover:bg-[#F7F9FC] rounded-xl transition-colors group">
                                <Avatar addr={c.commenter} profiles={profiles} size="sm" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="font-bold text-sm text-[#0A0B0D]">{getUsername(c.commenter)}</span>
                                    <span className="text-[#8A919E] text-xs">{timeAgo(c.timestamp)}</span>
                                  </div>
                                  <p className="text-[#0A0B0D] text-sm leading-relaxed">{c.text}</p>
                                </div>
                                {isConnected && (
                                  <button onClick={() => setReply(key, c.commenter)}
                                    className="opacity-0 group-hover:opacity-100 text-[#8A919E] hover:text-[#0052FF] text-xs transition-all px-2 py-1 rounded-lg hover:bg-[#E6EEFF] flex-shrink-0">
                                    {t('reply')}
                                  </button>
                                )}
                              </div>
                            ))}

                            {isConnected ? (
                              <div className="flex gap-2 pt-2">
                                <Avatar addr={address!} profiles={profiles} size="sm" />
                                <div className="flex-1 min-w-0 flex flex-wrap gap-2">
                                  <input type="text"
                                    placeholder={replyingTo[key] ? t('replyPlaceholder', { user: replyingTo[key] }) : t('commentPlaceholder')}
                                    value={commentTexts[key] || ''}
                                    onChange={e => setCommentTexts(prev => ({ ...prev, [key]: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && handleComment(post.id)}
                                    enterKeyHint="send"
                                    className="flex-1 min-w-[140px] bg-white border border-[#E4E7EB] rounded-xl px-3 py-2 text-sm text-[#0A0B0D] placeholder-[#8A919E] focus:outline-none focus:border-[#0052FF]"
                                  />
                                  <div className="flex gap-2 flex-shrink-0 ml-auto">
                                    <EmojiPicker onSelect={e => setCommentTexts(prev => ({ ...prev, [key]: (prev[key] || '') + e }))} />
                                    <button onClick={() => handleComment(post.id)} disabled={isCommenting || !commentTexts[key]}
                                      className="flex-shrink-0 bg-[#0052FF] hover:bg-[#1652F0] text-white disabled:opacity-40 px-4 py-2 rounded-xl text-sm font-bold transition-colors">
                                      {isCommenting ? '...' : '↑'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="pt-3 px-2">
                                <div className="flex items-center justify-between bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-3">
                                  <p className="text-[#5B6271] text-sm">{t('connectToComment')}</p>
                                  <button onClick={isInFarcaster ? connectFarcaster : openWallet}
                                    className="bg-[#0052FF] hover:bg-[#1652F0] text-white font-bold text-xs px-3 py-2 rounded-xl transition-colors flex-shrink-0">
                                    {t('connectWallet')}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })}

                {/* Load more / all loaded — sentinel auto-loads on scroll */}
                {activeTab === 'feed' && !showBookmarks && !searchQuery && posts.length > 0 && (
                  <div ref={loadMoreRef} className="py-6 flex justify-center">
                    {allPostsLoaded ? (
                      <p className="text-[#8A919E] text-sm">{t('allPostsLoaded')}</p>
                    ) : (
                      <button
                        onClick={() => nextPostIndex !== null && loadPostsBatch(nextPostIndex, true)}
                        disabled={loadingMore || nextPostIndex === null}
                        className="flex items-center gap-2 bg-[#F0F4FF] hover:bg-[#E6EEFF] text-[#0052FF] font-bold text-sm px-6 py-3 rounded-2xl transition-colors disabled:opacity-50">
                        {loadingMore ? (
                          <><span className="animate-spin">⏳</span> {t('uploading')}</>
                        ) : (
                          <>⬇️ {t('loadMore')}</>
                        )}
                      </button>
                    )}
                  </div>
                )}

              </div>
            )}

            {/* ══ CREATE POST ══ */}
            {activeTab === 'post' && (
              <div className="p-4 md:p-6">
                <h1 className="text-xl font-black mb-5 hidden md:block text-[#0A0B0D]">{t('newPostTitle')}</h1>
                {!isConnected ? (
                  <ConnectPrompt message={t('connectToPost')} label={t('connectWallet')} onConnect={isInFarcaster ? connectFarcaster : openWallet} />
                ) : !hasProfile ? (
                  <div className="bg-white border border-[#E4E7EB] rounded-2xl p-6 shadow-sm">
                    <div className="text-center mb-5">
                      <FlameLogo size={48} />
                      <h2 className="text-xl font-black text-[#0A0B0D] mt-3">{t('createProfileFirst')}</h2>
                      <p className="text-[#5B6271] text-sm mt-2">{t('createProfileSub')}</p>
                    </div>
                    <input type="text" placeholder={t('username')} value={newUsername}
                      onChange={e => setNewUsername(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && createProfile()}
                      className="w-full bg-white border border-[#E4E7EB] rounded-xl px-4 py-3 mb-3 text-[#0A0B0D] placeholder-[#8A919E] focus:outline-none focus:border-[#0052FF]"
                    />
                    <button onClick={createProfile} disabled={loading || !newUsername}
                      className="w-full bg-[#0052FF] hover:bg-[#1652F0] text-white py-3 rounded-xl font-bold disabled:opacity-40 transition-colors shadow-sm">
                      {loading ? t('creating') : t('createProfile')}
                    </button>
                  </div>
                ) : (
                  <div className="bg-white border border-[#E4E7EB] rounded-2xl overflow-hidden shadow-sm">
                    <div className="flex items-center gap-3 p-4 border-b border-[#EEF1F5]">
                      <Avatar addr={address!} profiles={profiles} />
                      <div>
                        <p className="font-bold text-[#0A0B0D]">{myProfile?.[0]}</p>
                        <p className="text-xs text-[#5B6271]">Post fee: $0.04</p>
                      </div>
                    </div>
                    {quotingPost && (
                      <div className="mx-4 mt-3 p-3 bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl text-sm">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-black text-[#8A919E] uppercase">Quoting</span>
                          <span className="font-bold text-[#0A0B0D] text-xs">{getUsername(quotingPost.author)}</span>
                          <button onClick={() => { setQuotingPost(null); setNewPost('') }} className="ml-auto text-[#8A919E] hover:text-red-500 text-xs">✕</button>
                        </div>
                        <p className="text-[#5B6271] text-xs line-clamp-2">{quotingPost.content || '📎 media'}</p>
                      </div>
                    )}
                    <textarea placeholder={t('postPlaceholder')} value={newPost}
                      onChange={e => setNewPost(e.target.value)} rows={6}
                      className="w-full bg-transparent px-5 py-4 text-[#0A0B0D] placeholder-[#8A919E] resize-none focus:outline-none text-[16px] leading-relaxed" />
                    {previewUrl && (
                      <div className="relative mx-4 mb-4 rounded-2xl overflow-hidden border border-[#E4E7EB]">
                        {selectedFile?.type.startsWith('video/') ? (
                          <video src={previewUrl} controls className="w-full max-h-80 bg-black" />
                        ) : (
                          <img src={previewUrl} className="w-full max-h-80 object-cover" alt="preview" />
                        )}
                        <button onClick={() => { setSelectedFile(null); setPreviewUrl(null) }}
                          className="absolute top-3 right-3 bg-black/70 backdrop-blur rounded-full w-8 h-8 flex items-center justify-center text-white text-sm hover:bg-black transition-colors">✕</button>
                      </div>
                    )}
                    {showPollCreator && (
                      <div className="px-5 py-3 border-t border-[#EEF1F5] bg-[#FAFBFD] space-y-2">
                        <p className="text-xs font-black text-[#5B6271] uppercase tracking-wide">📊 Poll</p>
                        <input value={pollQuestion} onChange={e => setPollQuestion(e.target.value)}
                          placeholder="Poll question..." maxLength={100}
                          className="w-full bg-white border border-[#E4E7EB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0052FF]" />
                        {pollOptions.map((opt, i) => (
                          <div key={i} className="flex gap-2">
                            <input value={opt} onChange={e => { const next = [...pollOptions]; next[i] = e.target.value; setPollOptions(next) }}
                              placeholder={`Option ${i + 1}`} maxLength={60}
                              className="flex-1 bg-white border border-[#E4E7EB] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#0052FF]" />
                            {pollOptions.length > 2 && (
                              <button onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 px-2">✕</button>
                            )}
                          </div>
                        ))}
                        {pollOptions.length < 4 && (
                          <button onClick={() => setPollOptions([...pollOptions, ''])} className="text-[#0052FF] text-xs font-bold hover:underline">+ Add option</button>
                        )}
                        <button onClick={() => {
                          if (!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2) return
                          const validOpts = pollOptions.filter(o => o.trim())
                          const pollStr = `[POLL]${pollQuestion}[OPTIONS]${validOpts.join('|')}[/POLL]`
                          setNewPost(prev => pollStr + (prev ? '\n\n' + prev : ''))
                          setShowPollCreator(false)
                          setPollQuestion('')
                          setPollOptions(['', ''])
                        }} disabled={!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                        className="w-full bg-purple-500 hover:bg-purple-600 text-white py-2 rounded-lg text-xs font-bold disabled:opacity-40 transition-colors">
                          Add Poll to Post
                        </button>
                      </div>
                    )}
                    {tokenGateEnabled && (
                      <div className="px-5 py-3 border-t border-[#EEF1F5] bg-[#FFFBEB] space-y-2">
                        <p className="text-xs font-black text-yellow-700 uppercase tracking-wide">🔒 Token Gate</p>
                        <input value={tokenGateAddress} onChange={e => setTokenGateAddress(e.target.value)}
                          placeholder="ERC-20 token address (0x...)" maxLength={42}
                          className="w-full bg-white border border-yellow-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-yellow-500" />
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-yellow-700">Min balance:</span>
                          <input value={tokenGateMin} onChange={e => setTokenGateMin(e.target.value)}
                            type="number" min="1"
                            className="w-24 bg-white border border-yellow-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-yellow-500" />
                        </div>
                        <button onClick={() => {
                          if (!tokenGateAddress.match(/^0x[a-fA-F0-9]{40}$/)) { showToast('error', 'Invalid token address'); return }
                          const prefix = `[GATE:${tokenGateAddress}:${tokenGateMin}]`
                          setNewPost(prev => prefix + (prev || ''))
                          setTokenGateEnabled(false)
                          setTokenGateAddress('')
                        }} className="w-full bg-yellow-500 hover:bg-yellow-600 text-white py-2 rounded-lg text-xs font-bold transition-colors">
                          Apply Token Gate
                        </button>
                      </div>
                    )}
                    <div className="border-t border-[#EEF1F5]">
                      <div className="flex items-center gap-3 px-4 pt-3 pb-2 flex-wrap">
                        <label className="cursor-pointer text-[#5B6271] hover:text-[#0052FF] transition-colors">
                          <span className="text-2xl">📷</span>
                          <input type="file" accept="image/*,video/*" className="hidden" onChange={handleFileChange} />
                        </label>
                        <button
                          onClick={async () => {
                            if (!newPost.trim() || improving) return
                            setImproving(true)
                            try {
                              const res = await fetch('/api/ai', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ messages: [{ role: 'user', content: newPost }], type: 'improve' }),
                              })
                              const data = await res.json()
                              if (data.content) setNewPost(data.content)
                            } catch {}
                            setImproving(false)
                          }}
                          disabled={!newPost.trim() || improving}
                          title="Improve with AI"
                          className="flex items-center gap-1.5 bg-gradient-to-r from-[#7B3FE4] to-[#0052FF] text-white px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40 transition-all hover:opacity-90 flex-shrink-0">
                          {improving ? '…' : '✨ AI'}
                        </button>
                        <button type="button" onClick={() => setShowPollCreator(p => !p)}
                          title="Add poll"
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${showPollCreator ? 'bg-purple-100 text-purple-600' : 'bg-[#F0F2F5] text-[#5B6271] hover:bg-purple-100 hover:text-purple-600'}`}>
                          📊 Poll
                        </button>
                        <button type="button" onClick={() => setTokenGateEnabled(t => !t)}
                          title="Token gate this post"
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex-shrink-0 ${tokenGateEnabled ? 'bg-yellow-100 text-yellow-700' : 'bg-[#F0F2F5] text-[#5B6271] hover:bg-yellow-100 hover:text-yellow-700'}`}>
                          🔒 Gate
                        </button>
                        <EmojiPicker onSelect={e => setNewPost(prev => prev + e)} />
                        <span className="text-[#8A919E] text-xs ml-auto">{newPost.length}/500</span>
                      </div>
                      <div className="px-4 pb-3">
                        <button onClick={createPost} disabled={loading || !newPost}
                          className="w-full bg-[#0052FF] hover:bg-[#1652F0] text-white py-3 rounded-xl font-bold disabled:opacity-40 transition-colors shadow-sm">
                          {loading ? t('posting') : t('post')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}


            {/* ══ ACTIVITY ══ */}
            {activeTab === 'activity' && (
              <div className="p-4 md:p-6">
                <h1 className="text-xl font-black text-[#0A0B0D] mb-4">🔔 Activity</h1>
                {!isConnected ? (
                  <p className="text-[#8A919E] text-sm">Connect your wallet to see activity.</p>
                ) : myPosts.length === 0 ? (
                  <p className="text-[#8A919E] text-sm">No posts yet. Activity from your posts will appear here.</p>
                ) : (
                  <div className="space-y-3">
                    {myPosts.slice().sort((a, b) => Number(b.likes + b.tips) - Number(a.likes + a.tips)).map(post => {
                      const key = post.id.toString()
                      const prev = seenActivity[key] ?? 0
                      const current = Number(post.likes)
                      const isNew = current > prev
                      const commentCount = postComments[key]?.length ?? 0
                      return (
                        <div key={key} className={`flex items-start gap-3 p-4 rounded-2xl border transition-colors ${isNew ? 'border-[#0052FF] bg-[#F0F4FF]' : 'border-[#EEF1F5] bg-white'}`}>
                          {isNew && <span className="w-2 h-2 rounded-full bg-red-500 mt-1.5 flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[#0A0B0D] truncate font-medium">{post.content.slice(0, 80)}{post.content.length > 80 ? '…' : ''}</p>
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              <span className="text-xs text-[#5B6271]">🔥 {post.likes.toString()} flames</span>
                              <span className="text-xs text-[#5B6271]">💬 {commentCount} comments</span>
                              <span className="text-xs text-[#5B6271]">💸 {parseFloat(formatEther(post.tips)).toFixed(4)} ETH</span>
                              {isNew && <span className="text-xs font-black text-[#0052FF]">+{current - prev} new</span>}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ══ MESSAGES ══ */}
            {activeTab === 'messages' && (
              <div className="-mb-24 md:mb-0">
                <h1 className="hidden md:block text-xl font-black px-4 md:px-6 pt-4 md:pt-6 text-[#0A0B0D]">{t('navMessages')}</h1>
                <Messages profiles={profiles} fixedFee={fixedFee} pendingTarget={pendingDmTarget} onPendingHandled={() => setPendingDmTarget(null)} onUnreadCount={setUnreadMessages} />
              </div>
            )}

            {/* ══ AI CHAT + TOKEN ANALYZER ══ — keep mounted once first visited so chat history persists across tab switches */}
            {(activeTab === 'ai' || aiEverOpened) && (
              <div style={{ display: activeTab === 'ai' ? undefined : 'none' }}>
                <AITabContent />
              </div>
            )}

            {/* ══ REELS ══ — keep mounted once first visited so video plays in background */}
            {(activeTab === 'reels' || reelsEverOpened) && (
              <div style={{ display: activeTab === 'reels' ? undefined : 'none' }}>
                <div className="hidden md:flex items-center justify-between px-5 py-4 border-b border-[#EEF1F5] sticky top-0 bg-white/95 backdrop-blur z-10">
                  <h1 className="text-lg font-black text-[#0A0B0D]">🎬 Reels</h1>
                  <span className="text-xs text-[#8A919E]">Global popular videos</span>
                </div>
                <Reels />
              </div>
            )}

            {/* ══ PROFILE ══ */}
            {activeTab === 'profile' && (
              <div className="p-4 md:p-6 space-y-4">
                <h1 className="text-xl font-black hidden md:block text-[#0A0B0D]">{t('profileTitle')}</h1>

                {!isConnected ? (
                  <ConnectPrompt message={t('connectToProfile')} label={t('connectWallet')} onConnect={isInFarcaster ? connectFarcaster : openWallet} />
                ) : !hasProfile ? (
                  <div className="bg-white border border-[#E4E7EB] rounded-2xl p-6 shadow-sm">
                    <div className="text-center mb-5">
                      <FlameLogo size={48} />
                      <h2 className="text-xl font-black text-[#0A0B0D] mt-3">{t('createProfile')}</h2>
                      <p className="text-[#5B6271] text-sm mt-2">{t('createProfileSub')}</p>
                    </div>
                    <input type="text" placeholder={t('username')} value={newUsername}
                      onChange={e => setNewUsername(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && createProfile()}
                      className="w-full bg-white border border-[#E4E7EB] rounded-xl px-4 py-3 mb-3 text-[#0A0B0D] placeholder-[#8A919E] focus:outline-none focus:border-[#0052FF]"
                    />
                    <button onClick={createProfile} disabled={loading || !newUsername}
                      className="w-full bg-[#0052FF] hover:bg-[#1652F0] text-white py-3 rounded-xl font-bold disabled:opacity-40 transition-colors shadow-sm">
                      {loading ? 'Creating...' : 'Create Profile'}
                    </button>
                  </div>
                ) : myProfile ? (
                  <>
                    <div className="bg-white border border-[#E4E7EB] rounded-2xl overflow-hidden shadow-sm">
                      <div className="px-6 pb-6 pt-6">
                        <div className="relative mb-4 inline-block">
                          <Avatar addr={address!} profiles={profiles} size="lg" />
                          <label className="absolute bottom-0 right-0 w-7 h-7 bg-[#0052FF] hover:bg-[#1652F0] rounded-full flex items-center justify-center cursor-pointer shadow-md transition-colors">
                            <span className="text-white text-xs">📷</span>
                            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploadingAvatar} />
                          </label>
                          {uploadingAvatar && (
                            <div className="absolute inset-0 bg-white/70 rounded-full flex items-center justify-center">
                              <span className="text-xs">...</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-2xl font-black text-[#0A0B0D]">{myProfile[0]}</h2>
                          {verifiedAddresses[address!.toLowerCase()] && <VerifiedBadge size="lg" />}
                          {premiumUsers.has(address!.toLowerCase()) && <span className="text-yellow-500 text-2xl" title="Premium member">✨</span>}
                        </div>
                        <p className="text-[#5B6271] text-sm mb-1">{address?.slice(0,10)}...{address?.slice(-6)}</p>
                        {walletBalance && (
                          <p className="text-[#0052FF] text-sm font-bold mb-5 flex items-center gap-1.5">
                            {balanceHidden ? '••••••' : `${parseFloat(formatEther(walletBalance.value)).toFixed(4)} ETH`}
                            {!balanceHidden && <span className="text-[#8A919E] font-normal">{t('balance')}</span>}
                            <button onClick={toggleBalanceHidden}
                              title={balanceHidden ? t('showBalance') : t('hideBalance')}
                              className="text-[#8A919E] hover:text-[#0052FF] transition-colors">
                              {balanceHidden ? '👁️' : '🙈'}
                            </button>
                          </p>
                        )}
                        <div className="flex items-center gap-6 mb-3 pb-4 border-b border-[#EEF1F5] flex-wrap">
                          <button onClick={() => setProfileList(profileList === 'following' ? null : 'following')}
                            className={`text-left transition-opacity hover:opacity-70 ${profileList === 'following' ? 'opacity-100' : ''}`}>
                            <p className="text-xl font-extrabold text-[#0A0B0D] leading-tight">{following.size}</p>
                            <p className="text-[#8A919E] text-xs">{t('following')}</p>
                          </button>
                          <button onClick={() => setProfileList(profileList === 'followers' ? null : 'followers')}
                            className="text-left transition-opacity hover:opacity-70">
                            <p className="text-xl font-extrabold text-[#0A0B0D] leading-tight">{myFollowerCount !== undefined ? myFollowerCount.toString() : '—'}</p>
                            <p className="text-[#8A919E] text-xs">{t('followers')}</p>
                          </button>
                          <div>
                            <p className="text-xl font-extrabold text-[#0A0B0D] leading-tight">{myProfile[3].toString()}</p>
                            <p className="text-[#8A919E] text-xs">🔥 {t('flames')}</p>
                          </div>
                        </div>

                        {/* Following / followers list, toggled from the stats above */}
                        {profileList && (
                          <div className="mb-3 pb-3 border-b border-[#EEF1F5]">
                            {(() => {
                              const list = profileList === 'following' ? [...following] : followersList
                              const loading = profileList === 'followers' && followersLoading
                              if (loading) return <p className="text-[#8A919E] text-sm py-2">{t('loading')}</p>
                              if (list.length === 0) return <p className="text-[#8A919E] text-sm py-2">{profileList === 'following' ? t('noFollowing') : t('noFollowers')}</p>
                              return (
                                <div className="space-y-1">
                                  {list.map(addr => (
                                    <div key={addr} className="flex items-center gap-3 py-1.5 px-2 hover:bg-[#F7F9FC] rounded-xl transition-colors">
                                      <button onClick={() => setSelectedUser(addr)} className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                                        <Avatar addr={addr} profiles={profiles} size="sm" />
                                        <div className="min-w-0 text-left">
                                          <p className="text-sm font-bold truncate text-[#0A0B0D]">{profiles[addr]?.username || `${addr.slice(0,6)}…${addr.slice(-4)}`}</p>
                                          <p className="text-xs text-[#8A919E] truncate">{addr.slice(0,8)}…</p>
                                        </div>
                                      </button>
                                      {profileList === 'following' && (
                                        <button onClick={() => unfollowUser(addr)} disabled={loadingAction === `follow-${addr.toLowerCase()}`}
                                          className="text-xs text-red-400 hover:text-red-600 font-bold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0 disabled:opacity-50">
                                          {loadingAction === `follow-${addr.toLowerCase()}` ? '…' : t('unfollow')}
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )
                            })()}
                          </div>
                        )}
                        <a href={`https://basescan.org/address/${address}`} target="_blank"
                          className="flex items-center justify-center gap-2 mt-4 text-[#5B6271] hover:text-[#0052FF] text-sm transition-colors font-semibold">
                          {t('viewBasescan')}
                        </a>
                      </div>
                    </div>

                    {/* Check-in streak badge */}
                    {TOOLS_DEPLOYED && Number(userStreakDays || 0) > 0 && (
                      <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-2xl p-4 mb-4 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold text-orange-600 uppercase tracking-wider">Check-in Streak</p>
                          <p className="text-2xl font-black text-[#0A0B0D] mt-0.5">
                            {streakBadge(Number(userStreakDays)).emoji} {streakBadge(Number(userStreakDays)).label}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-black text-orange-600">{Number(userStreakDays)}</p>
                          <p className="text-[#8A919E] text-xs font-semibold">days · best {Number(userMaxStreak || 0)}</p>
                        </div>
                      </div>
                    )}

                    {/* Base Wallet Analysis */}
                    <div className="bg-white border border-[#E4E7EB] rounded-2xl shadow-sm overflow-hidden mb-4">
                      <WalletChecker />
                    </div>

                    {/* Most Popular Post — highest-liked post the user has written */}
                    {(() => {
                      if (myPosts.length === 0) return null
                      const top = [...myPosts].sort((a, b) => Number(b.likes - a.likes) || Number(b.tips - a.tips))[0]
                      if (top.likes === 0n && top.tips === 0n) return null
                      return (
                        <div className="bg-white border border-[#E4E7EB] rounded-2xl p-5 shadow-sm mb-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-lg">🏆</span>
                            <h3 className="font-black text-[#0A0B0D]">Most popular post</h3>
                          </div>
                          <button
                            onClick={() => setActiveTab('feed')}
                            className="w-full text-left bg-[#FAFBFD] hover:bg-[#F0F4FF] rounded-xl p-4 transition-colors border border-[#EEF1F5]"
                          >
                            {top.content && (
                              <p className="text-[#0A0B0D] text-sm leading-relaxed mb-3 line-clamp-3 whitespace-pre-wrap">{top.content}</p>
                            )}
                            {top.ipfsHash && !top.content && (
                              <p className="text-[#8A919E] text-sm mb-3">📎 Media post</p>
                            )}
                            <div className="flex items-center gap-4 text-xs">
                              <span className="font-bold text-[#FF6B35]">🔥 {top.likes.toString()}</span>
                              {top.tips > 0n && (
                                <span className="font-bold text-[#0052FF]">💸 {parseFloat(formatEther(top.tips)).toFixed(4)} ETH</span>
                              )}
                              <span className="text-[#8A919E] ml-auto">Post #{top.id.toString()}</span>
                            </div>
                          </button>
                        </div>
                      )
                    })()}

                    {/* My Posts grid */}
                    {myPosts.length > 0 && (
                      <div className="bg-white border border-[#E4E7EB] rounded-2xl overflow-hidden shadow-sm mb-4">
                        <div className="flex items-center justify-between px-5 py-3 border-b border-[#EEF1F5]">
                          <h3 className="font-black text-[#0A0B0D]">My Posts</h3>
                          <span className="text-xs text-[#8A919E]">{myPosts.length} post{myPosts.length !== 1 ? 's' : ''}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-0.5 bg-[#EEF1F5]">
                          {myPosts.slice(0, 9).map(post => (
                            <button key={post.id.toString()} onClick={() => setActiveTab('feed')}
                              className="aspect-square bg-[#F7F9FC] hover:opacity-80 transition-opacity overflow-hidden relative">
                              {post.ipfsHash?.startsWith('vid_') ? (
                                <div className="w-full h-full flex items-center justify-center bg-black">
                                  <span className="text-white text-2xl">▶</span>
                                </div>
                              ) : post.ipfsHash ? (
                                <IpfsImage hash={post.ipfsHash} className="w-full h-full object-cover" alt="" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center p-2">
                                  <p className="text-xs text-[#5B6271] text-center line-clamp-3 leading-tight">{post.content}</p>
                                </div>
                              )}
                              <div className="absolute bottom-1 right-1 flex items-center gap-0.5 bg-black/50 rounded px-1 py-0.5">
                                <span className="text-[10px] text-white">🔥{post.likes.toString()}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                        {myPosts.length > 9 && (
                          <button onClick={() => setActiveTab('feed')}
                            className="w-full py-2.5 text-xs text-[#0052FF] font-bold hover:bg-[#F0F4FF] transition-colors border-t border-[#EEF1F5]">
                            View all {myPosts.length} posts →
                          </button>
                        )}
                      </div>
                    )}

                    {/* Admin only */}
                    {isAdmin && (
                      <div className="bg-white border border-[#0052FF]/30 rounded-2xl p-5 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                          <span>👑</span>
                          <p className="text-[#0052FF] font-black text-lg">{t('adminPanel')}</p>
                        </div>

                        {/* Wallet balance + withdraw */}
                        <div className="bg-[#F0F4FF] border border-[#D6E2FF] rounded-xl p-4 mb-4">
                          <p className="text-[#5B6271] text-xs font-semibold uppercase tracking-wider mb-2">{t('walletBalance')}</p>
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-2xl font-black text-[#0A0B0D]">
                                {walletBalance ? `${parseFloat(formatEther(walletBalance.value)).toFixed(6)} ETH` : '—'}
                              </p>
                              <p className="text-[#8A919E] text-xs mt-0.5">{t('adminAutoSend')}</p>
                            </div>
                            <div className="flex flex-col gap-2">
                              <button onClick={() => refetchBalance()}
                                className="bg-white border border-[#D6E2FF] text-[#0052FF] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#E6EEFF] transition-colors">
                                {t('refresh')}
                              </button>
                              <a href={`https://basescan.org/address/${address}`} target="_blank"
                                className="bg-[#0052FF] hover:bg-[#1652F0] text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors text-center">
                                {t('withdraw')}
                              </a>
                            </div>
                          </div>
                        </div>

                        {/* Logo NFT deploy — always shown so admin can redeploy with fixed metadata */}
                        <div className="bg-gradient-to-br from-orange-500 to-red-500 rounded-xl p-4 mb-3 text-white">
                          <p className="font-black text-sm mb-1">
                            {FLAME_NFT_ADDRESS ? '🔄 Re-deploy Logo NFT (Fix Image)' : '🎨 Deploy Logo NFT Collection'}
                          </p>
                          <p className="text-white/80 text-xs mb-3">
                            {FLAME_NFT_ADDRESS
                              ? 'If the image is missing, re-deploy. Save the new address to Vercel as NEXT_PUBLIC_FLAME_NFT.'
                              : 'Uploads logo to IPFS + deploys 10,000 maxSupply / $0.50 mint price NFT collection on Base.'}
                          </p>
                          {deployedLogoNftAddr && (
                            <div className="bg-white/10 rounded-lg p-2 mb-2 text-xs break-all font-mono space-y-1">
                              <p>✅ Contract: {deployedLogoNftAddr}</p>
                              <p className="text-white/70">→ Save as NEXT_PUBLIC_FLAME_NFT in Vercel</p>
                            </div>
                          )}
                          <button
                            onClick={deployLogoNft}
                            disabled={deployingLogoNft || !NFT_FACTORY_DEPLOYED}
                            className="w-full bg-white text-orange-600 py-2.5 rounded-lg font-black text-sm hover:bg-white/90 disabled:opacity-50 transition-colors"
                          >
                            {deployingLogoNft ? 'Deploying… (1-2 min)' : FLAME_NFT_ADDRESS ? '🔄 Re-deploy' : '🎨 Deploy FlameBase Logo NFT'}
                          </button>
                        </div>

                        <div className="space-y-2">
                          <a href={`https://basescan.org/address/${CONTRACT_ADDRESS}#writeContract`} target="_blank"
                            className="flex items-center justify-between bg-[#E6EEFF] border border-[#D6E2FF] text-[#0052FF] py-3 px-4 rounded-xl text-sm hover:bg-[#D6E2FF] transition-colors font-semibold">
                            <span>⚙️ Manual price control on Basescan</span><span>↗</span>
                          </a>
                          <a href={`https://basescan.org/address/${CONTRACT_ADDRESS}`} target="_blank"
                            className="flex items-center justify-between bg-[#F7F9FC] border border-[#E4E7EB] text-[#5B6271] py-3 px-4 rounded-xl text-sm hover:text-[#0A0B0D] transition-colors font-semibold">
                            <span>📊 {t('contractStats')}</span><span>↗</span>
                          </a>
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            )}
          {/* ══ TOOLS ══ */}
          {activeTab === 'tools' && (
            <div className="p-4 pb-24 space-y-4">
              <h1 className="text-xl font-black text-[#0A0B0D]">🛠️ Tools</h1>

              {/* FlameBase Logo NFT mint card */}
              {logoNftDeployed && (
                <div className="bg-gradient-to-br from-orange-500 via-red-500 to-pink-500 rounded-2xl p-5 text-white shadow-lg">
                  <div className="flex items-center gap-4">
                    <img src="/logo.png" alt="FlameBase Logo" className="w-16 h-16 rounded-xl bg-white/10 p-1.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-base">🎨 FlameBase Logo NFT</p>
                      <p className="text-white/80 text-xs mt-0.5">Official collection on Base</p>
                      {logoNftTotalSupply !== undefined && logoNftMaxSupply !== undefined && (
                        <div className="mt-2">
                          <div className="flex justify-between text-[10px] mb-1">
                            <span>Minted</span>
                            <span className="font-bold">{(logoNftTotalSupply as bigint).toString()} / {(logoNftMaxSupply as bigint).toString()}</span>
                          </div>
                          <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                            <div className="h-full bg-white" style={{ width: `${Math.min(100, Number((logoNftTotalSupply as bigint) * 100n / (logoNftMaxSupply as bigint)))}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {logoNftBalance !== undefined && (logoNftBalance as bigint) > 0n && (
                      <span className="bg-white/20 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg">
                        ✨ You own {(logoNftBalance as bigint).toString()}
                      </span>
                    )}
                    <button
                      onClick={mintLogoNft}
                      disabled={!isConnected || mintingLogoNft || logoNftMintPrice === undefined || (logoNftTotalSupply !== undefined && logoNftMaxSupply !== undefined && (logoNftTotalSupply as bigint) >= (logoNftMaxSupply as bigint))}
                      className="ml-auto bg-white hover:bg-white/90 text-orange-600 disabled:opacity-50 font-black text-sm px-5 py-2.5 rounded-xl transition-colors shadow-sm"
                    >
                      {mintingLogoNft ? 'Minting…' : !isConnected ? 'Connect to mint' : logoNftMintPrice === undefined ? 'Loading…' : (logoNftTotalSupply !== undefined && logoNftMaxSupply !== undefined && (logoNftTotalSupply as bigint) >= (logoNftMaxSupply as bigint)) ? 'Sold out' : '🔥 Mint $0.50'}
                    </button>
                  </div>
                </div>
              )}

              {/* $FLM Token — trade on Uniswap (Base) */}
              <a
                href={FLM_TRADE_URL}
                target="_blank" rel="noopener noreferrer"
                className="block bg-gradient-to-br from-[#0052FF] via-[#1652F0] to-[#4D8FFF] rounded-2xl p-5 text-white shadow-lg hover:opacity-95 transition-opacity"
              >
                <div className="flex items-center gap-4">
                  <img src="/logo.png" alt="$FLM" className="w-14 h-14 rounded-xl bg-white/10 p-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-base">$FLM Token</p>
                      <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full font-bold">BASE</span>
                    </div>
                    <p className="text-white/80 text-xs mt-0.5">FlameBase&apos;s native token — trade it on Uniswap</p>
                  </div>
                </div>
                <div className="mt-3 bg-white text-[#0052FF] font-black text-sm px-5 py-2.5 rounded-xl text-center shadow-sm">
                  🦄 Trade on Uniswap ↗
                </div>
              </a>

              <div className="bg-white border border-[#E4E7EB] rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-[#EEF1F5]">
                  <p className="text-sm font-black text-[#0A0B0D]">🏦 Wallet Analyzer</p>
                  <p className="text-xs text-[#8A919E]">Real on-chain stats, badges &amp; score</p>
                </div>
                <WalletChecker />
              </div>

              <div className="bg-white border border-[#E4E7EB] rounded-2xl p-4 space-y-3">
                <p className="text-sm font-black text-[#0A0B0D]">⚡ On-Chain Actions</p>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => { if (!TOOLS_DEPLOYED) return; toolAction(async () => { await writeContractAsync({ address: TOOLS_ADDRESS, abi: TOOLS_ABI, functionName: 'count', value: fixedFee }) }, setCounterLoading) }}
                    disabled={!TOOLS_DEPLOYED || counterLoading}
                    className="flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl bg-[#F8FAFF] border border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF] disabled:opacity-40 transition-all">
                    <span className="font-mono text-[#0052FF] font-black text-lg">[##]</span>
                    <span className="text-xs font-bold">{counterLoading ? '…' : 'Counter'}</span>
                  </button>
                  <button onClick={() => { if (!TOOLS_DEPLOYED || canCheckIn === false) return; toolAction(async () => { await writeContractAsync({ address: TOOLS_ADDRESS, abi: TOOLS_ABI, functionName: 'checkIn', value: fixedFee }) }, setStreakLoading) }}
                    disabled={!TOOLS_DEPLOYED || streakLoading || canCheckIn === false}
                    className="flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl bg-[#F8FAFF] border border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF] disabled:opacity-40 transition-all">
                    <span className="font-mono text-[#0052FF] font-black text-lg">[~]</span>
                    <span className="text-xs font-bold">{streakLoading ? '…' : canCheckIn === false ? '✓ Done' : 'Streak'}</span>
                  </button>
                  <button onClick={() => setActiveTool(activeTool === 'logbook' ? null : 'logbook')}
                    disabled={!TOOLS_DEPLOYED}
                    className={`flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl border transition-all disabled:opacity-40 ${activeTool === 'logbook' ? 'bg-[#E6EEFF] border-[#0052FF]' : 'bg-[#F8FAFF] border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF]'}`}>
                    <span className="font-mono text-[#0052FF] font-black text-lg">[📖]</span>
                    <span className="text-xs font-bold">Logbook</span>
                  </button>
                  <button onClick={() => setActiveTool(activeTool === 'greeter' ? null : 'greeter')}
                    disabled={!TOOLS_DEPLOYED}
                    className={`flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl border transition-all disabled:opacity-40 ${activeTool === 'greeter' ? 'bg-[#E6EEFF] border-[#0052FF]' : 'bg-[#F8FAFF] border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF]'}`}>
                    <span className="font-mono text-[#0052FF] font-black text-lg">[👋]</span>
                    <span className="text-xs font-bold">Greeter</span>
                  </button>
                  <button onClick={() => setActiveTool(activeTool === 'token' ? null : 'token')}
                    disabled={!TOKEN_FACTORY_DEPLOYED}
                    className={`flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl border transition-all disabled:opacity-40 ${activeTool === 'token' ? 'bg-[#E6EEFF] border-[#0052FF]' : 'bg-[#F8FAFF] border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF]'}`}>
                    <span className="font-mono text-[#0052FF] font-black text-lg">[$]</span>
                    <span className="text-xs font-bold">Token</span>
                  </button>
                  <button onClick={() => setActiveTool(activeTool === 'nft' ? null : 'nft')}
                    disabled={!NFT_FACTORY_DEPLOYED}
                    className={`flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl border transition-all disabled:opacity-40 ${activeTool === 'nft' ? 'bg-[#E6EEFF] border-[#0052FF]' : 'bg-[#F8FAFF] border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF]'}`}>
                    <span className="font-mono text-[#0052FF] font-black text-lg">[*]</span>
                    <span className="text-xs font-bold">NFT</span>
                  </button>
                  <button onClick={() => setActiveTool(activeTool === 'dao' ? null : 'dao')}
                    disabled={!DAO_DEPLOYED}
                    className={`flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl border transition-all disabled:opacity-40 ${activeTool === 'dao' ? 'bg-[#E6EEFF] border-[#0052FF]' : 'bg-[#F8FAFF] border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF]'}`}>
                    <span className="font-mono text-[#0052FF] font-black text-lg">[△]</span>
                    <span className="text-xs font-bold">DAO</span>
                  </button>
                  <button onClick={() => setActiveTool(activeTool === 'b20' ? null : 'b20')}
                    disabled={!B20_FACTORY_DEPLOYED}
                    className={`flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl border transition-all disabled:opacity-40 ${activeTool === 'b20' ? 'bg-[#E6EEFF] border-[#0052FF]' : 'bg-[#F8FAFF] border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF]'}`}>
                    <span className="font-mono text-[#0052FF] font-black text-lg">[B20]</span>
                    <span className="text-xs font-bold">B20</span>
                  </button>
                </div>

                {activeTool === 'logbook' && (
                  <div className="space-y-1 pt-1">
                    <textarea value={logText} onChange={e => setLogText(e.target.value)} placeholder="Log text (or leave empty)" rows={2} maxLength={280}
                      className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:border-[#0052FF]" />
                    <button onClick={() => { if (!TOOLS_DEPLOYED) return; toolAction(async () => { const auto = `Log @ ${new Date().toISOString()} by ${address?.slice(0,8)}`; await writeContractAsync({ address: TOOLS_ADDRESS, abi: TOOLS_ABI, functionName: 'log', args: [logText || auto], value: fixedFee }, 'log'); setLogText('') }, setLogLoading) }}
                      disabled={logLoading} className="w-full bg-[#0052FF] text-white text-xs py-2 rounded-lg font-bold disabled:opacity-40">
                      {logLoading ? 'Writing…' : 'Log on-chain'}
                    </button>
                  </div>
                )}
                {activeTool === 'greeter' && (
                  <div className="space-y-1 pt-1">
                    <input value={greetText} onChange={e => setGreetText(e.target.value)} placeholder="Your on-chain greeting" maxLength={100}
                      className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                    <button onClick={() => { if (!TOOLS_DEPLOYED || !greetText) return; toolAction(async () => { await writeContractAsync({ address: TOOLS_ADDRESS, abi: TOOLS_ABI, functionName: 'greet', args: [greetText], value: fixedFee }); setGreetText('') }, setGreetLoading) }}
                      disabled={greetLoading || !greetText} className="w-full bg-[#0052FF] text-white text-xs py-2 rounded-lg font-bold disabled:opacity-40">
                      {greetLoading ? 'Setting…' : 'Set Greeting'}
                    </button>
                  </div>
                )}
                {activeTool === 'token' && (
                  <div className="space-y-1 pt-1">
                    <input value={tokenName} onChange={e => setTokenName(e.target.value)} placeholder="Token name" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                    <input value={tokenSymbol} onChange={e => setTokenSymbol(e.target.value)} placeholder="Symbol" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                    <input value={tokenSupply} onChange={e => setTokenSupply(e.target.value)} placeholder="Supply" type="number" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                    <button onClick={() => { if (!TOKEN_FACTORY_DEPLOYED || !tokenName || !tokenSymbol || !tokenSupply) return; toolAction(async () => { await writeContractAsync({ address: TOKEN_FACTORY_ADDRESS, abi: TOKEN_FACTORY_ABI, functionName: 'deployToken', args: [tokenName, tokenSymbol, BigInt(tokenSupply)], value: fixedFee }); setTokenName('FlameBase'); setTokenSymbol('FLAME'); setTokenSupply('1000000') }, setTokenLoading) }}
                      disabled={tokenLoading || !tokenName || !tokenSymbol || !tokenSupply} className="w-full bg-[#0052FF] text-white text-xs py-2 rounded-lg font-bold disabled:opacity-40">
                      {tokenLoading ? 'Deploying…' : 'Deploy Token'}
                    </button>
                  </div>
                )}
                {activeTool === 'nft' && (
                  <div className="space-y-1 pt-1">
                    <input value={nftName} onChange={e => setNftName(e.target.value)} placeholder="Collection name" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                    <input value={nftSymbol} onChange={e => setNftSymbol(e.target.value)} placeholder="Symbol" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                    <input value={nftMaxSupply} onChange={e => setNftMaxSupply(e.target.value)} placeholder="Max supply" type="number" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                    <p className="text-[10px] text-[#0052FF] font-bold">Mint price: $0.50 fixed</p>
                    <button onClick={() => { if (!NFT_FACTORY_DEPLOYED || !nftName || !nftSymbol || !nftMaxSupply) return; toolAction(async () => { await writeContractAsync({ address: NFT_FACTORY_ADDRESS, abi: NFT_FACTORY_ABI, functionName: 'deployNFT', args: [nftName, nftSymbol, BigInt(nftMaxSupply), nftMintPriceWei, ''], value: fixedFee }); setNftName('FlameBase NFT'); setNftSymbol('FNFT'); setNftMaxSupply('1000') }, setNftLoading) }}
                      disabled={nftLoading || !nftName || !nftSymbol || !nftMaxSupply} className="w-full bg-[#0052FF] text-white text-xs py-2 rounded-lg font-bold disabled:opacity-40">
                      {nftLoading ? 'Deploying…' : 'Deploy NFT'}
                    </button>
                  </div>
                )}
                {activeTool === 'dao' && (
                  <div className="space-y-1 pt-1">
                    <input value={daoTitle} onChange={e => setDaoTitle(e.target.value)} placeholder="Proposal title" maxLength={100} className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                    <textarea value={daoDesc} onChange={e => setDaoDesc(e.target.value)} placeholder="Description" rows={2} className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:border-[#0052FF]" />
                    <button onClick={() => { if (!DAO_DEPLOYED || !daoTitle) return; toolAction(async () => { await writeContractAsync({ address: DAO_ADDRESS, abi: DAO_ABI, functionName: 'propose', args: [daoTitle, daoDesc], value: fixedFee }); setDaoTitle(''); setDaoDesc('') }, setDaoLoading) }}
                      disabled={daoLoading || !daoTitle} className="w-full bg-[#0052FF] text-white text-xs py-2 rounded-lg font-bold disabled:opacity-40">
                      {daoLoading ? 'Creating…' : 'Create Proposal'}
                    </button>
                    {renderProposalsList()}
                  </div>
                )}
                {activeTool === 'b20' && (
                  <div className="space-y-1 pt-1">
                    <p className="text-[10px] text-[#0052FF] font-bold">Base native token — gas only, no FlameBase fee</p>
                    <input value={b20Name} onChange={e => setB20Name(e.target.value)} placeholder="Token name" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                    <input value={b20Symbol} onChange={e => setB20Symbol(e.target.value)} placeholder="Symbol" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                    <input value={b20Supply} onChange={e => setB20Supply(e.target.value)} placeholder="Supply" type="number" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                    <button onClick={() => { if (!B20_FACTORY_DEPLOYED || !b20Name || !b20Symbol || !b20Supply) return; toolAction(deployB20, setB20Loading) }}
                      disabled={b20Loading || !b20Name || !b20Symbol || !b20Supply} className="w-full bg-[#0052FF] text-white text-xs py-2 rounded-lg font-bold disabled:opacity-40">
                      {b20Loading ? 'Deploying…' : 'Deploy B20 Token'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
          </div>

          {/* Footer */}
          <footer className="border-t border-[#EEF1F5] px-6 py-6 max-w-2xl mx-auto">
            <div className="flex items-center justify-center gap-3 mb-4">
              <a href="https://farcaster.xyz/wichlene" target="_blank" rel="noopener noreferrer"
                aria-label="Farcaster" title="Farcaster"
                className="w-8 h-8 rounded-full bg-[#F0F2F5] hover:bg-[#855DCD]/10 flex items-center justify-center transition-colors group">
                <svg viewBox="0 0 1000 1000" className="w-4 h-4 text-[#5B6271] group-hover:text-[#855DCD] transition-colors" fill="currentColor">
                  <path d="M257.778 155.556h484.444v688.889h-71.111V528.889h-.697c-7.858-87.212-81.156-155.556-170.414-155.556s-162.556 68.344-170.414 155.556h-.697v315.556h-71.111V155.556Z"/>
                  <path d="m128.889 253.333 28.889 97.778h24.444v395.556c-12.273 0-22.222 9.949-22.222 22.222v26.667h-4.444c-12.273 0-22.222 9.949-22.222 22.222v26.667h248.889v-26.667c0-12.273-9.949-22.222-22.222-22.222h-4.444v-26.667c0-12.273-9.949-22.222-22.222-22.222h-26.667V253.333H128.889ZM675.556 746.667c-12.273 0-22.222 9.949-22.222 22.222v26.667h-4.445c-12.272 0-22.222 9.949-22.222 22.222v26.667h248.889v-26.667c0-12.273-9.949-22.222-22.222-22.222h-4.445v-26.667c0-12.273-9.949-22.222-22.222-22.222V351.111h24.445l28.888-97.778H702.222v493.334h-26.666Z"/>
                </svg>
              </a>
              <a href="https://base.app/invite/primeairdrop/6Q1618T2" target="_blank" rel="noopener noreferrer"
                aria-label="Base App" title="Base App"
                className="w-8 h-8 rounded-full bg-[#F0F2F5] hover:bg-[#0052FF]/10 flex items-center justify-center transition-colors group">
                <svg viewBox="0 0 111 111" className="w-4 h-4 text-[#5B6271] group-hover:text-[#0052FF] transition-colors" fill="currentColor">
                  <path d="M54.921 110.034C85.359 110.034 110.034 85.402 110.034 55.017C110.034 24.6319 85.359 0 54.921 0C26.0432 0 2.35281 22.1714 0 50.3923H72.8467V59.6416H3.9565e-07C2.35281 87.8625 26.0432 110.034 54.921 110.034Z"/>
                </svg>
              </a>
              <a href="https://x.com/PrimeAirdropTR" target="_blank" rel="noopener noreferrer"
                aria-label="X (Twitter)" title="X"
                className="w-8 h-8 rounded-full bg-[#F0F2F5] hover:bg-black/10 flex items-center justify-center transition-colors group">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#5B6271] group-hover:text-black transition-colors" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </a>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[#8A919E] mb-3">
              <a href={`https://basescan.org/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#0052FF] transition-colors">{t('footerContract')}</a>
              <span>·</span>
              <a href={`https://basescan.org/token/${FLM_TOKEN_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#FF6B00] transition-colors">{t('footerFLMToken')}</a>
              <span>·</span>
              <a href="/privacy" className="hover:text-[#0052FF] transition-colors">{t('footerPrivacy')}</a>
              <span>·</span>
              <a href="/terms" className="hover:text-[#0052FF] transition-colors">{t('footerTerms')}</a>
              <span>·</span>
              <a href="/cookies" className="hover:text-[#0052FF] transition-colors">{t('footerCookies')}</a>
            </div>
            <p className="text-center text-xs text-[#C5CBD3]">
              © {new Date().getFullYear()} FlameBase. {t('footerRights')} {t('footerSecured')}
            </p>
          </footer>
        </main>

        {/* ── Right Sidebar ── */}
        <aside className="hidden xl:flex flex-col fixed right-0 top-0 h-full w-96 bg-white border-l border-[#E4E7EB] z-40 overflow-y-auto">

          {/* Leaderboard — top creators by flames from loaded posts */}
          {leaderboard.length > 0 && (
            <div className="px-3 pt-4 pb-1">
              <p className="text-xs font-black text-[#8A919E] uppercase tracking-wider px-1 mb-2">🏆 Top Creators</p>
              <div className="bg-[#FAFBFD] border border-[#EEF1F5] rounded-2xl overflow-hidden">
                {leaderboard.map((u, i) => (
                  <button key={u.addr} onClick={() => setSelectedUser(u.addr)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[#F0F4FF] transition-colors border-b border-[#EEF1F5] last:border-b-0">
                    <span className={`text-sm font-black w-5 text-center flex-shrink-0 ${i === 0 ? 'text-[#F59E0B]' : i === 1 ? 'text-[#9CA3AF]' : i === 2 ? 'text-[#B45309]' : 'text-[#C5CBD3]'}`}>
                      {i + 1}
                    </span>
                    <Avatar addr={u.addr} profiles={profiles} size="sm" />
                    <span className="flex-1 text-left text-sm font-bold text-[#0A0B0D] truncate">{getUsername(u.addr)}</span>
                    <span className="text-xs font-bold text-[#FF6B35] flex-shrink-0">🔥 {u.likes}</span>
                    {u.tips > 0n && (
                      <span className="text-xs font-semibold text-[#0052FF] flex-shrink-0">💸 {parseFloat(formatEther(u.tips)).toFixed(3)}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tool Buttons — 3-column grid */}
          <div className="px-3 pt-4 pb-2">
            <div className="flex items-center justify-between px-1 mb-3">
              <p className="text-xs font-black text-[#8A919E] uppercase tracking-wider">🔧 Tools</p>
              {TOOLS_DEPLOYED && Number(userStreakDays || 0) > 0 && (
                <span className="text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
                  {streakBadge(Number(userStreakDays)).emoji} {Number(userStreakDays)}d
                </span>
              )}
            </div>

            {/* FlameBase Logo NFT mint card */}
            {logoNftDeployed && (
              <div className="mb-3 bg-gradient-to-br from-orange-500 via-red-500 to-pink-500 rounded-2xl p-3.5 text-white shadow-lg">
                <div className="flex items-center gap-3">
                  <img src="/logo.png" alt="FlameBase Logo" className="w-11 h-11 rounded-xl bg-white/10 p-1 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm leading-tight">🎨 FlameBase Logo NFT</p>
                    {logoNftTotalSupply !== undefined && logoNftMaxSupply !== undefined && (
                      <>
                        <div className="flex justify-between text-[10px] mt-1.5 mb-1">
                          <span className="text-white/80">Minted</span>
                          <span className="font-bold">{(logoNftTotalSupply as bigint).toString()} / {(logoNftMaxSupply as bigint).toString()}</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                          <div className="h-full bg-white" style={{ width: `${Math.min(100, Number((logoNftTotalSupply as bigint) * 100n / (logoNftMaxSupply as bigint)))}%` }} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={mintLogoNft}
                  disabled={!isConnected || mintingLogoNft || logoNftMintPrice === undefined || (logoNftTotalSupply !== undefined && logoNftMaxSupply !== undefined && (logoNftTotalSupply as bigint) >= (logoNftMaxSupply as bigint))}
                  className="mt-3 w-full bg-white hover:bg-white/90 text-orange-600 disabled:opacity-50 font-black text-sm px-4 py-2 rounded-xl transition-colors shadow-sm"
                >
                  {mintingLogoNft ? 'Minting…' : !isConnected ? 'Connect to mint' : logoNftMintPrice === undefined ? 'Loading…' : (logoNftTotalSupply !== undefined && logoNftMaxSupply !== undefined && (logoNftTotalSupply as bigint) >= (logoNftMaxSupply as bigint)) ? 'Sold out' : '🔥 Mint $0.50'}
                </button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">

              {/* Counter */}
              <button onClick={() => { if (!TOOLS_DEPLOYED) return; toolAction(async () => { await writeContractAsync({ address: TOOLS_ADDRESS, abi: TOOLS_ABI, functionName: 'count', value: fixedFee }) }, setCounterLoading) }}
                disabled={!TOOLS_DEPLOYED || counterLoading}
                className="flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl bg-white border border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF] disabled:opacity-40 transition-all">
                <span className="font-mono text-[#0052FF] font-black text-lg">[##]</span>
                <span className="text-xs font-bold text-[#0A0B0D]">{counterLoading ? '…' : 'Counter'}</span>
              </button>

              {/* Streak */}
              <button onClick={() => { if (!TOOLS_DEPLOYED || canCheckIn === false) return; toolAction(async () => { await writeContractAsync({ address: TOOLS_ADDRESS, abi: TOOLS_ABI, functionName: 'checkIn', value: fixedFee }) }, setStreakLoading) }}
                disabled={!TOOLS_DEPLOYED || streakLoading || canCheckIn === false}
                className="flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl bg-white border border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF] disabled:opacity-40 transition-all">
                <span className="font-mono text-[#0052FF] font-black text-lg">[~]</span>
                <span className="text-xs font-bold text-[#0A0B0D]">{streakLoading ? '…' : canCheckIn === false ? '✓ Done' : 'Streak'}</span>
              </button>

              {/* Logbook */}
              <button onClick={() => setActiveTool(activeTool === 'logbook' ? null : 'logbook')}
                disabled={!TOOLS_DEPLOYED}
                className={`flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl border transition-all disabled:opacity-40 ${activeTool === 'logbook' ? 'bg-[#E6EEFF] border-[#0052FF]' : 'bg-white border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF]'}`}>
                <span className="font-mono text-[#0052FF] font-black text-lg">[📖]</span>
                <span className="text-xs font-bold text-[#0A0B0D]">Logbook</span>
              </button>

              {/* Greeter */}
              <button onClick={() => setActiveTool(activeTool === 'greeter' ? null : 'greeter')}
                disabled={!TOOLS_DEPLOYED}
                className={`flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl border transition-all disabled:opacity-40 ${activeTool === 'greeter' ? 'bg-[#E6EEFF] border-[#0052FF]' : 'bg-white border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF]'}`}>
                <span className="font-mono text-[#0052FF] font-black text-lg">[👋]</span>
                <span className="text-xs font-bold text-[#0A0B0D]">Greeter</span>
              </button>

              {/* Token */}
              <button onClick={() => setActiveTool(activeTool === 'token' ? null : 'token')}
                disabled={!TOKEN_FACTORY_DEPLOYED}
                className={`flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl border transition-all disabled:opacity-40 ${activeTool === 'token' ? 'bg-[#E6EEFF] border-[#0052FF]' : 'bg-white border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF]'}`}>
                <span className="font-mono text-[#0052FF] font-black text-lg">[$]</span>
                <span className="text-xs font-bold text-[#0A0B0D]">Token</span>
              </button>

              {/* NFT */}
              <button onClick={() => setActiveTool(activeTool === 'nft' ? null : 'nft')}
                disabled={!NFT_FACTORY_DEPLOYED}
                className={`flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl border transition-all disabled:opacity-40 ${activeTool === 'nft' ? 'bg-[#E6EEFF] border-[#0052FF]' : 'bg-white border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF]'}`}>
                <span className="font-mono text-[#0052FF] font-black text-lg">[*]</span>
                <span className="text-xs font-bold text-[#0A0B0D]">NFT</span>
              </button>

              {/* DAO */}
              <button onClick={() => setActiveTool(activeTool === 'dao' ? null : 'dao')}
                disabled={!DAO_DEPLOYED}
                className={`flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl border transition-all disabled:opacity-40 ${activeTool === 'dao' ? 'bg-[#E6EEFF] border-[#0052FF]' : 'bg-white border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF]'}`}>
                <span className="font-mono text-[#0052FF] font-black text-lg">[△]</span>
                <span className="text-xs font-bold text-[#0A0B0D]">DAO</span>
              </button>

              {/* B20 */}
              <button onClick={() => setActiveTool(activeTool === 'b20' ? null : 'b20')}
                disabled={!B20_FACTORY_DEPLOYED}
                className={`flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl border transition-all disabled:opacity-40 ${activeTool === 'b20' ? 'bg-[#E6EEFF] border-[#0052FF]' : 'bg-white border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF]'}`}>
                <span className="font-mono text-[#0052FF] font-black text-lg">[B20]</span>
                <span className="text-xs font-bold text-[#0A0B0D]">B20</span>
              </button>

              {/* Wallet Check */}
              <button onClick={() => setActiveTool(activeTool === 'wallet' ? null : 'wallet')}
                className={`flex flex-col items-center gap-1.5 py-4 px-1 rounded-xl border transition-all ${activeTool === 'wallet' ? 'bg-[#E6EEFF] border-[#0052FF]' : 'bg-white border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF]'}`}>
                <span className="font-mono text-[#0052FF] font-black text-lg">[🏦]</span>
                <span className="text-xs font-bold text-[#0A0B0D]">Wallet</span>
              </button>


            </div>

            {/* Expanded forms */}
            {activeTool === 'logbook' && (
              <div className="mt-2 space-y-1">
                <textarea value={logText} onChange={e => setLogText(e.target.value)} placeholder="Log text (or leave empty)" rows={2} maxLength={280}
                  className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:border-[#0052FF]" />
                <button onClick={() => { if (!TOOLS_DEPLOYED) return; toolAction(async () => { const auto = `Log @ ${new Date().toISOString()} by ${address?.slice(0,8)}`; await writeContractAsync({ address: TOOLS_ADDRESS, abi: TOOLS_ABI, functionName: 'log', args: [logText || auto], value: fixedFee }, 'log'); setLogText('') }, setLogLoading) }}
                  disabled={logLoading} className="w-full bg-[#0052FF] text-white text-xs py-2 rounded-lg font-bold disabled:opacity-40">
                  {logLoading ? 'Writing…' : 'Log on-chain'}
                </button>
              </div>
            )}
            {activeTool === 'greeter' && (
              <div className="mt-2 space-y-1">
                <input value={greetText} onChange={e => setGreetText(e.target.value)} placeholder="Your on-chain greeting" maxLength={100}
                  className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                <button onClick={() => { if (!TOOLS_DEPLOYED || !greetText) return; toolAction(async () => { await writeContractAsync({ address: TOOLS_ADDRESS, abi: TOOLS_ABI, functionName: 'greet', args: [greetText], value: fixedFee }); setGreetText('') }, setGreetLoading) }}
                  disabled={greetLoading || !greetText} className="w-full bg-[#0052FF] text-white text-xs py-2 rounded-lg font-bold disabled:opacity-40">
                  {greetLoading ? 'Setting…' : 'Set Greeting'}
                </button>
              </div>
            )}
            {activeTool === 'token' && (
              <div className="mt-2 space-y-1">
                <input value={tokenName} onChange={e => setTokenName(e.target.value)} placeholder="Token name" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                <input value={tokenSymbol} onChange={e => setTokenSymbol(e.target.value)} placeholder="Symbol" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                <input value={tokenSupply} onChange={e => setTokenSupply(e.target.value)} placeholder="Supply" type="number" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                <button onClick={() => { if (!TOKEN_FACTORY_DEPLOYED || !tokenName || !tokenSymbol || !tokenSupply) return; toolAction(async () => { await writeContractAsync({ address: TOKEN_FACTORY_ADDRESS, abi: TOKEN_FACTORY_ABI, functionName: 'deployToken', args: [tokenName, tokenSymbol, BigInt(tokenSupply)], value: fixedFee }); setTokenName('FlameBase'); setTokenSymbol('FLAME'); setTokenSupply('1000000') }, setTokenLoading) }}
                  disabled={tokenLoading || !tokenName || !tokenSymbol || !tokenSupply} className="w-full bg-[#0052FF] text-white text-xs py-2 rounded-lg font-bold disabled:opacity-40">
                  {tokenLoading ? 'Deploying…' : 'Deploy Token'}
                </button>
              </div>
            )}
            {activeTool === 'nft' && (
              <div className="mt-2 space-y-1">
                <input value={nftName} onChange={e => setNftName(e.target.value)} placeholder="Collection name" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                <input value={nftSymbol} onChange={e => setNftSymbol(e.target.value)} placeholder="Symbol" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                <input value={nftMaxSupply} onChange={e => setNftMaxSupply(e.target.value)} placeholder="Max supply" type="number" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                <p className="text-[10px] text-[#0052FF] font-bold">Mint price: $0.50 fixed</p>
                <button onClick={() => { if (!NFT_FACTORY_DEPLOYED || !nftName || !nftSymbol || !nftMaxSupply) return; toolAction(async () => { await writeContractAsync({ address: NFT_FACTORY_ADDRESS, abi: NFT_FACTORY_ABI, functionName: 'deployNFT', args: [nftName, nftSymbol, BigInt(nftMaxSupply), nftMintPriceWei, ''], value: fixedFee }); setNftName('FlameBase NFT'); setNftSymbol('FNFT'); setNftMaxSupply('1000') }, setNftLoading) }}
                  disabled={nftLoading || !nftName || !nftSymbol || !nftMaxSupply} className="w-full bg-[#0052FF] text-white text-xs py-2 rounded-lg font-bold disabled:opacity-40">
                  {nftLoading ? 'Deploying…' : 'Deploy NFT'}
                </button>
              </div>
            )}
            {activeTool === 'dao' && (
              <div className="mt-2 space-y-1">
                <input value={daoTitle} onChange={e => setDaoTitle(e.target.value)} placeholder="Proposal title" maxLength={100} className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                <textarea value={daoDesc} onChange={e => setDaoDesc(e.target.value)} placeholder="Description" rows={2} className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs resize-none focus:outline-none focus:border-[#0052FF]" />
                <button onClick={() => { if (!DAO_DEPLOYED || !daoTitle) return; toolAction(async () => { await writeContractAsync({ address: DAO_ADDRESS, abi: DAO_ABI, functionName: 'propose', args: [daoTitle, daoDesc], value: fixedFee }); setDaoTitle(''); setDaoDesc('') }, setDaoLoading) }}
                  disabled={daoLoading || !daoTitle} className="w-full bg-[#0052FF] text-white text-xs py-2 rounded-lg font-bold disabled:opacity-40">
                  {daoLoading ? 'Creating…' : 'Create Proposal'}
                </button>
                {renderProposalsList()}
              </div>
            )}
            {activeTool === 'b20' && (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] text-[#0052FF] font-bold">Base native token — gas only, no FlameBase fee</p>
                <input value={b20Name} onChange={e => setB20Name(e.target.value)} placeholder="Token name" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                <input value={b20Symbol} onChange={e => setB20Symbol(e.target.value)} placeholder="Symbol" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                <input value={b20Supply} onChange={e => setB20Supply(e.target.value)} placeholder="Supply" type="number" className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#0052FF]" />
                <button onClick={() => { if (!B20_FACTORY_DEPLOYED || !b20Name || !b20Symbol || !b20Supply) return; toolAction(deployB20, setB20Loading) }}
                  disabled={b20Loading || !b20Name || !b20Symbol || !b20Supply} className="w-full bg-[#0052FF] text-white text-xs py-2 rounded-lg font-bold disabled:opacity-40">
                  {b20Loading ? 'Deploying…' : 'Deploy B20 Token'}
                </button>
              </div>
            )}
            {activeTool === 'wallet' && (
              <div className="mt-2 border border-[#E4E7EB] rounded-xl overflow-hidden bg-white">
                <WalletChecker compact />
              </div>
            )}


          </div>


          {/* Terminal */}
          <div className="mx-3 mb-3 mt-2 bg-[#0A0B0D] rounded-xl overflow-hidden flex-1 flex flex-col min-h-[140px]">
            <div className="flex items-center justify-between px-3 py-2 border-b border-green-400/10">
              <span className="font-mono text-green-400 text-xs">$ tx log</span>
              <button onClick={() => { setTxLog([]); localStorage.removeItem('flamebase_tx_log') }}
                className="text-green-400/40 hover:text-green-400 text-[10px] font-mono">clear</button>
            </div>
            <div className="overflow-y-auto font-mono text-[10px] p-2 text-green-400 space-y-0.5 flex-1">
              {txLog.length === 0 ? (
                <p className="text-green-400/30 pt-3 text-center">No transactions yet</p>
              ) : txLog.map((tx, i) => {
                const time = new Date(tx.time)
                const hh = time.getHours().toString().padStart(2, '0')
                const mm = time.getMinutes().toString().padStart(2, '0')
                return (
                  <div key={i} className="flex gap-1 items-start leading-relaxed">
                    <span className="text-green-400/40 flex-shrink-0">{hh}:{mm}</span>
                    <span className="text-green-300 flex-shrink-0 max-w-[50px] truncate">{tx.type}</span>
                    {tx.pending ? (
                      <span className="text-green-400/40 truncate">{tx.hash.slice(0,12)}… (confirming)</span>
                    ) : (
                      <a href={`https://basescan.org/tx/${tx.hash}`} target="_blank" rel="noreferrer"
                        className="text-green-400 hover:text-white underline truncate">{tx.hash.slice(0,12)}…</a>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

        </aside>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav ref={bottomNavRef} className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-[#E4E7EB] z-50 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.05)] pb-safe">
        <div className="flex">
          {navItems.map(({ tab, icon, labelKey }) => (
            <button key={tab} onClick={() => {
              setActiveTab(tab)
              if (tab === 'reels') setReelsEverOpened(true)
              if (tab === 'ai') setAiEverOpened(true)
              if (tab === 'activity') {
                const snapshot: Record<string, number> = {}
                myPosts.forEach(p => { snapshot[p.id.toString()] = Number(p.likes) + Number(p.tips) })
                setSeenActivity(snapshot)
                localStorage.setItem('flamebase_seen_activity', JSON.stringify(snapshot))
                myPosts.forEach(p => { if (!postComments[p.id.toString()]) loadComments(p.id.toString()) })
              }
            }}
              className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition-colors relative ${activeTab === tab ? 'text-[#0052FF]' : 'text-[#8A919E]'}`}>
              <span className="text-xl relative">
                {icon}
                {tab === 'activity' && activityCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black px-1 py-0.5 rounded-full min-w-[14px] text-center leading-none">{activityCount > 9 ? '9+' : activityCount}</span>
                )}
                {tab === 'messages' && unreadMessages > 0 && activeTab !== 'messages' && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black px-1 py-0.5 rounded-full min-w-[14px] text-center leading-none">{unreadMessages > 9 ? '9+' : unreadMessages}</span>
                )}
              </span>
              <span className="text-[10px] font-bold flex items-center gap-1">
                {t(labelKey)}
                {tab === 'ai' && (
                  <span className="text-[7px] leading-none bg-gradient-to-r from-[#7B3FE4] to-[#0052FF] text-white px-1 py-0.5 rounded-full font-black">402</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </nav>

      {/* Floating toast notifications */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* ── User Profile Modal ── */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setSelectedUser(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto overflow-x-hidden" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-[#EEF1F5] px-5 py-4 flex items-center justify-between">
              <h2 className="font-black text-lg">Profile</h2>
              <button onClick={() => setSelectedUser(null)} className="w-8 h-8 rounded-full hover:bg-[#F7F9FC] flex items-center justify-center text-[#5B6271] transition-colors">✕</button>
            </div>
            {/* Profile header */}
            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <Avatar addr={selectedUser} profiles={profiles} size="lg" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <h3 className="text-xl font-black truncate">{getUsername(selectedUser)}</h3>
                    {verifiedAddresses[selectedUser.toLowerCase()] && <VerifiedBadge />}
                  </div>
                  <p className="text-[#8A919E] text-sm truncate">{selectedUser.slice(0,8)}...{selectedUser.slice(-6)}</p>
                  <a href={`https://basescan.org/address/${selectedUser}`} target="_blank" className="text-[#0052FF] text-xs hover:underline">View on Basescan ↗</a>
                </div>
              </div>
              {isConnected && address && selectedUser.toLowerCase() !== address.toLowerCase() && (
                <div className="flex gap-2 mb-4">
                  {following.has(selectedUser.toLowerCase()) ? (
                    <button onClick={() => unfollowUser(selectedUser)} disabled={loadingAction === `follow-${selectedUser.toLowerCase()}`}
                      className="flex-1 px-3 py-2 rounded-xl border-2 border-[#0052FF] text-[#0052FF] text-xs font-black hover:bg-red-50 hover:border-red-500 hover:text-red-500 transition-colors disabled:opacity-50">
                      {loadingAction === `follow-${selectedUser.toLowerCase()}` ? '…' : 'Friends ✓'}
                    </button>
                  ) : (
                    <button onClick={() => followUser(selectedUser)} disabled={loadingAction === `follow-${selectedUser.toLowerCase()}`}
                      className="flex-1 px-3 py-2 rounded-xl bg-[#0052FF] text-white text-xs font-black hover:bg-[#1652F0] transition-colors disabled:opacity-50">
                      {loadingAction === `follow-${selectedUser.toLowerCase()}` ? '…' : '+ Add Friend'}
                    </button>
                  )}
                  <button onClick={() => { setPendingDmTarget(selectedUser); setActiveTab('messages'); setSelectedUser(null) }}
                    className="flex-1 px-3 py-2 rounded-xl bg-[#F0F4FF] text-[#0052FF] text-xs font-black hover:bg-[#E6EEFF] transition-colors">
                    💬 Message
                  </button>
                </div>
              )}

              {/* Stats row */}
              <div className="flex items-center gap-6 mb-4 pb-4 border-b border-[#EEF1F5]">
                <div>
                  <p className="text-base font-extrabold text-[#0A0B0D] leading-tight">{posts.filter(p => p.author.toLowerCase() === selectedUser.toLowerCase()).length}</p>
                  <p className="text-[#8A919E] text-xs">Posts</p>
                </div>
                <div>
                  <p className="text-base font-extrabold text-[#0A0B0D] leading-tight">{FOLLOW_DEPLOYED ? (selectedUserFollowerCount?.toString() ?? '0') : '0'}</p>
                  <p className="text-[#8A919E] text-xs">Followers</p>
                </div>
                <div>
                  <p className="text-base font-extrabold text-[#0A0B0D] leading-tight">{FOLLOW_DEPLOYED ? (selectedUserFollowingCount?.toString() ?? '0') : '0'}</p>
                  <p className="text-[#8A919E] text-xs">Following</p>
                </div>
              </div>
              {/* User's posts */}
              <div className="space-y-3">
                {posts.filter(p => p.author.toLowerCase() === selectedUser.toLowerCase()).map(post => (
                  <div key={post.id.toString()} className="bg-[#F7F9FC] rounded-2xl p-4 border border-[#EEF1F5]">
                    {post.content && <p className="text-sm text-[#0A0B0D] mb-2">{post.content}</p>}
                    {post.ipfsHash && (post.ipfsHash.startsWith('vid_')
                      ? <IpfsVideo hash={post.ipfsHash.slice(4)} className="w-full max-h-40 bg-black rounded-xl mb-2" />
                      : <IpfsImage hash={post.ipfsHash} className="w-full max-h-40 object-cover rounded-xl mb-2" alt="" />)}
                    <div className="flex items-center gap-3 text-xs text-[#8A919E]">
                      <span>🔥 {post.likes.toString()}</span>
                      <span>💸 {parseFloat(formatEther(post.tips)).toFixed(4)} ETH</span>
                      <span className="ml-auto">{timeAgo(post.timestamp)}</span>
                    </div>
                  </div>
                ))}
                {posts.filter(p => p.author.toLowerCase() === selectedUser.toLowerCase()).length === 0 && (
                  <p className="text-[#8A919E] text-sm text-center py-4">No posts yet</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
