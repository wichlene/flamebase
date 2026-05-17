'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWriteContract, useReadContract, usePublicClient, useBalance, useSwitchChain, useChainId } from 'wagmi'
import { useState, useEffect, useCallback } from 'react'
import { parseEther, formatEther } from 'viem'
import { base } from 'wagmi/chains'
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/contract'
import { T, LANG_LABELS, type Lang } from '../lib/i18n'

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

type Tab = 'feed' | 'post' | 'leaderboard' | 'profile'

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
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

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

  const hasProfile = myProfile && myProfile[2]
  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase()
  const isWrongNetwork = isConnected && chainId !== base.id

  // Auto-switch to Base
  useEffect(() => {
    if (isConnected && chainId !== base.id) {
      switchChain({ chainId: base.id })
    }
  }, [isConnected, chainId, switchChain])

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
    if (!newPost || !postPrice) return
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
        args: [newPost, ipfsHash], value: postPrice as bigint,
      })
      setNewPost(''); setSelectedFile(null); setPreviewUrl(null)
      setTimeout(() => refetchCount(), 3000)
      setActiveTab('feed')
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const handleLike = async (postId: bigint) => {
    if (!isConnected || !likePrice) return
    setLoadingAction(`like-${postId}`)
    try {
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'like', args: [postId], value: likePrice as bigint })
      setPosts(prev => prev.map(p => p.id === postId ? { ...p, likes: p.likes + 1n } : p))
    } catch (e) { console.error(e) }
    setLoadingAction(null)
  }

  const handleComment = async (postId: bigint) => {
    const key = postId.toString()
    const text = commentTexts[key]
    if (!text || !commentPrice) return
    setLoadingAction(`comment-${postId}`)
    try {
      await writeContractAsync({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'comment', args: [postId, text], value: commentPrice as bigint })
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

  const navItems: { tab: Tab; icon: string; labelKey: string }[] = [
    { tab: 'feed', icon: '🏠', labelKey: 'navFeed' },
    { tab: 'post' as Tab, icon: '✏️', labelKey: 'navNewPost' },
    { tab: 'leaderboard' as Tab, icon: '🏆', labelKey: 'navLeaderboard' },
    { tab: 'profile' as Tab, icon: '👤', labelKey: 'navProfile' },
  ]

  return (
    <div className="min-h-screen bg-white text-[#0A0B0D] flex flex-col">
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
              <select value={lang} onChange={e => setLang(e.target.value as Lang)}
                className="bg-[#F7F9FC] border border-[#E4E7EB] rounded-lg px-2 py-1 text-xs text-[#5B6271] focus:outline-none focus:border-[#0052FF] cursor-pointer">
                {(Object.entries(LANG_LABELS) as [Lang, string][]).map(([code, label]) => (
                  <option key={code} value={code}>{label.split(' ')[0]}</option>
                ))}
              </select>
              <ConnectButton accountStatus="avatar" chainStatus="none" showBalance={false} />
            </div>
          </header>

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
                  <button onClick={() => setActiveTab('post')}
                    className="bg-[#0052FF] hover:bg-[#1652F0] text-white px-5 py-2 rounded-xl font-bold text-sm transition-colors shadow-sm">
                    {t('navNewPost')}
                  </button>
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

                {posts.map(post => {
                  const key = post.id.toString()
                  const comments = postComments[key] || []
                  const isLiking = loadingAction === `like-${post.id}`
                  const isTipping = loadingAction === `tip-${post.id}`
                  const isCommenting = loadingAction === `comment-${post.id}`

                  return (
                    <article key={key} className="border-b border-[#EEF1F5] hover:bg-[#FAFBFD] transition-colors">
                      <div className="p-4">
                        <div className="flex gap-3">
                          <Avatar addr={post.author} profiles={profiles} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-bold text-[#0A0B0D] text-[15px]">{getUsername(post.author)}</span>
                              <span className="text-[#8A919E] text-xs">{post.author.slice(0,6)}...{post.author.slice(-4)}</span>
                              <span className="text-[#8A919E] text-xs">·</span>
                              <span className="text-[#8A919E] text-xs">{timeAgo(post.timestamp)}</span>
                              <a href={`https://basescan.org/address/${post.author}`} target="_blank"
                                className="ml-auto text-[#8A919E] hover:text-[#0052FF] text-xs transition-colors">↗</a>
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
                                <span className="text-[11px] opacity-60 hidden sm:inline">{fmtPrice(likePrice)}</span>
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
                                    placeholder={replyingTo[key] ? t('replyPlaceholder', { user: replyingTo[key] }) : `${t('commentPlaceholder')} (${fmtPrice(commentPrice)} ETH)`}
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
                        <p className="text-xs text-[#5B6271]">{t('postFee')}: {fmtPrice(postPrice)} ETH</p>
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
                        <div className="-mt-12 mb-4">
                          <Avatar addr={address!} profiles={profiles} size="lg" />
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

                        <div className="space-y-2">
                          <a href={`https://basescan.org/address/${CONTRACT_ADDRESS}#writeContract`} target="_blank"
                            className="flex items-center justify-between bg-[#E6EEFF] border border-[#D6E2FF] text-[#0052FF] py-3 px-4 rounded-xl text-sm hover:bg-[#D6E2FF] transition-colors font-semibold">
                            <span>⚙️ {t('changePrices')}</span><span>↗</span>
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
    </div>
  )
}
