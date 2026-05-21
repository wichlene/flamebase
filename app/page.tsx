'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWriteContract, useReadContract, usePublicClient, useBalance, useSwitchChain, useChainId } from 'wagmi'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { parseEther, formatEther } from 'viem'
import { base } from 'wagmi/chains'
import dynamic from 'next/dynamic'
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/contract'
import { T, LANG_LABELS, type Lang } from '../lib/i18n'
import { TOOLS_ADDRESS, TOKEN_FACTORY_ADDRESS, NFT_FACTORY_ADDRESS, DAO_ADDRESS, TOOLS_ABI, TOKEN_FACTORY_ABI, NFT_FACTORY_ABI, DAO_ABI } from '../lib/toolsContracts'
import { SFX, isSoundEnabled, setSoundEnabled } from '../lib/sounds'
import { ToastStack, type ToastItem, type ToastKind } from '../components/Toast'

const Messages = dynamic(() => import('../components/Messages'), { ssr: false, loading: () => <div className="p-8 text-center text-[#5B6271]">💬 Loading…</div> })
const AIChat = dynamic(() => import('../components/AIChat'), { ssr: false, loading: () => <div className="p-8 text-center text-[#5B6271]">🤖 Loading AI…</div> })
const Reels = dynamic(() => import('../components/Reels'), { ssr: false, loading: () => <div className="p-8 text-center text-[#5B6271]">🎬 Loading Reels…</div> })

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

type Tab = 'feed' | 'post' | 'activity' | 'messages' | 'profile' | 'ai' | 'reels'

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
    <img src="/logo.png" alt="FlameBase" width={size} height={size} className="flex-shrink-0 object-contain" />
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
  const [reelsEverOpened, setReelsEverOpened] = useState(false)
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

  // Derive unseen activity count: likes+comments on user's posts since last visit to activity tab
  const myPosts = address ? posts.filter(p => p.author.toLowerCase() === address.toLowerCase()) : []
  const activityCount = myPosts.reduce((sum, p) => {
    const key = p.id.toString()
    const prev = seenActivity[key] ?? 0
    const current = Number(p.likes) + Number(p.tips)
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

  // $0.04 fixed fee in ETH — recalculated when ETH price updates
  const fixedFeeETH = (0.04 / ethPrice).toFixed(10)
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
  const [nftName, setNftName] = useState('FlameBase NFT')
  const [nftSymbol, setNftSymbol] = useState('FNFT')
  const [nftMaxSupply, setNftMaxSupply] = useState('1000')
  const [nftLoading, setNftLoading] = useState(false)
  const [daoTitle, setDaoTitle] = useState('')
  const [daoDesc, setDaoDesc] = useState('')
  const [daoLoading, setDaoLoading] = useState(false)
  const [proposalLoading, setProposalLoading] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Unread message count from Messages component
  const [unreadMessages, setUnreadMessages] = useState(0)
  // Share popover state — which post's share menu is open + brief "copied" flash
  const [sharePost, setSharePost] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)
  // AI post improvement
  const [improving, setImproving] = useState(false)

  // Friends system (stored in localStorage)
  const [following, setFollowing] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!address) return
    try {
      const raw = localStorage.getItem(`flamebase_following_${address.toLowerCase()}`)
      if (raw) setFollowing(new Set(JSON.parse(raw)))
    } catch {}
  }, [address])

  const followUser = (target: string) => {
    const t = target.toLowerCase()
    const next = new Set(following); next.add(t)
    setFollowing(next)
    localStorage.setItem(`flamebase_following_${address!.toLowerCase()}`, JSON.stringify([...next]))
  }

  const unfollowUser = (target: string) => {
    const t = target.toLowerCase()
    const next = new Set(following); next.delete(t)
    setFollowing(next)
    localStorage.setItem(`flamebase_following_${address!.toLowerCase()}`, JSON.stringify([...next]))
  }

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

  // Fetch ETH price for $0.04 calculation
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
    const actStored = localStorage.getItem('flamebase_seen_activity')
    if (actStored) {
      try { setSeenActivity(JSON.parse(actStored)) } catch {}
    }
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
    if (file && file.size > 50 * 1024 * 1024) {
      alert('File too large (max 50 MB). Please use a shorter video (~1 min).')
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
        if (!res.ok || !data.ipfsHash) {
          showToast('error', 'Upload failed — try a smaller file or different format')
          setLoading(false)
          return
        }
        ipfsHash = selectedFile.type.startsWith('video/') ? `vid_${data.ipfsHash}` : data.ipfsHash
      }
      await writeContractAsync({
        address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'createPost',
        args: [newPost, ipfsHash], value: effectiveFee(postPrice as bigint | undefined),
      })
      setNewPost(''); setSelectedFile(null); setPreviewUrl(null)
      setTimeout(() => refetchCount(), 3000)
      setActiveTab('feed')
      SFX.post()
      showToast('success', 'Post published — confirming on Base…')
    } catch (e) {
      console.error(e)
      showToast('error', 'Post failed — transaction rejected')
    }
    setLoading(false)
  }

  const handleLike = async (postId: bigint) => {
    if (!isConnected) return
    const key = postId.toString()
    setAnimatingLike(key)
    setTimeout(() => setAnimatingLike(prev => prev === key ? null : prev), 500)
    SFX.like()
    setLoadingAction(`like-${postId}`)
    try {
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'like', args: [postId], value: effectiveFee(likePrice as bigint | undefined) })
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: p.likes + 1n } : p))
    } catch (e) {
      console.error(e)
      showToast('error', 'Like failed — transaction rejected or reverted')
    }
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
          value: fixedFee,
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
              <button key={tab} onClick={() => {
                setActiveTab(tab)
                if (tab === 'reels') setReelsEverOpened(true)
                if (tab === 'activity') {
                  const snapshot: Record<string, number> = {}
                  myPosts.forEach(p => { snapshot[p.id.toString()] = Number(p.likes) + Number(p.tips) })
                  setSeenActivity(snapshot)
                  localStorage.setItem('flamebase_seen_activity', JSON.stringify(snapshot))
                  myPosts.forEach(p => { if (!postComments[p.id.toString()]) loadComments(p.id.toString()) })
                }
              }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-semibold transition-all text-left text-sm ${
                  activeTab === tab ? 'bg-[#E6EEFF] text-[#0052FF]' : 'text-[#5B6271] hover:bg-[#F7F9FC] hover:text-[#0A0B0D]'
                }`}>
                <span className="text-lg">{icon}</span>
                <span className="flex-1">{t(labelKey)}</span>
                {tab === 'activity' && activityCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{activityCount > 99 ? '99+' : activityCount}</span>
                )}
                {tab === 'messages' && unreadMessages > 0 && activeTab !== 'messages' && (
                  <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{unreadMessages > 99 ? '99+' : unreadMessages}</span>
                )}
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
        <main className="flex-1 md:ml-60 xl:mr-96 min-h-screen border-x border-[#EEF1F5]">

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
              <button onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F7F9FC] transition-colors"
                aria-label="Toggle theme">
                <span className="text-base">{theme === 'dark' ? '☀️' : '🌙'}</span>
              </button>
              <button onClick={toggleSound} title={soundOn ? 'Mute' : 'Enable sound'}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F7F9FC] transition-colors"
                aria-label="Toggle sound">
                <span className="text-base">{soundOn ? '🔊' : '🔇'}</span>
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

          <div className="pt-[60px] md:pt-0 pb-24 md:pb-10 max-w-2xl mx-auto">

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

                {visiblePosts.map(post => {
                  const key = post.id.toString()
                  const comments = postComments[key] || []
                  const isLiking = loadingAction === `like-${post.id}`
                  const isTipping = loadingAction === `tip-${post.id}`
                  const isCommenting = loadingAction === `comment-${post.id}`
                  const isOwnPost = address && post.author.toLowerCase() === address.toLowerCase()

                  return (
                    <article key={key} className="border-b border-[#EEF1F5] hover:bg-[#FAFBFD] hover:shadow-sm transition-all duration-200">
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
                              <p className="text-[#0A0B0D] text-[15px] leading-relaxed mb-3 whitespace-pre-wrap">
                                {post.content.split(/(#[\p{L}0-9_]{2,30})/gu).map((part, i) =>
                                  part.startsWith('#')
                                    ? <span key={i} role="button" tabIndex={0}
                                        onClick={(e) => { e.stopPropagation(); setSearchQuery(part.toLowerCase()) }}
                                        onKeyDown={(e) => { if (e.key === 'Enter') setSearchQuery(part.toLowerCase()) }}
                                        className="text-[#0052FF] hover:underline cursor-pointer font-semibold">
                                        {part}
                                      </span>
                                    : <span key={i}>{part}</span>
                                )}
                              </p>
                            )}

                            {post.ipfsHash && (
                              <div className="rounded-2xl overflow-hidden mb-3 border border-[#E4E7EB]">
                                {post.ipfsHash.startsWith('vid_') ? (
                                  <video src={`https://gateway.pinata.cloud/ipfs/${post.ipfsHash.slice(4)}`}
                                    controls playsInline className="w-full max-h-[520px] bg-black" />
                                ) : (
                                  <img src={`https://gateway.pinata.cloud/ipfs/${post.ipfsHash}`}
                                    className="w-full max-h-[520px] object-cover" alt="post" />
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

                              <div className="relative">
                                <button onClick={() => { setSharePost(sharePost === key ? null : key); setShareCopied(false) }}
                                  className="flex items-center gap-1.5 text-[#5B6271] hover:text-[#0052FF] hover:bg-[#E6EEFF] rounded-xl px-3 py-2 text-sm transition-all"
                                  title="Share">
                                  <span className="text-lg">🔗</span>
                                </button>
                                {sharePost === key && (() => {
                                  const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/?post=${key}`
                                  const text = (post.content || 'Check out this post on FlameBase').slice(0, 200)
                                  const xUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(`${text}\n\n`)}&url=${encodeURIComponent(url)}`
                                  const fcUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(`${text}\n\n${url}`)}`
                                  return (
                                    <>
                                      <div className="fixed inset-0 z-20" onClick={() => setSharePost(null)} />
                                      <div className="absolute z-30 top-full left-0 mt-1 w-52 bg-white border border-[#E4E7EB] rounded-xl shadow-xl overflow-hidden">
                                        <button
                                          onClick={async () => {
                                            try { await navigator.clipboard.writeText(url) } catch {}
                                            setShareCopied(true)
                                            setTimeout(() => { setShareCopied(false); setSharePost(null) }, 1200)
                                          }}
                                          className="w-full text-left px-3 py-2.5 text-sm font-semibold text-[#0A0B0D] hover:bg-[#F7F9FC] flex items-center gap-2.5 border-b border-[#EEF1F5]"
                                        >
                                          <span className="text-base">{shareCopied ? '✅' : '📋'}</span>
                                          {shareCopied ? 'Copied!' : 'Copy link'}
                                        </button>
                                        <a href={xUrl} target="_blank" rel="noopener noreferrer"
                                          onClick={() => setSharePost(null)}
                                          className="w-full px-3 py-2.5 text-sm font-semibold text-[#0A0B0D] hover:bg-[#F7F9FC] flex items-center gap-2.5 border-b border-[#EEF1F5]">
                                          <span className="text-base">𝕏</span> Share on X
                                        </a>
                                        <a href={fcUrl} target="_blank" rel="noopener noreferrer"
                                          onClick={() => setSharePost(null)}
                                          className="w-full px-3 py-2.5 text-sm font-semibold text-[#0A0B0D] hover:bg-[#F7F9FC] flex items-center gap-2.5">
                                          <span className="text-base">🟣</span> Share on Farcaster
                                        </a>
                                      </div>
                                    </>
                                  )
                                })()}
                              </div>

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
                                <div className="flex-1 flex gap-2">
                                  <input type="text"
                                    placeholder={replyingTo[key] ? t('replyPlaceholder', { user: replyingTo[key] }) : t('commentPlaceholder')}
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
                        <p className="text-xs text-[#5B6271]">Post fee: $0.04</p>
                      </div>
                    </div>
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
                    <div className="flex items-center gap-3 px-4 py-3 border-t border-[#EEF1F5]">
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
                      const current = Number(post.likes) + Number(post.tips)
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
              <div>
                <h1 className="text-xl font-black px-4 md:px-6 pt-4 md:pt-6 text-[#0A0B0D]">{t('navMessages')}</h1>
                <Messages profiles={profiles} fixedFee={fixedFee} pendingTarget={pendingDmTarget} onPendingHandled={() => setPendingDmTarget(null)} onUnreadCount={setUnreadMessages} />
              </div>
            )}

            {/* ══ AI CHAT ══ */}
            {activeTab === 'ai' && (
              <div>
                <AIChat />
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
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-[#F7F9FC] rounded-xl p-4 text-center border border-[#EEF1F5]">
                            <p className="text-3xl font-black text-[#0052FF]">{myProfile[3].toString()}</p>
                            <p className="text-[#5B6271] text-sm mt-1 font-semibold">🔥 {t('flames')}</p>
                          </div>
                          <div className="bg-[#F7F9FC] rounded-xl p-4 text-center border border-[#EEF1F5]">
                            <p className="text-2xl font-black text-[#0052FF]">{parseFloat(formatEther(myProfile[4])).toFixed(4)}</p>
                            <p className="text-[#5B6271] text-sm mt-1 font-semibold">💸 {t('ethEarned')}</p>
                          </div>
                          <div className="bg-[#F7F9FC] rounded-xl p-4 text-center border border-[#EEF1F5]">
                            <p className="text-3xl font-black text-[#0052FF]">{myPosts.length}</p>
                            <p className="text-[#5B6271] text-sm mt-1 font-semibold">📝 Posts</p>
                          </div>
                          <div className="bg-[#F7F9FC] rounded-xl p-4 text-center border border-[#EEF1F5]">
                            <p className="text-3xl font-black text-[#0052FF]">{following.size}</p>
                            <p className="text-[#5B6271] text-sm mt-1 font-semibold">👥 Friends</p>
                          </div>
                        </div>
                        <a href={`https://basescan.org/address/${address}`} target="_blank"
                          className="flex items-center justify-center gap-2 mt-4 text-[#5B6271] hover:text-[#0052FF] text-sm transition-colors font-semibold">
                          {t('viewBasescan')}
                        </a>
                      </div>
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

                    {/* Friends list */}
                    {following.size > 0 && (
                      <div className="bg-white border border-[#E4E7EB] rounded-2xl p-5 shadow-sm mb-4">
                        <h3 className="font-black text-[#0A0B0D] mb-3">Friends ({following.size})</h3>
                        <div className="space-y-2">
                          {[...following].map(addr => (
                            <div key={addr} className="flex items-center gap-3">
                              <button onClick={() => setSelectedUser(addr)} className="flex items-center gap-2 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                                <Avatar addr={addr} profiles={profiles} size="sm" />
                                <div className="min-w-0">
                                  <p className="text-sm font-bold truncate text-[#0A0B0D]">{profiles[addr]?.username || `${addr.slice(0,6)}…${addr.slice(-4)}`}</p>
                                  <p className="text-xs text-[#8A919E] truncate">{addr.slice(0,8)}…</p>
                                </div>
                              </button>
                              <button onClick={() => unfollowUser(addr)}
                                className="text-xs text-red-400 hover:text-red-600 font-bold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors flex-shrink-0">
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

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
                                <img src={`https://gateway.pinata.cloud/ipfs/${post.ipfsHash}`}
                                  className="w-full h-full object-cover" alt="" />
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

                        {/* One-click price setup */}
                        <div className="bg-gradient-to-br from-[#0052FF] to-[#1652F0] rounded-xl p-4 mb-3 text-white">
                          <p className="font-black text-sm mb-1">⚡ One-Click Setup</p>
                          <p className="text-white/80 text-xs mb-3">Sets all fees to $0.04 — approve all 4 MetaMask transactions.</p>
                          <button
                            onClick={async () => {
                              if (loading) return
                              setLoading(true)
                              try {
                                const zero = 0n
                                await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'setLikePrice', args: [zero] }, 'setLikePrice')
                                await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'setCommentPrice', args: [zero] }, 'setCommentPrice')
                                await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'setPostPrice', args: [zero] }, 'setPostPrice')
                                await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'setPhotoPrice', args: [zero] }, 'setPhotoPrice')
                              } catch (e) { console.error(e) }
                              setLoading(false)
                            }}
                            disabled={loading}
                            className="w-full bg-white text-[#0052FF] py-2.5 rounded-lg font-black text-sm hover:bg-white/90 disabled:opacity-50 transition-colors"
                          >
                            {loading ? 'Setting prices… (4 tx)' : '🚀 Set all fees to $0.04'}
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

          {/* Tool Buttons — 3-column grid */}
          <div className="px-3 pt-4 pb-2">
            <p className="text-xs font-black text-[#8A919E] uppercase tracking-wider px-1 mb-3">🔧 Tools</p>
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
                    <a href={`https://basescan.org/tx/${tx.hash}`} target="_blank" rel="noreferrer"
                      className="text-green-400 hover:text-white underline truncate">{tx.hash.slice(0,12)}…</a>
                  </div>
                )
              })}
            </div>
          </div>

        </aside>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-[#E4E7EB] z-50 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.05)] pb-safe">
        <div className="flex">
          {navItems.map(({ tab, icon, labelKey }) => (
            <button key={tab} onClick={() => {
              setActiveTab(tab)
              if (tab === 'reels') setReelsEverOpened(true)
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
              <span className="text-[10px] font-bold">{t(labelKey)}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Floating toast notifications */}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

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
                <div className="flex-1">
                  <h3 className="text-xl font-black">{getUsername(selectedUser)}</h3>
                  <p className="text-[#8A919E] text-sm">{selectedUser.slice(0,8)}...{selectedUser.slice(-6)}</p>
                  <a href={`https://basescan.org/address/${selectedUser}`} target="_blank" className="text-[#0052FF] text-xs hover:underline">View on Basescan ↗</a>
                </div>
                {isConnected && address && selectedUser.toLowerCase() !== address.toLowerCase() && (
                  <div className="flex flex-col gap-1.5">
                    {following.has(selectedUser.toLowerCase()) ? (
                      <button onClick={() => unfollowUser(selectedUser)}
                        className="px-4 py-1.5 rounded-xl border-2 border-[#0052FF] text-[#0052FF] text-xs font-black hover:bg-red-50 hover:border-red-500 hover:text-red-500 transition-colors">
                        Friends ✓
                      </button>
                    ) : (
                      <button onClick={() => followUser(selectedUser)}
                        className="px-4 py-1.5 rounded-xl bg-[#0052FF] text-white text-xs font-black hover:bg-[#1652F0] transition-colors">
                        + Add Friend
                      </button>
                    )}
                    <button onClick={() => { setPendingDmTarget(selectedUser); setActiveTab('messages'); setSelectedUser(null) }}
                      className="px-4 py-1.5 rounded-xl bg-[#F0F4FF] text-[#0052FF] text-xs font-black hover:bg-[#E6EEFF] transition-colors">
                      💬 Message
                    </button>
                  </div>
                )}
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-[#F7F9FC] rounded-xl p-3 text-center border border-[#EEF1F5]">
                  <p className="text-xl font-black text-[#0052FF]">{posts.filter(p => p.author.toLowerCase() === selectedUser.toLowerCase()).length}</p>
                  <p className="text-[#5B6271] text-[10px] font-semibold">Posts</p>
                </div>
                <div className="bg-[#F7F9FC] rounded-xl p-3 text-center border border-[#EEF1F5]">
                  <p className="text-xl font-black text-[#0052FF]">{profiles[selectedUser.toLowerCase()]?.flames?.toString() ?? '0'}</p>
                  <p className="text-[#5B6271] text-[10px] font-semibold">🔥 Flames</p>
                </div>
                <div className="bg-[#F7F9FC] rounded-xl p-3 text-center border border-[#EEF1F5]">
                  <p className="text-xl font-black text-[#0052FF]">{parseFloat(formatEther(profiles[selectedUser.toLowerCase()]?.tips ?? 0n)).toFixed(3)}</p>
                  <p className="text-[#5B6271] text-[10px] font-semibold">💸 ETH</p>
                </div>
              </div>
              {/* User's posts */}
              <div className="space-y-3">
                {posts.filter(p => p.author.toLowerCase() === selectedUser.toLowerCase()).map(post => (
                  <div key={post.id.toString()} className="bg-[#F7F9FC] rounded-2xl p-4 border border-[#EEF1F5]">
                    {post.content && <p className="text-sm text-[#0A0B0D] mb-2">{post.content}</p>}
                    {post.ipfsHash && (post.ipfsHash.startsWith('vid_')
                      ? <video src={`https://gateway.pinata.cloud/ipfs/${post.ipfsHash.slice(4)}`} controls playsInline className="w-full max-h-40 bg-black rounded-xl mb-2" />
                      : <img src={`https://gateway.pinata.cloud/ipfs/${post.ipfsHash}`} className="w-full max-h-40 object-cover rounded-xl mb-2" alt="" />)}
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
