'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWriteContract, useReadContract, usePublicClient, useBalance, useSwitchChain, useChainId } from 'wagmi'
import { useState, useEffect, useCallback } from 'react'
import { parseEther, formatEther } from 'viem'
import { base } from 'wagmi/chains'
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/contract'
import { T, LANG_LABELS, type Lang } from '../lib/i18n'
import { TOOLS_ADDRESS, TOKEN_FACTORY_ADDRESS, NFT_FACTORY_ADDRESS, DAO_ADDRESS, TOOLS_ABI, TOKEN_FACTORY_ABI, NFT_FACTORY_ABI, DAO_ABI } from '../lib/toolsContracts'

const TOOLS_DEPLOYED = TOOLS_ADDRESS.length > 0
const TOKEN_FACTORY_DEPLOYED = TOKEN_FACTORY_ADDRESS.length > 0
const NFT_FACTORY_DEPLOYED = NFT_FACTORY_ADDRESS.length > 0
const DAO_DEPLOYED = DAO_ADDRESS.length > 0

const ADMIN_ADDRESS = '0xa77A5D4D37d6F39C20C2441295da9fA60Ab9fD69'

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

interface ProfileData {
  username: string
  avatarHash: string
  exists: boolean
  flames: bigint
  tips: bigint
}

type Tab = 'feed' | 'post' | 'leaderboard' | 'profile' | 'tools'

const FAKE_LEADERBOARD = [
  { address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045', username: 'vitalik.eth', flames: 2847 },
  { address: '0x220866b1a2219f40e72f5c628b65d54268ca3a9d', username: 'basegod', flames: 1203 },
  { address: '0x71660c4005ba85c37ccec55d0c4493e66fe775d3', username: 'cryptoflame', flames: 887 },
  { address: '0xab5801a7d398351b8be11c439e05c5b3259aec9b', username: 'onchainvibes', flames: 654 },
  { address: '0x1db3439a222c519ab44bb1144fc28167b4fa6ee6', username: 'basebuilder', flames: 521 },
  { address: '0x6b175474e89094c44da98b954eedeac495271d0f', username: 'flamecatcher', flames: 398 },
  { address: '0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9', username: 'web3native', flames: 312 },
  { address: '0xc00e94cb662c3520282e6f5717214004a7f26888', username: 'degenflame', flames: 187 },
]

function Avatar({ addr, profiles, size = 'md' }: { addr: string; profiles: Record<string, ProfileData>; size?: 'sm' | 'md' | 'lg' }) {
  const p = profiles[addr.toLowerCase()]
  const avatarUrl = p?.avatarHash ? `https://gateway.pinata.cloud/ipfs/${p.avatarHash}` : null
  const dims = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-20 h-20 text-2xl' : 'w-10 h-10 text-sm'
  if (avatarUrl) return <img src={avatarUrl} className={`${dims} rounded-full object-cover flex-shrink-0`} alt="avatar" />
  return (
    <div className={`${dims} rounded-full bg-gradient-to-br from-[#0052FF] to-[#1652F0] flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {addr.slice(2, 4).toUpperCase()}
    </div>
  )
}

function FlameLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="flex-shrink-0">
      <rect width="32" height="32" rx="8" fill="#0052FF" />
      <path d="M16 6.5c1.8 3.5-2 5.4-2 9.5a4 4 0 0 0 8 0c0-1.8-1-2.7-2-3.7 1 3.7-2.7 3.7-2.7 1.7 0-2.7 1.7-4.7-1.3-7.5z" fill="#fff" />
      <path d="M14.5 19c-1 1.5.5 4 1.5 4s2.5-2.5 1.5-4c-.5 1.2-2 1.2-3 0z" fill="#fff" opacity="0.85" />
    </svg>
  )
}

function ConnectPrompt({ message, label = 'Connect Wallet' }: { message: string; label?: string }) {
  return (
    <div className="bg-white border border-[#E4E7EB] rounded-2xl p-8 text-center shadow-sm">
      <div className="w-14 h-14 mx-auto rounded-2xl bg-[#E6EEFF] flex items-center justify-center mb-4">
        <span className="text-2xl">🔐</span>
      </div>
      <p className="text-[#0A0B0D] font-bold mb-1 text-lg">{label}</p>
      <p className="text-[#5B6271] text-sm mb-6">{message}</p>
      <div className="flex justify-center"><ConnectButton /></div>
    </div>
  )
}

export default function Home() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const [activeTab, setActiveTab] = useState<Tab>('feed')
  const [posts, setPosts] = useState<Post[]>([])
  const [profiles, setProfiles] = useState<Record<string, ProfileData>>({})
  const [newPost, setNewPost] = useState('')
  const [newUsername, setNewUsername] = useState('')
  const [tipAmounts, setTipAmounts] = useState<Record<string, string>>({})
  const [commentTexts, setCommentTexts] = useState<Record<string, string>>({})
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({})
  const [postComments, setPostComments] = useState<Record<string, Comment[]>>({})
  const [replyingTo, setReplyingTo] = useState<Record<string, string>>({})
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
  const [leaderboard, setLeaderboard] = useState<Array<{ address: string; profile: ProfileData }>>([])
  const [ethPrice, setEthPrice] = useState(2500)
  const [txLog, setTxLog] = useState<Array<{ hash: string; type: string; time: number }>>([])
  const [showTerminal, setShowTerminal] = useState(false)
  const publicClient = usePublicClient()
  const { writeContractAsync: rawWriteContract } = useWriteContract()

  // Wrap writeContractAsync to log transactions to terminal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writeContractAsync = async (config: any, type?: string) => {
    const hash = await rawWriteContract(config)
    if (hash) {
      const entry = { hash, type: type || config?.functionName || 'tx', time: Date.now() }
      setTxLog(prev => {
        const next = [entry, ...prev].slice(0, 50)
        localStorage.setItem('flamebase_tx_log', JSON.stringify(next))
        return next
      })
    }
    return hash
  }

  // $0.07 fixed fee in ETH — recalculated when ETH price updates
  const fixedFeeETH = (0.07 / ethPrice).toFixed(10)
  const fixedFee = parseEther(fixedFeeETH)
  // Use the higher of contract price or fixedFee so transactions always pass
  const effectiveFee = (contractFee?: bigint) => {
    if (!contractFee || contractFee === 0n) return fixedFee
    return contractFee > fixedFee ? contractFee : fixedFee
  }
  // Show real USD price based on what's actually sent
  const usdLabel = (ethAmount: bigint) => {
    const eth = Number(formatEther(ethAmount))
    const usd = eth * ethPrice
    return `$${usd.toFixed(2)}`
  }
  const toolFeeLabel = usdLabel(effectiveFee(parseEther('0.0001')))
  // NFT mint price fixed at $0.50 in ETH
  const nftMintPriceETH = (0.50 / ethPrice).toFixed(10)
  const nftMintPriceWei = parseEther(nftMintPriceETH)

  // New state variables
  const [hiddenPosts, setHiddenPosts] = useState<Set<string>>(new Set())
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [notifications, setNotifications] = useState<Array<{type: string; postId: string; from: string; timestamp: number}>>([])
  const [showNotifications, setShowNotifications] = useState(false)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  // Tool form states
  const [counterLoading, setCounterLoading] = useState(false)
  const [streakLoading, setStreakLoading] = useState(false)
  const [logText, setLogText] = useState('')
  const [logLoading, setLogLoading] = useState(false)
  const [greetText, setGreetText] = useState('')
  const [greetLoading, setGreetLoading] = useState(false)
  const [tokenName, setTokenName] = useState('')
  const [tokenSymbol, setTokenSymbol] = useState('')
  const [tokenSupply, setTokenSupply] = useState('1000000')
  const [tokenLoading, setTokenLoading] = useState(false)
  const [nftName, setNftName] = useState('')
  const [nftSymbol, setNftSymbol] = useState('')
  const [nftMaxSupply, setNftMaxSupply] = useState('1000')
  const [nftLoading, setNftLoading] = useState(false)
  const [daoTitle, setDaoTitle] = useState('')
  const [daoDesc, setDaoDesc] = useState('')
  const [daoLoading, setDaoLoading] = useState(false)
  const [proposalLoading, setProposalLoading] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  const { data: myProfile, refetch: refetchProfile } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'profiles',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { data: postCount, refetch: refetchCount } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'postCount',
  })

  const { data: likePrice } = useReadContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'likePrice' })
  const { data: commentPrice } = useReadContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'commentPrice' })
  const { data: postPrice } = useReadContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'postPrice' })

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

  const hasProfile = myProfile && myProfile[2]
  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase()
  const isWrongNetwork = isConnected && chainId !== base.id

  // Fetch ETH price for $0.07 calculation
  useEffect(() => {
    fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
      .then(r => r.json())
      .then(d => { if (d?.ethereum?.usd) setEthPrice(d.ethereum.usd) })
      .catch(() => {})
  }, [])

  // Auto-switch to Base
  useEffect(() => {
    if (isConnected && chainId !== base.id) {
      switchChain({ chainId: base.id })
    }
  }, [isConnected, chainId, switchChain])

  // Load hidden posts from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('flamebase_hidden_posts')
    if (stored) setHiddenPosts(new Set(JSON.parse(stored)))
    const txStored = localStorage.getItem('flamebase_tx_log')
    if (txStored) {
      try { setTxLog(JSON.parse(txStored)) } catch {}
    }
  }, [])

  // Notifications: detect new likes on user posts
  useEffect(() => {
    if (!address || posts.length === 0) return
    const myPosts = posts.filter(p => p.author.toLowerCase() === address.toLowerCase())
    if (myPosts.length === 0) return
    const stored = localStorage.getItem('flamebase_last_likes')
    const lastLikes: Record<string, string> = stored ? JSON.parse(stored) : {}
    const newNotifs: Array<{type: string; postId: string; from: string; timestamp: number}> = []
    for (const post of myPosts) {
      const key = post.id.toString()
      const prev = BigInt(lastLikes[key] || '0')
      if (post.likes > prev) {
        newNotifs.push({ type: 'like', postId: key, from: '', timestamp: Date.now() })
      }
    }
    if (newNotifs.length > 0) {
      setNotifications(newNotifs)
    }
    // Update stored likes
    const updated: Record<string, string> = {}
    for (const post of myPosts) {
      updated[post.id.toString()] = post.likes.toString()
    }
    localStorage.setItem('flamebase_last_likes', JSON.stringify(updated))
  }, [posts, address])

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

  useEffect(() => {
    if (!postCount || !publicClient) return
    const run = async () => {
      const count = Number(postCount)
      const fetched: Post[] = []
      const authors = new Set<string>()
      for (let i = count - 1; i >= Math.max(0, count - 30); i--) {
        try {
          const post = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'getPost',
            args: [BigInt(i)],
          }) as Post
          fetched.push(post)
          authors.add(post.author.toLowerCase())
        } catch {}
      }
      setPosts(fetched)
      const map: Record<string, ProfileData> = {}
      for (const a of authors) {
        const p = await fetchProfileData(a)
        if (p) map[a] = p
      }
      setProfiles(map)
      const lb = Object.entries(map)
        .filter(([, p]) => p.exists)
        .sort(([, a], [, b]) => Number(b.flames) - Number(a.flames))
        .map(([addr, profile]) => ({ address: addr, profile }))
      setLeaderboard(lb)
    }
    run()
  }, [postCount, publicClient, fetchProfileData])

  const getUsername = (addr: string) => {
    const p = profiles[addr.toLowerCase()]
    return p?.exists ? p.username : `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setSelectedFile(file)
    setPreviewUrl(file ? URL.createObjectURL(file) : null)
  }

  const createProfile = async () => {
    if (!newUsername) return
    setLoading(true)
    try {
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'createProfile', args: [newUsername, ''] })
      setTimeout(() => refetchProfile(), 3000)
    } catch (e) { console.error(e) }
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
        ipfsHash = data.ipfsHash || ''
      }
      await writeContractAsync({
        address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'createPost',
        args: [newPost, ipfsHash], value: effectiveFee(postPrice as bigint | undefined),
      })
      setNewPost(''); setSelectedFile(null); setPreviewUrl(null)
      setTimeout(() => refetchCount(), 3000)
      setActiveTab('feed')
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const handleLike = async (postId: bigint) => {
    if (!isConnected) return
    setLoadingAction(`like-${postId}`)
    try {
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'like', args: [postId], value: effectiveFee(likePrice as bigint | undefined) })
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: p.likes + 1n } : p))
    } catch (e) { console.error(e) }
    setLoadingAction(null)
  }

  const handleComment = async (postId: bigint) => {
    const key = postId.toString()
    const text = commentTexts[key]
    if (!text) return
    setLoadingAction(`comment-${postId}`)
    try {
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'comment', args: [postId, text], value: effectiveFee(commentPrice as bigint | undefined) })
      setCommentTexts(prev => ({ ...prev, [key]: '' }))
      setReplyingTo(prev => ({ ...prev, [key]: '' }))
      await loadComments(key)
    } catch (e) { console.error(e) }
    setLoadingAction(null)
  }

  const handleTip = async (postId: bigint) => {
    const key = postId.toString()
    const amount = tipAmounts[key]
    if (!amount || parseFloat(amount) <= 0) return
    setLoadingAction(`tip-${postId}`)
    try {
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'tip', args: [postId], value: parseEther(amount) })
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, tips: p.tips + parseEther(amount) } : p))
      setTipAmounts(prev => ({ ...prev, [key]: '' }))
    } catch (e) { console.error(e) }
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
      if (data.ipfsHash) {
        await writeContractAsync({
          address: CONTRACT_ADDRESS,
          abi: CONTRACT_ABI,
          functionName: 'uploadAvatar',
          args: [data.ipfsHash],
          value: effectiveFee(undefined),
        })
        setTimeout(() => refetchProfile(), 3000)
      }
    } catch (e) { console.error(e) }
    setUploadingAvatar(false)
  }

  // Tool action helper
  const toolAction = async (action: () => Promise<void>, setLoad: (b: boolean) => void) => {
    setLoad(true)
    try { await action() } catch (e) { console.error(e) }
    setLoad(false)
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
    { tab: 'post' as Tab, icon: '✏️', labelKey: 'navNewPost' },
    { tab: 'leaderboard' as Tab, icon: '🏆', labelKey: 'navLeaderboard' },
    { tab: 'profile' as Tab, icon: '👤', labelKey: 'navProfile' },
    ...(TOOLS_DEPLOYED || isAdmin ? [{ tab: 'tools' as Tab, icon: '🔧', labelKey: 'navTools' }] : []),
  ]

  return (
    <div className="min-h-screen bg-white text-[#0A0B0D] flex flex-col">

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
                        <a href={`https://basescan.org/tx/${tx.hash}`} target="_blank"
                          className="text-cyan-400 hover:text-cyan-300 underline truncate">
                          {tx.hash.slice(0,10)}...{tx.hash.slice(-8)}
                        </a>
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
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold transition-all text-left text-sm ${
                  activeTab === tab ? 'bg-[#E6EEFF] text-[#0052FF]' : 'text-[#5B6271] hover:bg-[#F7F9FC] hover:text-[#0A0B0D]'
                }`}>
                <span className="text-lg">{icon}</span>{t(labelKey)}
              </button>
            ))}
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
            <ConnectButton />
            {/* Terminal button */}
            <button onClick={() => setShowTerminal(true)}
              className="w-full bg-[#0A0B0D] hover:bg-[#1f2125] text-green-400 font-mono text-xs px-3 py-2 rounded-xl transition-colors flex items-center justify-between gap-2">
              <span>$ tx log</span>
              <span className="bg-green-400 text-black px-1.5 py-0.5 rounded text-[10px] font-bold">{txLog.length}</span>
            </button>
            {/* Language selector */}
            <div className="mt-2">
              <select value={lang} onChange={e => setLang(e.target.value as Lang)}
                className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-3 py-2 text-xs text-[#5B6271] focus:outline-none focus:border-[#0052FF] cursor-pointer">
                {(Object.entries(LANG_LABELS) as [Lang, string][]).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 md:ml-60 xl:mr-72 min-h-screen border-x border-[#EEF1F5]">

          {/* Mobile header */}
          <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-b border-[#E4E7EB] px-4 py-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FlameLogo size={32} />
              <span className="font-black text-base text-[#0A0B0D]">FlameBase</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <button onClick={() => setShowTerminal(true)}
                className="bg-[#0A0B0D] text-green-400 font-mono text-[11px] px-2 py-1 rounded-lg hover:bg-[#1f2125]">
                $ tx{txLog.length > 0 ? ` (${txLog.length})` : ''}
              </button>
              {/* Notification bell */}
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F7F9FC] transition-colors"
              >
                <span className="text-lg">🔔</span>
                {notifications.length > 0 && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                )}
              </button>
              <select value={lang} onChange={e => setLang(e.target.value as Lang)}
                className="bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1 text-xs text-[#5B6271] focus:outline-none focus:border-[#0052FF] cursor-pointer">
                {(Object.entries(LANG_LABELS) as [Lang, string][]).map(([code, label]) => (
                  <option key={code} value={code}>{label.split(' ')[0]}</option>
                ))}
              </select>
              <ConnectButton accountStatus="avatar" chainStatus="none" showBalance={false} />
            </div>
          </header>

          {/* Notification dropdown */}
          {showNotifications && (
            <div className="fixed top-16 right-4 z-[200] bg-white rounded-2xl shadow-2xl border border-[#EEF1F5] w-72 max-h-80 overflow-y-auto">
              <div className="px-4 py-3 border-b border-[#EEF1F5] flex items-center justify-between">
                <h3 className="font-bold text-sm">Notifications</h3>
                <button onClick={() => { setNotifications([]); setShowNotifications(false) }} className="text-xs text-[#8A919E] hover:text-[#0A0B0D]">Clear all</button>
              </div>
              {notifications.length === 0 ? (
                <p className="text-[#8A919E] text-sm text-center py-6">No new notifications</p>
              ) : (
                notifications.map((n, i) => (
                  <div key={i} className="px-4 py-3 border-b border-[#EEF1F5] hover:bg-[#F7F9FC]">
                    <p className="text-sm text-[#0A0B0D]">🔥 Your post received new likes!</p>
                    <p className="text-xs text-[#8A919E] mt-0.5">Post #{n.postId}</p>
                  </div>
                ))
              )}
            </div>
          )}

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

          <div className="pt-[60px] md:pt-0 pb-10 max-w-2xl mx-auto">

            {/* ══ FEED ══ */}
            {activeTab === 'feed' && (
              <div>
                <div className="hidden md:flex items-center justify-between px-5 py-4 border-b border-[#EEF1F5] sticky top-0 bg-white/95 backdrop-blur z-10">
                  <h1 className="text-lg font-black text-[#0A0B0D]">{t('feedTitle')}</h1>
                  <div className="flex items-center gap-2">
                    {/* Notification bell desktop */}
                    <button
                      onClick={() => setShowNotifications(!showNotifications)}
                      className="relative w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F7F9FC] transition-colors"
                    >
                      <span className="text-lg">🔔</span>
                      {notifications.length > 0 && (
                        <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                      )}
                    </button>
                    <button onClick={() => setActiveTab('post')}
                      className="bg-[#0052FF] hover:bg-[#1652F0] text-white px-5 py-2 rounded-xl font-bold text-sm transition-colors shadow-sm">
                      {t('navNewPost')}
                    </button>
                  </div>
                </div>

                {/* Search bar */}
                <div className="px-4 pt-3 pb-2 border-b border-[#EEF1F5]">
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search posts and users..."
                    className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-2.5 text-sm text-[#0A0B0D] placeholder-[#8A919E] focus:outline-none focus:border-[#0052FF]"
                  />
                </div>

                {!isConnected && (
                  <div className="mx-4 mt-4 p-4 rounded-2xl bg-[#F0F4FF] border border-[#D6E2FF] flex items-center gap-3">
                    <FlameLogo size={36} />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[#0A0B0D] text-sm">{t('welcomeTitle')}</p>
                      <p className="text-[#5B6271] text-xs">{t('welcomeSub')}</p>
                    </div>
                    <ConnectButton accountStatus="avatar" chainStatus="none" showBalance={false} />
                  </div>
                )}

                {posts.length === 0 && (
                  <div className="text-center text-[#5B6271] mt-40 px-6">
                    <div className="text-7xl mb-4">🔥</div>
                    <p className="font-bold text-[#0A0B0D] text-xl">{t('noPostsTitle')}</p>
                    <p className="text-sm mt-2">{t('noPostsSub')}</p>
                  </div>
                )}

                {visiblePosts.map(post => {
                  const key = post.id.toString()
                  const comments = postComments[key] || []
                  const isLiking = loadingAction === `like-${post.id}`
                  const isTipping = loadingAction === `tip-${post.id}`
                  const isCommenting = loadingAction === `comment-${post.id}`
                  const isOwnPost = address && post.author.toLowerCase() === address.toLowerCase()

                  return (
                    <article key={key} className="border-b border-[#EEF1F5] hover:bg-[#FAFBFD] transition-colors">
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
                              <span className="text-[#8A919E] text-xs">{post.author.slice(0,6)}...{post.author.slice(-4)}</span>
                              <span className="text-[#8A919E] text-xs">·</span>
                              <span className="text-[#8A919E] text-xs">{timeAgo(post.timestamp)}</span>
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

                            {post.content && (
                              <p className="text-[#0A0B0D] text-[15px] leading-relaxed mb-3 whitespace-pre-wrap">{post.content}</p>
                            )}

                            {post.ipfsHash && (
                              <div className="rounded-2xl overflow-hidden mb-3 border border-[#E4E7EB]">
                                <img src={`https://gateway.pinata.cloud/ipfs/${post.ipfsHash}`}
                                  className="w-full max-h-[520px] object-cover" alt="post" />
                              </div>
                            )}

                            <div className="flex items-center gap-0.5 -ml-2 mt-1">
                              <button onClick={() => handleLike(post.id)} disabled={isLiking || !isConnected}
                                title={!isConnected ? t('connectWallet') : ''}
                                className="flex items-center gap-1.5 text-[#5B6271] hover:text-[#FF6B35] hover:bg-[#FFF0EB] rounded-xl px-3 py-2 text-sm transition-all group disabled:opacity-50 disabled:hover:bg-transparent">
                                <span className="text-lg group-hover:scale-125 transition-transform">🔥</span>
                                <span className="font-bold">{post.likes.toString()}</span>
                                <span className="text-[11px] opacity-60 hidden sm:inline">{usdLabel(effectiveFee(likePrice as bigint | undefined))}</span>
                              </button>

                              <button onClick={() => toggleComments(key)}
                                className={`flex items-center gap-1.5 hover:bg-[#E6EEFF] rounded-xl px-3 py-2 text-sm transition-all ${expandedComments[key] ? 'text-[#0052FF] bg-[#E6EEFF]' : 'text-[#5B6271] hover:text-[#0052FF]'}`}>
                                <span className="text-lg">💬</span>
                                <span className="font-bold">{comments.length > 0 ? comments.length : ''}</span>
                              </button>

                              <div className="flex items-center gap-1.5 ml-auto">
                                <input type="number" placeholder="ETH"
                                  value={tipAmounts[key] || ''}
                                  onChange={e => setTipAmounts(prev => ({ ...prev, [key]: e.target.value }))}
                                  disabled={!isConnected}
                                  className="w-20 bg-white border border-[#E4E7EB] rounded-xl px-2 py-1.5 text-xs text-[#0A0B0D] text-center focus:outline-none focus:border-[#0052FF] placeholder-[#8A919E] disabled:opacity-50 disabled:bg-[#F7F9FC]"
                                  step="0.001" min="0.001" />
                                <button onClick={() => handleTip(post.id)} disabled={isTipping || !tipAmounts[key] || !isConnected}
                                  title={!isConnected ? t('connectWallet') : ''}
                                  className="bg-[#0052FF] hover:bg-[#1652F0] text-white disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shadow-sm">
                                  {isTipping ? '...' : '💸 Tip'}
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
                                <div className="flex-1 flex gap-2">
                                  <input type="text"
                                    placeholder={replyingTo[key] ? t('replyPlaceholder', { user: replyingTo[key] }) : `${t('commentPlaceholder')} (${usdLabel(effectiveFee(commentPrice as bigint | undefined))})`}
                                    value={commentTexts[key] || ''}
                                    onChange={e => setCommentTexts(prev => ({ ...prev, [key]: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && handleComment(post.id)}
                                    className="flex-1 bg-white border border-[#E4E7EB] rounded-xl px-3 py-2 text-sm text-[#0A0B0D] placeholder-[#8A919E] focus:outline-none focus:border-[#0052FF]"
                                  />
                                  <button onClick={() => handleComment(post.id)} disabled={isCommenting || !commentTexts[key]}
                                    className="bg-[#0052FF] hover:bg-[#1652F0] text-white disabled:opacity-40 px-4 py-2 rounded-xl text-sm font-bold transition-colors">
                                    {isCommenting ? '...' : '↑'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="pt-3 px-2">
                                <div className="flex items-center justify-between bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-3">
                                  <p className="text-[#5B6271] text-sm">{t('connectToComment')}</p>
                                  <ConnectButton accountStatus="avatar" chainStatus="none" showBalance={false} />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}

            {/* ══ CREATE POST ══ */}
            {activeTab === 'post' && (
              <div className="p-4 md:p-6">
                <h1 className="text-xl font-black mb-5 hidden md:block text-[#0A0B0D]">{t('newPostTitle')}</h1>
                {!isConnected ? (
                  <ConnectPrompt message={t('connectToPost')} label={t('connectWallet')} />
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
                        <p className="text-xs text-[#5B6271]">{t('postFee')}: {usdLabel(effectiveFee(postPrice as bigint | undefined))}</p>
                      </div>
                    </div>
                    <textarea placeholder={t('postPlaceholder')} value={newPost}
                      onChange={e => setNewPost(e.target.value)} rows={6}
                      className="w-full bg-transparent px-5 py-4 text-[#0A0B0D] placeholder-[#8A919E] resize-none focus:outline-none text-[16px] leading-relaxed" />
                    {previewUrl && (
                      <div className="relative mx-4 mb-4 rounded-2xl overflow-hidden border border-[#E4E7EB]">
                        <img src={previewUrl} className="w-full max-h-80 object-cover" alt="preview" />
                        <button onClick={() => { setSelectedFile(null); setPreviewUrl(null) }}
                          className="absolute top-3 right-3 bg-black/70 backdrop-blur rounded-full w-8 h-8 flex items-center justify-center text-white text-sm hover:bg-black transition-colors">✕</button>
                      </div>
                    )}
                    <div className="flex items-center gap-3 px-4 py-3 border-t border-[#EEF1F5]">
                      <label className="cursor-pointer text-[#5B6271] hover:text-[#0052FF] transition-colors">
                        <span className="text-2xl">📷</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                      </label>
                      <span className="text-[#8A919E] text-xs flex-1">{newPost.length}/500</span>
                      <button onClick={createPost} disabled={loading || !newPost}
                        className="bg-[#0052FF] hover:bg-[#1652F0] text-white px-8 py-2.5 rounded-xl font-bold disabled:opacity-40 transition-colors shadow-sm">
                        {loading ? t('posting') : t('post')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ══ TOOLS ══ */}
            {activeTab === 'tools' && (
              <div>
                <div className="px-5 py-4 border-b border-[#EEF1F5] sticky top-0 bg-white/95 backdrop-blur z-10">
                  <h1 className="text-lg font-black text-[#0A0B0D]">🔧 {t('toolsTitle')}</h1>
                  <p className="text-[#5B6271] text-sm">{t('toolsSub')}</p>
                </div>

                {/* Stats bar */}
                <div className="grid grid-cols-3 gap-3 px-4 pt-4 pb-2">
                  <div className="bg-[#F7F9FC] rounded-xl p-3 text-center border border-[#EEF1F5]">
                    <p className="text-xl font-black text-[#0052FF]">{globalCounter !== undefined ? globalCounter.toString() : '—'}</p>
                    <p className="text-[#5B6271] text-xs font-semibold">Global Counts</p>
                  </div>
                  <div className="bg-[#F7F9FC] rounded-xl p-3 text-center border border-[#EEF1F5]">
                    <p className="text-xl font-black text-[#0052FF]">{tokenCount !== undefined ? tokenCount.toString() : '—'}</p>
                    <p className="text-[#5B6271] text-xs font-semibold">Tokens</p>
                  </div>
                  <div className="bg-[#F7F9FC] rounded-xl p-3 text-center border border-[#EEF1F5]">
                    <p className="text-xl font-black text-[#0052FF]">{proposalCount !== undefined ? proposalCount.toString() : '—'}</p>
                    <p className="text-[#5B6271] text-xs font-semibold">Proposals</p>
                  </div>
                </div>

                {/* Tool cards grid */}
                <div className="grid grid-cols-2 gap-3 px-4 py-3">
                  {TOOL_CARDS.map(tool => {
                    const isDeployed = tool.deployed
                    const isActive = activeTool === tool.id
                    return (
                      <button
                        key={tool.id}
                        onClick={() => {
                          if (!isDeployed) return
                          setActiveTool(isActive ? null : tool.id)
                        }}
                        className={`rounded-2xl p-4 text-left border transition-all ${
                          isDeployed
                            ? isActive
                              ? 'bg-[#E6EEFF] border-[#0052FF] shadow-sm'
                              : 'bg-white border-[#E4E7EB] hover:border-[#0052FF] hover:bg-[#F0F4FF]'
                            : 'bg-[#F7F9FC] border-[#E4E7EB] opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <p className="font-mono text-2xl font-bold text-[#0052FF] mb-1">{tool.symbol}</p>
                        <p className="font-black text-[#0A0B0D] text-sm">{tool.label}</p>
                        <p className="text-[#5B6271] text-xs mt-0.5 leading-relaxed">{tool.desc}</p>
                        {!isDeployed && (
                          <a
                            href="https://remix.ethereum.org"
                            target="_blank"
                            onClick={e => e.stopPropagation()}
                            className="mt-2 inline-block text-[#0052FF] text-xs font-semibold hover:underline"
                          >
                            {t('deployViaRemix')}
                          </a>
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Active tool panel */}
                {activeTool && (
                  <div className="mx-4 mb-4 bg-white border border-[#E4E7EB] rounded-2xl p-5 shadow-sm">
                    {!isConnected && (
                      <ConnectPrompt message="Connect your wallet to use tools." label={t('connectWallet')} />
                    )}

                    {isConnected && activeTool === 'counter' && (
                      <div>
                        <h3 className="font-black text-lg mb-3">[##] COUNTER</h3>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="bg-[#F7F9FC] rounded-xl p-3 text-center border border-[#EEF1F5]">
                            <p className="text-2xl font-black text-[#0052FF]">{globalCounter !== undefined ? globalCounter.toString() : '—'}</p>
                            <p className="text-xs text-[#5B6271] font-semibold">Global Counter</p>
                          </div>
                          <div className="bg-[#F7F9FC] rounded-xl p-3 text-center border border-[#EEF1F5]">
                            <p className="text-2xl font-black text-[#0052FF]">{userCounter !== undefined ? userCounter.toString() : '—'}</p>
                            <p className="text-xs text-[#5B6271] font-semibold">Your Count</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (!TOOLS_DEPLOYED) return
                            toolAction(async () => {
                              await writeContractAsync({
                                address: TOOLS_ADDRESS,
                                abi: TOOLS_ABI,
                                functionName: 'count',
                                value: effectiveFee(parseEther('0.0001')),
                              })
                            }, setCounterLoading)
                          }}
                          disabled={counterLoading}
                          className="w-full bg-[#0052FF] hover:bg-[#1652F0] text-white py-3 rounded-xl font-bold disabled:opacity-40 transition-colors"
                        >
                          {counterLoading ? 'Counting...' : 'Count ({toolFeeLabel})'}
                        </button>
                      </div>
                    )}

                    {isConnected && activeTool === 'streak' && (
                      <div>
                        <h3 className="font-black text-lg mb-3">[~] STREAK</h3>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className="bg-[#F7F9FC] rounded-xl p-3 text-center border border-[#EEF1F5]">
                            <p className="text-2xl font-black text-[#0052FF]">{userStreakDays !== undefined ? userStreakDays.toString() : '—'}</p>
                            <p className="text-xs text-[#5B6271] font-semibold">Current Streak</p>
                          </div>
                          <div className="bg-[#F7F9FC] rounded-xl p-3 text-center border border-[#EEF1F5]">
                            <p className="text-2xl font-black text-[#0052FF]">{userMaxStreak !== undefined ? userMaxStreak.toString() : '—'}</p>
                            <p className="text-xs text-[#5B6271] font-semibold">Max Streak</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (!TOOLS_DEPLOYED) return
                            toolAction(async () => {
                              await writeContractAsync({
                                address: TOOLS_ADDRESS,
                                abi: TOOLS_ABI,
                                functionName: 'checkIn',
                                value: effectiveFee(parseEther('0.0001')),
                              })
                            }, setStreakLoading)
                          }}
                          disabled={streakLoading || canCheckIn === false}
                          className="w-full bg-[#0052FF] hover:bg-[#1652F0] text-white py-3 rounded-xl font-bold disabled:opacity-40 transition-colors"
                        >
                          {streakLoading ? 'Checking in...' : canCheckIn === false ? 'Already checked in today' : 'Check In ({toolFeeLabel})'}
                        </button>
                      </div>
                    )}

                    {isConnected && activeTool === 'logbook' && (
                      <div>
                        <h3 className="font-black text-lg mb-3">[📖] LOGBOOK</h3>
                        <p className="text-sm text-[#5B6271] mb-4">One-click on-chain log. Auto-stamps timestamp + your address.</p>
                        <textarea
                          value={logText}
                          onChange={e => setLogText(e.target.value)}
                          placeholder="Optional: custom log text (or leave empty for auto)"
                          rows={3}
                          maxLength={280}
                          className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-3 text-sm text-[#0A0B0D] placeholder-[#8A919E] resize-none focus:outline-none focus:border-[#0052FF] mb-3"
                        />
                        <button
                          onClick={() => {
                            if (!TOOLS_DEPLOYED) return
                            toolAction(async () => {
                              const auto = `Log @ ${new Date().toISOString()} by ${address?.slice(0,8)}`
                              await writeContractAsync({
                                address: TOOLS_ADDRESS,
                                abi: TOOLS_ABI,
                                functionName: 'log',
                                args: [logText || auto],
                                value: effectiveFee(parseEther('0.0001')),
                              }, 'log')
                              setLogText('')
                            }, setLogLoading)
                          }}
                          disabled={logLoading}
                          className="w-full bg-[#0052FF] hover:bg-[#1652F0] text-white py-3 rounded-xl font-bold disabled:opacity-40 transition-colors"
                        >
                          {logLoading ? 'Writing...' : '📝 Log on-chain ({toolFeeLabel})'}
                        </button>
                      </div>
                    )}

                    {isConnected && activeTool === 'greeter' && (
                      <div>
                        <h3 className="font-black text-lg mb-3">[👋] GREETER</h3>
                        {userGreeting && (
                          <div className="bg-[#F0F4FF] border border-[#D6E2FF] rounded-xl p-3 mb-3">
                            <p className="text-xs text-[#5B6271] font-semibold mb-1">Current greeting:</p>
                            <p className="text-sm text-[#0A0B0D] font-bold">{userGreeting as string}</p>
                          </div>
                        )}
                        <input
                          value={greetText}
                          onChange={e => setGreetText(e.target.value)}
                          placeholder="Set your on-chain greeting (max 100 chars)..."
                          maxLength={100}
                          className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-3 text-sm text-[#0A0B0D] placeholder-[#8A919E] focus:outline-none focus:border-[#0052FF] mb-3"
                        />
                        <button
                          onClick={() => {
                            if (!TOOLS_DEPLOYED || !greetText) return
                            toolAction(async () => {
                              await writeContractAsync({
                                address: TOOLS_ADDRESS,
                                abi: TOOLS_ABI,
                                functionName: 'greet',
                                args: [greetText],
                                value: effectiveFee(parseEther('0.0001')),
                              })
                              setGreetText('')
                            }, setGreetLoading)
                          }}
                          disabled={greetLoading || !greetText}
                          className="w-full bg-[#0052FF] hover:bg-[#1652F0] text-white py-3 rounded-xl font-bold disabled:opacity-40 transition-colors"
                        >
                          {greetLoading ? 'Setting...' : 'Set Greeting ({toolFeeLabel})'}
                        </button>
                      </div>
                    )}

                    {isConnected && activeTool === 'token' && (
                      <div>
                        <h3 className="font-black text-lg mb-3">[$] TOKEN FACTORY</h3>
                        <div className="space-y-3 mb-4">
                          <input
                            value={tokenName}
                            onChange={e => setTokenName(e.target.value)}
                            placeholder="Token name (e.g. MyToken)"
                            className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-3 text-sm text-[#0A0B0D] placeholder-[#8A919E] focus:outline-none focus:border-[#0052FF]"
                          />
                          <input
                            value={tokenSymbol}
                            onChange={e => setTokenSymbol(e.target.value)}
                            placeholder="Symbol (e.g. MTK)"
                            className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-3 text-sm text-[#0A0B0D] placeholder-[#8A919E] focus:outline-none focus:border-[#0052FF]"
                          />
                          <input
                            value={tokenSupply}
                            onChange={e => setTokenSupply(e.target.value)}
                            placeholder="Total supply (1 - 1,000,000,000)"
                            type="number"
                            min="1"
                            max="1000000000"
                            className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-3 text-sm text-[#0A0B0D] placeholder-[#8A919E] focus:outline-none focus:border-[#0052FF]"
                          />
                        </div>
                        {tokenCount !== undefined && (
                          <p className="text-xs text-[#5B6271] mb-3">Tokens deployed: {tokenCount.toString()}</p>
                        )}
                        <button
                          onClick={() => {
                            if (!TOKEN_FACTORY_DEPLOYED || !tokenName || !tokenSymbol || !tokenSupply) return
                            toolAction(async () => {
                              await writeContractAsync({
                                address: TOKEN_FACTORY_ADDRESS,
                                abi: TOKEN_FACTORY_ABI,
                                functionName: 'deployToken',
                                args: [tokenName, tokenSymbol, BigInt(tokenSupply)],
                                value: effectiveFee(parseEther('0.0001')),
                              })
                              setTokenName(''); setTokenSymbol(''); setTokenSupply('1000000')
                            }, setTokenLoading)
                          }}
                          disabled={tokenLoading || !tokenName || !tokenSymbol || !tokenSupply}
                          className="w-full bg-[#0052FF] hover:bg-[#1652F0] text-white py-3 rounded-xl font-bold disabled:opacity-40 transition-colors"
                        >
                          {tokenLoading ? 'Deploying...' : 'Deploy Token ({toolFeeLabel})'}
                        </button>
                      </div>
                    )}

                    {isConnected && activeTool === 'nft' && (
                      <div>
                        <h3 className="font-black text-lg mb-3">[*] NFT FACTORY</h3>
                        <div className="space-y-3 mb-4">
                          <input
                            value={nftName}
                            onChange={e => setNftName(e.target.value)}
                            placeholder="Collection name"
                            className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-3 text-sm text-[#0A0B0D] placeholder-[#8A919E] focus:outline-none focus:border-[#0052FF]"
                          />
                          <input
                            value={nftSymbol}
                            onChange={e => setNftSymbol(e.target.value)}
                            placeholder="Symbol (e.g. FNFT)"
                            className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-3 text-sm text-[#0A0B0D] placeholder-[#8A919E] focus:outline-none focus:border-[#0052FF]"
                          />
                          <input
                            value={nftMaxSupply}
                            onChange={e => setNftMaxSupply(e.target.value)}
                            placeholder="Max supply (1 - 10,000)"
                            type="number"
                            min="1"
                            max="10000"
                            className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-3 text-sm text-[#0A0B0D] placeholder-[#8A919E] focus:outline-none focus:border-[#0052FF]"
                          />
                          <div className="w-full bg-[#F0F4FF] border border-[#0052FF]/30 rounded-xl px-4 py-3 text-sm text-[#0052FF] font-bold">
                            Mint price: $0.50 per NFT ({nftMintPriceETH.slice(0,8)} ETH)
                          </div>
                        </div>
                        {nftCollectionCount !== undefined && (
                          <p className="text-xs text-[#5B6271] mb-3">Collections deployed: {nftCollectionCount.toString()}</p>
                        )}
                        <button
                          onClick={() => {
                            if (!NFT_FACTORY_DEPLOYED || !nftName || !nftSymbol || !nftMaxSupply) return
                            toolAction(async () => {
                              await writeContractAsync({
                                address: NFT_FACTORY_ADDRESS,
                                abi: NFT_FACTORY_ABI,
                                functionName: 'deployNFT',
                                args: [nftName, nftSymbol, BigInt(nftMaxSupply), nftMintPriceWei, ''],
                                value: effectiveFee(parseEther('0.0001')),
                              })
                              setNftName(''); setNftSymbol(''); setNftMaxSupply('1000')
                            }, setNftLoading)
                          }}
                          disabled={nftLoading || !nftName || !nftSymbol || !nftMaxSupply}
                          className="w-full bg-[#0052FF] hover:bg-[#1652F0] text-white py-3 rounded-xl font-bold disabled:opacity-40 transition-colors"
                        >
                          {nftLoading ? 'Deploying...' : `Deploy NFT Collection (${toolFeeLabel})`}
                        </button>
                      </div>
                    )}

                    {isConnected && activeTool === 'dao' && (
                      <div>
                        <h3 className="font-black text-lg mb-3">[△] SIMPLE DAO</h3>
                        {proposalCount !== undefined && (
                          <p className="text-xs text-[#5B6271] mb-3">Active proposals: {proposalCount.toString()}</p>
                        )}
                        <div className="space-y-3 mb-4">
                          <input
                            value={daoTitle}
                            onChange={e => setDaoTitle(e.target.value)}
                            placeholder="Proposal title (1-100 chars)"
                            maxLength={100}
                            className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-3 text-sm text-[#0A0B0D] placeholder-[#8A919E] focus:outline-none focus:border-[#0052FF]"
                          />
                          <textarea
                            value={daoDesc}
                            onChange={e => setDaoDesc(e.target.value)}
                            placeholder="Proposal description..."
                            rows={3}
                            className="w-full bg-[#F7F9FC] border border-[#E4E7EB] rounded-xl px-4 py-3 text-sm text-[#0A0B0D] placeholder-[#8A919E] resize-none focus:outline-none focus:border-[#0052FF]"
                          />
                        </div>
                        <button
                          onClick={() => {
                            if (!DAO_DEPLOYED || !daoTitle) return
                            toolAction(async () => {
                              await writeContractAsync({
                                address: DAO_ADDRESS,
                                abi: DAO_ABI,
                                functionName: 'propose',
                                args: [daoTitle, daoDesc],
                                value: effectiveFee(parseEther('0.0001')),
                              })
                              setDaoTitle(''); setDaoDesc('')
                            }, setDaoLoading)
                          }}
                          disabled={daoLoading || !daoTitle}
                          className="w-full bg-[#0052FF] hover:bg-[#1652F0] text-white py-3 rounded-xl font-bold disabled:opacity-40 transition-colors"
                        >
                          {daoLoading ? 'Creating...' : `Create Proposal (${toolFeeLabel})`}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ══ LEADERBOARD ══ */}
            {activeTab === 'leaderboard' && (
              <div>
                <div className="px-5 py-4 border-b border-[#EEF1F5] sticky top-0 bg-white/95 backdrop-blur z-10">
                  <h1 className="text-lg font-black text-[#0A0B0D]">🏆 {t('leaderboardTitle')}</h1>
                  <p className="text-[#5B6271] text-sm">{t('leaderboardSub')}</p>
                </div>
                <div className="divide-y divide-[#EEF1F5]">
                  {(leaderboard.length > 0 ? leaderboard : FAKE_LEADERBOARD.map(f => ({
                    address: f.address,
                    profile: { username: f.username, avatarHash: '', exists: true, flames: BigInt(f.flames), tips: 0n }
                  }))).map(({ address: addr, profile: p }, idx) => (
                    <div key={addr} className="flex items-center gap-4 px-5 py-4 hover:bg-[#F7F9FC] transition-colors">
                      <div className={`w-9 text-center font-black text-xl flex-shrink-0 ${
                        idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-orange-500' : 'text-[#8A919E] text-base'
                      }`}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                      </div>
                      <Avatar addr={addr} profiles={profiles} />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[#0A0B0D] text-[15px]">{p.username}</p>
                        <p className="text-[#8A919E] text-xs">{addr.slice(0,6)}...{addr.slice(-4)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-[#0052FF] text-lg">{p.flames.toString()} 🔥</p>
                        {p.tips > 0n && (
                          <p className="text-[#8A919E] text-xs">{parseFloat(formatEther(p.tips)).toFixed(4)} ETH</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ══ PROFILE ══ */}
            {activeTab === 'profile' && (
              <div className="p-4 md:p-6 space-y-4">
                <h1 className="text-xl font-black hidden md:block text-[#0A0B0D]">{t('profileTitle')}</h1>

                {!isConnected ? (
                  <ConnectPrompt message={t('connectToProfile')} label={t('connectWallet')} />
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
                      <div className="h-28 bg-gradient-to-r from-[#0052FF] via-[#1652F0] to-[#4D8FFF]" />
                      <div className="px-6 pb-6">
                        <div className="relative -mt-12 mb-4 inline-block">
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
                        <h2 className="text-2xl font-black text-[#0A0B0D]">{myProfile[0]}</h2>
                        <p className="text-[#5B6271] text-sm mb-1">{address?.slice(0,10)}...{address?.slice(-6)}</p>
                        {walletBalance && (
                          <p className="text-[#0052FF] text-sm font-bold mb-5">
                            {parseFloat(formatEther(walletBalance.value)).toFixed(4)} ETH
                            <span className="text-[#8A919E] font-normal ml-1">{t('balance')}</span>
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-[#F7F9FC] rounded-xl p-4 text-center border border-[#EEF1F5]">
                            <p className="text-3xl font-black text-[#0052FF]">{myProfile[3].toString()}</p>
                            <p className="text-[#5B6271] text-sm mt-1 font-semibold">🔥 {t('flames')}</p>
                          </div>
                          <div className="bg-[#F7F9FC] rounded-xl p-4 text-center border border-[#EEF1F5]">
                            <p className="text-2xl font-black text-[#0052FF]">{parseFloat(formatEther(myProfile[4])).toFixed(4)}</p>
                            <p className="text-[#5B6271] text-sm mt-1 font-semibold">💸 {t('ethEarned')}</p>
                          </div>
                        </div>
                        <a href={`https://basescan.org/address/${address}`} target="_blank"
                          className="flex items-center justify-center gap-2 mt-4 text-[#5B6271] hover:text-[#0052FF] text-sm transition-colors font-semibold">
                          {t('viewBasescan')}
                        </a>
                      </div>
                    </div>

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

                        {/* One-click price setup */}
                        <div className="bg-gradient-to-br from-[#0052FF] to-[#1652F0] rounded-xl p-4 mb-3 text-white">
                          <p className="font-black text-sm mb-1">⚡ One-Click Setup</p>
                          <p className="text-white/80 text-xs mb-3">Sets like/comment/post/photo prices to $0.07 each. Tip stays free for users to choose amount.</p>
                          <button
                            onClick={async () => {
                              if (loading) return
                              setLoading(true)
                              try {
                                const price = fixedFee
                                await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'setLikePrice', args: [price] }, 'setLikePrice')
                                await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'setCommentPrice', args: [price] }, 'setCommentPrice')
                                await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'setPostPrice', args: [price] }, 'setPostPrice')
                                await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'setPhotoPrice', args: [price] }, 'setPhotoPrice')
                              } catch (e) { console.error(e) }
                              setLoading(false)
                            }}
                            disabled={loading}
                            className="w-full bg-white text-[#0052FF] py-2.5 rounded-lg font-black text-sm hover:bg-white/90 disabled:opacity-50 transition-colors"
                          >
                            {loading ? 'Setting prices... (4 transactions)' : '🚀 Set all fees to $0.07'}
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
          </div>

          {/* Footer */}
          <footer className="border-t border-[#EEF1F5] px-6 py-6 max-w-2xl mx-auto">
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[#8A919E] mb-3">
              <a href={`https://basescan.org/address/${CONTRACT_ADDRESS}`} target="_blank" className="hover:text-[#0052FF] transition-colors">{t('footerContract')}</a>
              <span>·</span>
              <span>{t('footerPrivacy')}</span>
              <span>·</span>
              <span>{t('footerTerms')}</span>
              <span>·</span>
              <span>{t('footerCookies')}</span>
            </div>
            <p className="text-center text-xs text-[#C5CBD3]">
              © {new Date().getFullYear()} FlameBase. {t('footerRights')} {t('footerSecured')}
            </p>
          </footer>
        </main>

        {/* ── Right Sidebar — Top Flamers (xl+) ── */}
        <aside className="hidden xl:flex flex-col fixed right-0 top-0 h-full w-72 bg-white border-l border-[#E4E7EB] z-40 px-4 py-6">
          <h2 className="text-base font-black mb-4 px-2 text-[#0A0B0D]">🏆 {t('topFlamers')}</h2>
          <div className="flex-1 space-y-1 overflow-y-auto">
            {(leaderboard.length > 0 ? leaderboard.slice(0, 12) : FAKE_LEADERBOARD.map(f => ({
              address: f.address,
              profile: { username: f.username, avatarHash: '', exists: true, flames: BigInt(f.flames), tips: 0n }
            }))).map(({ address: addr, profile: p }, idx) => (
              <button key={addr} onClick={() => setActiveTab('leaderboard')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F7F9FC] transition-colors text-left">
                <span className={`text-sm font-black w-5 text-center flex-shrink-0 ${
                  idx === 0 ? 'text-yellow-500' : idx === 1 ? 'text-gray-400' : idx === 2 ? 'text-orange-500' : 'text-[#8A919E]'
                }`}>{idx + 1}</span>
                <Avatar addr={addr} profiles={profiles} size="sm" />
                <p className="font-semibold text-sm text-[#0A0B0D] truncate flex-1">{p.username}</p>
                <p className="text-[#0052FF] text-sm font-black flex-shrink-0">{p.flames.toString()} 🔥</p>
              </button>
            ))}
          </div>
          <div className="border-t border-[#EEF1F5] pt-4 mt-4 px-2">
            <p className="text-[#C5CBD3] text-[11px] text-center leading-relaxed">
              {t('footerBuiltOn')}
            </p>
          </div>
        </aside>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-[#E4E7EB] z-50 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.05)]">
        <div className="flex">
          {navItems.map(({ tab, icon, labelKey }) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition-colors ${activeTab === tab ? 'text-[#0052FF]' : 'text-[#8A919E]'}`}>
              <span className="text-xl">{icon}</span>
              <span className="text-[10px] font-bold">{t(labelKey)}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* ── User Profile Modal ── */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4" onClick={() => setSelectedUser(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-[#EEF1F5] px-5 py-4 flex items-center justify-between">
              <h2 className="font-black text-lg">Profile</h2>
              <button onClick={() => setSelectedUser(null)} className="w-8 h-8 rounded-full hover:bg-[#F7F9FC] flex items-center justify-center text-[#5B6271] transition-colors">✕</button>
            </div>
            {/* Profile header */}
            <div className="p-5">
              <div className="flex items-center gap-4 mb-4">
                <Avatar addr={selectedUser} profiles={profiles} size="lg" />
                <div>
                  <h3 className="text-xl font-black">{getUsername(selectedUser)}</h3>
                  <p className="text-[#8A919E] text-sm">{selectedUser.slice(0,8)}...{selectedUser.slice(-6)}</p>
                  <a href={`https://basescan.org/address/${selectedUser}`} target="_blank" className="text-[#0052FF] text-xs hover:underline">View on Basescan ↗</a>
                </div>
              </div>
              {profiles[selectedUser.toLowerCase()] && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-[#F7F9FC] rounded-xl p-3 text-center border border-[#EEF1F5]">
                    <p className="text-2xl font-black text-[#0052FF]">{profiles[selectedUser.toLowerCase()].flames.toString()}</p>
                    <p className="text-[#5B6271] text-xs font-semibold">🔥 Flames</p>
                  </div>
                  <div className="bg-[#F7F9FC] rounded-xl p-3 text-center border border-[#EEF1F5]">
                    <p className="text-2xl font-black text-[#0052FF]">{parseFloat(formatEther(profiles[selectedUser.toLowerCase()].tips)).toFixed(4)}</p>
                    <p className="text-[#5B6271] text-xs font-semibold">💸 ETH</p>
                  </div>
                </div>
              )}
              {/* User's posts */}
              <div className="space-y-3">
                {posts.filter(p => p.author.toLowerCase() === selectedUser.toLowerCase()).map(post => (
                  <div key={post.id.toString()} className="bg-[#F7F9FC] rounded-2xl p-4 border border-[#EEF1F5]">
                    {post.content && <p className="text-sm text-[#0A0B0D] mb-2">{post.content}</p>}
                    {post.ipfsHash && <img src={`https://gateway.pinata.cloud/ipfs/${post.ipfsHash}`} className="w-full max-h-40 object-cover rounded-xl mb-2" alt="" />}
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
