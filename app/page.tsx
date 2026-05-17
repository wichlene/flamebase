'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWriteContract, useReadContract, usePublicClient } from 'wagmi'
import { useState, useEffect, useCallback } from 'react'
import { parseEther, formatEther } from 'viem'
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/contract'

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

function Avatar({ addr, profiles, size = 'md' }: { addr: string; profiles: Record<string, ProfileData>; size?: 'sm' | 'md' | 'lg' }) {
  const p = profiles[addr.toLowerCase()]
  const avatarUrl = p?.avatarHash ? `https://gateway.pinata.cloud/ipfs/${p.avatarHash}` : null
  const dims = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-20 h-20 text-2xl' : 'w-10 h-10 text-sm'
  if (avatarUrl) {
    return <img src={avatarUrl} className={`${dims} rounded-full object-cover flex-shrink-0`} alt="avatar" />
  }
  return (
    <div className={`${dims} rounded-full bg-gradient-to-br from-[#0052FF] to-[#1652F0] flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {addr.slice(2, 4).toUpperCase()}
    </div>
  )
}

function ConnectPrompt({ message }: { message: string }) {
  return (
    <div className="bg-[#16181D] border border-[#2C2D33] rounded-2xl p-6 text-center">
      <div className="text-4xl mb-3">🔐</div>
      <p className="text-white font-semibold mb-1">Cüzdan Bağla</p>
      <p className="text-[#8A919E] text-sm mb-5">{message}</p>
      <div className="flex justify-center">
        <ConnectButton />
      </div>
    </div>
  )
}

export default function Home() {
  const { address, isConnected } = useAccount()
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

  const hasProfile = myProfile && myProfile[2]
  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase()
  const myUsername = myProfile?.[0] || address?.slice(0, 6) || ''

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
    if (d < 3600) return `${Math.floor(d / 60)}d`
    if (d < 86400) return `${Math.floor(d / 3600)}sa`
    return `${Math.floor(d / 86400)}g`
  }

  const fmtPrice = (p: unknown) => (typeof p === 'bigint' ? formatEther(p) : '...')

  const navItems: { tab: Tab; icon: string; label: string }[] = [
    { tab: 'feed', icon: '🏠', label: 'Feed' },
    { tab: 'post', icon: '✏️', label: 'Yeni Post' },
    { tab: 'leaderboard', icon: '🏆', label: 'Leaderboard' },
    { tab: 'profile', icon: '👤', label: 'Profil' },
  ]

  return (
    <div className="min-h-screen bg-[#0A0B0D] text-white flex">

      {/* ── Left Sidebar (desktop) ── */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-60 bg-[#0F1115] border-r border-[#1E2128] z-40 px-3 py-5">
        <div className="flex items-center gap-2.5 mb-8 px-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0052FF] to-[#1652F0] flex items-center justify-center text-lg">🔥</div>
          <span className="text-lg font-black text-white">FlameBase</span>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map(({ tab, icon, label }) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all text-left text-sm ${
                activeTab === tab
                  ? 'bg-[#0052FF]/15 text-[#4D8FFF] border border-[#0052FF]/30'
                  : 'text-[#8A919E] hover:bg-[#16181D] hover:text-white'
              }`}>
              <span className="text-xl">{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div className="border-t border-[#1E2128] pt-4 mt-4 space-y-3">
          {isConnected && address ? (
            <div className="flex items-center gap-2.5 px-2">
              <Avatar addr={address} profiles={profiles} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold truncate text-white">{myProfile?.[0] || 'Bağlandın'}</p>
                <p className="text-xs text-[#8A919E] truncate">{address.slice(0,6)}...{address.slice(-4)}</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-[#8A919E] px-2">Etkileşim için bağlan</p>
          )}
          <ConnectButton />
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 md:ml-60 xl:mr-72 min-h-screen">

        {/* Mobile header */}
        <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#0F1115]/95 backdrop-blur border-b border-[#1E2128] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0052FF] to-[#1652F0] flex items-center justify-center text-base">🔥</div>
            <span className="font-black text-base text-white">FlameBase</span>
          </div>
          <ConnectButton accountStatus="avatar" chainStatus="none" showBalance={false} />
        </header>

        <div className="pt-[60px] md:pt-0 pb-24 md:pb-10 max-w-2xl mx-auto">

          {/* ══ FEED ══ */}
          {activeTab === 'feed' && (
            <div>
              <div className="hidden md:flex items-center justify-between px-5 py-4 border-b border-[#1E2128] sticky top-0 bg-[#0A0B0D]/90 backdrop-blur z-10">
                <h1 className="text-lg font-black">Feed</h1>
                <button onClick={() => setActiveTab('post')}
                  className="bg-[#0052FF] hover:bg-[#1652F0] px-5 py-2 rounded-xl font-bold text-sm transition-colors">
                  + Yeni Post
                </button>
              </div>

              {!isConnected && (
                <div className="mx-4 mt-4 p-4 rounded-2xl bg-gradient-to-r from-[#0052FF]/10 to-[#1652F0]/10 border border-[#0052FF]/30 flex items-center gap-3">
                  <div className="text-2xl">👋</div>
                  <div className="flex-1">
                    <p className="font-bold text-white text-sm">FlameBase'e hoş geldin</p>
                    <p className="text-[#8A919E] text-xs">Gezinmek için cüzdana gerek yok. Etkileşim için bağlan.</p>
                  </div>
                  <ConnectButton accountStatus="avatar" chainStatus="none" showBalance={false} />
                </div>
              )}

              {posts.length === 0 && (
                <div className="text-center text-[#8A919E] mt-40 px-6">
                  <div className="text-7xl mb-4">🔥</div>
                  <p className="font-bold text-white text-xl">Henüz post yok</p>
                  <p className="text-sm mt-2">İlk alevi sen yak!</p>
                </div>
              )}

              {posts.map(post => {
                const key = post.id.toString()
                const comments = postComments[key] || []
                const isLiking = loadingAction === `like-${post.id}`
                const isTipping = loadingAction === `tip-${post.id}`
                const isCommenting = loadingAction === `comment-${post.id}`

                return (
                  <article key={key} className="border-b border-[#1E2128] hover:bg-[#0F1115] transition-colors">
                    <div className="p-4">
                      <div className="flex gap-3">
                        <div className="flex-shrink-0">
                          <Avatar addr={post.author} profiles={profiles} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-black text-white text-[15px]">{getUsername(post.author)}</span>
                            <span className="text-[#5B6271] text-xs">{post.author.slice(0,6)}...{post.author.slice(-4)}</span>
                            <span className="text-[#5B6271] text-xs">·</span>
                            <span className="text-[#8A919E] text-xs">{timeAgo(post.timestamp)}</span>
                            <a href={`https://basescan.org/address/${post.author}`} target="_blank"
                              className="ml-auto text-[#5B6271] hover:text-[#4D8FFF] text-xs transition-colors">↗</a>
                          </div>

                          {post.content && (
                            <p className="text-[#E5E7EB] text-[15px] leading-relaxed mb-3 whitespace-pre-wrap">{post.content}</p>
                          )}

                          {post.ipfsHash && (
                            <div className="rounded-2xl overflow-hidden mb-3 border border-[#1E2128]">
                              <img src={`https://gateway.pinata.cloud/ipfs/${post.ipfsHash}`}
                                className="w-full max-h-[520px] object-cover" alt="post" />
                            </div>
                          )}

                          <div className="flex items-center gap-0.5 -ml-2 mt-1">
                            <button onClick={() => handleLike(post.id)} disabled={isLiking || !isConnected}
                              title={!isConnected ? 'Cüzdan bağla' : ''}
                              className="flex items-center gap-1.5 text-[#8A919E] hover:text-[#FF6B35] hover:bg-[#FF6B35]/10 rounded-xl px-3 py-2 text-sm transition-all group disabled:opacity-50 disabled:hover:bg-transparent">
                              <span className="text-lg group-hover:scale-125 transition-transform">🔥</span>
                              <span className="font-bold">{post.likes.toString()}</span>
                              <span className="text-[11px] opacity-50 hidden sm:inline">{fmtPrice(likePrice)}</span>
                            </button>

                            <button onClick={() => toggleComments(key)}
                              className={`flex items-center gap-1.5 hover:bg-[#0052FF]/10 rounded-xl px-3 py-2 text-sm transition-all ${expandedComments[key] ? 'text-[#4D8FFF]' : 'text-[#8A919E] hover:text-[#4D8FFF]'}`}>
                              <span className="text-lg">💬</span>
                              <span className="font-bold">{comments.length > 0 ? comments.length : ''}</span>
                            </button>

                            <div className="flex items-center gap-1.5 ml-auto">
                              <input type="number" placeholder="ETH"
                                value={tipAmounts[key] || ''}
                                onChange={e => setTipAmounts(prev => ({ ...prev, [key]: e.target.value }))}
                                disabled={!isConnected}
                                className="w-20 bg-[#16181D] border border-[#2C2D33] rounded-xl px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-[#0052FF] placeholder-[#5B6271] disabled:opacity-50"
                                step="0.001" min="0.001" />
                              <button onClick={() => handleTip(post.id)} disabled={isTipping || !tipAmounts[key] || !isConnected}
                                title={!isConnected ? 'Cüzdan bağla' : ''}
                                className="bg-[#0052FF] hover:bg-[#1652F0] disabled:opacity-40 disabled:hover:bg-[#0052FF] px-3 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap">
                                {isTipping ? '...' : '💸 Tip'}
                              </button>
                            </div>
                          </div>

                          {post.tips > 0n && (
                            <p className="text-xs text-[#4D8FFF]/70 mt-0.5 ml-1">{parseFloat(formatEther(post.tips)).toFixed(4)} ETH tip toplamı</p>
                          )}
                        </div>
                      </div>

                      {expandedComments[key] && (
                        <div className="mt-4 ml-[52px] border-l-2 border-[#1E2128] pl-3 space-y-1">
                          {comments.length === 0 && (
                            <p className="text-[#5B6271] text-sm py-2">Henüz yorum yok. İlk sen yaz!</p>
                          )}
                          {comments.map((c, idx) => (
                            <div key={idx} className="flex items-start gap-2 py-2 px-2 hover:bg-[#16181D] rounded-xl transition-colors group">
                              <Avatar addr={c.commenter} profiles={profiles} size="sm" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="font-bold text-sm text-white">{getUsername(c.commenter)}</span>
                                  <span className="text-[#5B6271] text-xs">{timeAgo(c.timestamp)}</span>
                                </div>
                                <p className="text-[#E5E7EB] text-sm leading-relaxed">{c.text}</p>
                              </div>
                              {isConnected && (
                                <button onClick={() => setReply(key, c.commenter)}
                                  className="opacity-0 group-hover:opacity-100 text-[#8A919E] hover:text-[#4D8FFF] text-xs transition-all px-2 py-1 rounded-lg hover:bg-[#0052FF]/10 flex-shrink-0">
                                  Yanıtla
                                </button>
                              )}
                            </div>
                          ))}

                          {isConnected ? (
                            <div className="flex gap-2 pt-2">
                              <Avatar addr={address!} profiles={profiles} size="sm" />
                              <div className="flex-1 flex gap-2">
                                <input type="text"
                                  placeholder={replyingTo[key] ? `@${replyingTo[key]}'ya yanıtla...` : `Yorum yaz... (${fmtPrice(commentPrice)} ETH)`}
                                  value={commentTexts[key] || ''}
                                  onChange={e => setCommentTexts(prev => ({ ...prev, [key]: e.target.value }))}
                                  onKeyDown={e => e.key === 'Enter' && handleComment(post.id)}
                                  className="flex-1 bg-[#16181D] border border-[#2C2D33] rounded-xl px-3 py-2 text-sm text-white placeholder-[#5B6271] focus:outline-none focus:border-[#0052FF]"
                                />
                                <button onClick={() => handleComment(post.id)} disabled={isCommenting || !commentTexts[key]}
                                  className="bg-[#0052FF] hover:bg-[#1652F0] disabled:opacity-40 px-4 py-2 rounded-xl text-sm font-black transition-colors">
                                  {isCommenting ? '...' : '↑'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="pt-3 px-2">
                              <div className="flex items-center justify-between bg-[#16181D] border border-[#2C2D33] rounded-xl px-4 py-3">
                                <p className="text-[#8A919E] text-sm">Yorum yapmak için bağlan</p>
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
              <h1 className="text-xl font-black mb-5 hidden md:block">Yeni Post</h1>

              {!isConnected ? (
                <ConnectPrompt message="Post oluşturmak için cüzdanını bağla." />
              ) : !hasProfile ? (
                <div className="bg-[#16181D] border border-[#2C2D33] rounded-2xl p-6">
                  <div className="text-center mb-5">
                    <div className="text-5xl mb-3">🔥</div>
                    <h2 className="text-xl font-black text-white">Önce Profil Oluştur</h2>
                    <p className="text-[#8A919E] text-sm mt-2">Kullanıcı adı seç, post atmaya başla</p>
                  </div>
                  <input
                    type="text" placeholder="Kullanıcı adı" value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createProfile()}
                    className="w-full bg-[#0A0B0D] border border-[#2C2D33] rounded-xl px-4 py-3 mb-3 text-white placeholder-[#5B6271] focus:outline-none focus:border-[#0052FF]"
                  />
                  <button onClick={createProfile} disabled={loading || !newUsername}
                    className="w-full bg-[#0052FF] hover:bg-[#1652F0] py-3 rounded-xl font-black disabled:opacity-40 transition-colors">
                    {loading ? 'Oluşturuluyor...' : 'Profil Oluştur'}
                  </button>
                </div>
              ) : (
                <div className="bg-[#16181D] border border-[#2C2D33] rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-3 p-4 border-b border-[#1E2128]">
                    <Avatar addr={address!} profiles={profiles} />
                    <div>
                      <p className="font-black text-white">{myProfile?.[0]}</p>
                      <p className="text-xs text-[#8A919E]">Post ücreti: {fmtPrice(postPrice)} ETH</p>
                    </div>
                  </div>
                  <textarea placeholder="Bugün ne yanıyor? 🔥" value={newPost}
                    onChange={e => setNewPost(e.target.value)} rows={6}
                    className="w-full bg-transparent px-5 py-4 text-white placeholder-[#5B6271] resize-none focus:outline-none text-[16px] leading-relaxed" />
                  {previewUrl && (
                    <div className="relative mx-4 mb-4 rounded-2xl overflow-hidden border border-[#2C2D33]">
                      <img src={previewUrl} className="w-full max-h-80 object-cover" alt="preview" />
                      <button onClick={() => { setSelectedFile(null); setPreviewUrl(null) }}
                        className="absolute top-3 right-3 bg-black/80 backdrop-blur rounded-full w-8 h-8 flex items-center justify-center text-white text-sm hover:bg-black transition-colors">✕</button>
                    </div>
                  )}
                  <div className="flex items-center gap-3 px-4 py-3 border-t border-[#1E2128]">
                    <label className="cursor-pointer text-[#8A919E] hover:text-[#4D8FFF] transition-colors">
                      <span className="text-2xl">📷</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </label>
                    <span className="text-[#5B6271] text-xs flex-1">{newPost.length}/500</span>
                    <button onClick={createPost} disabled={loading || !newPost}
                      className="bg-[#0052FF] hover:bg-[#1652F0] px-8 py-2.5 rounded-xl font-black disabled:opacity-40 transition-colors">
                      {loading ? 'Gönderiliyor...' : 'Gönder'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ LEADERBOARD ══ */}
          {activeTab === 'leaderboard' && (
            <div>
              <div className="px-5 py-4 border-b border-[#1E2128] sticky top-0 bg-[#0A0B0D]/90 backdrop-blur z-10">
                <h1 className="text-lg font-black">🏆 Leaderboard</h1>
                <p className="text-[#8A919E] text-sm">Base'in en çok yananları</p>
              </div>
              {leaderboard.length === 0 ? (
                <div className="text-center text-[#8A919E] mt-32">
                  <p className="text-5xl mb-4">🏆</p>
                  <p>Henüz yeterli veri yok</p>
                </div>
              ) : (
                <div className="divide-y divide-[#1E2128]">
                  {leaderboard.map(({ address: addr, profile: p }, idx) => (
                    <div key={addr} className="flex items-center gap-4 px-5 py-4 hover:bg-[#0F1115] transition-colors">
                      <div className={`w-9 text-center font-black text-xl flex-shrink-0 ${
                        idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-600' : 'text-[#5B6271] text-base'
                      }`}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                      </div>
                      <Avatar addr={addr} profiles={profiles} />
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-white text-[15px]">{p.username}</p>
                        <p className="text-[#5B6271] text-xs">{addr.slice(0,6)}...{addr.slice(-4)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-[#4D8FFF] text-lg">{p.flames.toString()} 🔥</p>
                        {p.tips > 0n && (
                          <p className="text-[#5B6271] text-xs">{parseFloat(formatEther(p.tips)).toFixed(4)} ETH</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ PROFILE ══ */}
          {activeTab === 'profile' && (
            <div className="p-4 md:p-6 space-y-4">
              <h1 className="text-xl font-black hidden md:block">Profil</h1>

              {!isConnected ? (
                <ConnectPrompt message="Profilini görmek için cüzdanını bağla." />
              ) : !hasProfile ? (
                <div className="bg-[#16181D] border border-[#2C2D33] rounded-2xl p-6">
                  <div className="text-center mb-5">
                    <div className="text-5xl mb-3">🔥</div>
                    <h2 className="text-xl font-black text-white">Profil Oluştur</h2>
                    <p className="text-[#8A919E] text-sm mt-2">On-chain kimliğini oluştur</p>
                  </div>
                  <input
                    type="text" placeholder="Kullanıcı adı" value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createProfile()}
                    className="w-full bg-[#0A0B0D] border border-[#2C2D33] rounded-xl px-4 py-3 mb-3 text-white placeholder-[#5B6271] focus:outline-none focus:border-[#0052FF]"
                  />
                  <button onClick={createProfile} disabled={loading || !newUsername}
                    className="w-full bg-[#0052FF] hover:bg-[#1652F0] py-3 rounded-xl font-black disabled:opacity-40 transition-colors">
                    {loading ? 'Oluşturuluyor...' : 'Profil Oluştur'}
                  </button>
                </div>
              ) : myProfile ? (
                <>
                  <div className="bg-[#16181D] border border-[#2C2D33] rounded-2xl overflow-hidden">
                    <div className="h-28 bg-gradient-to-r from-[#0052FF]/40 via-[#1652F0]/30 to-[#0052FF]/40" />
                    <div className="px-6 pb-6">
                      <div className="-mt-12 mb-4">
                        <Avatar addr={address!} profiles={profiles} size="lg" />
                      </div>
                      <h2 className="text-2xl font-black text-white">{myProfile[0]}</h2>
                      <p className="text-[#8A919E] text-sm mb-5">{address?.slice(0,10)}...{address?.slice(-6)}</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#0A0B0D] rounded-xl p-4 text-center border border-[#1E2128]">
                          <p className="text-3xl font-black text-[#4D8FFF]">{myProfile[3].toString()}</p>
                          <p className="text-[#8A919E] text-sm mt-1">🔥 Flames</p>
                        </div>
                        <div className="bg-[#0A0B0D] rounded-xl p-4 text-center border border-[#1E2128]">
                          <p className="text-2xl font-black text-[#4D8FFF]">{parseFloat(formatEther(myProfile[4])).toFixed(4)}</p>
                          <p className="text-[#8A919E] text-sm mt-1">💸 ETH Kazandı</p>
                        </div>
                      </div>
                      <a href={`https://basescan.org/address/${address}`} target="_blank"
                        className="flex items-center justify-center gap-2 mt-4 text-[#8A919E] hover:text-[#4D8FFF] text-sm transition-colors">
                        Basescan'de Görüntüle ↗
                      </a>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="bg-[#16181D] border border-[#0052FF]/40 rounded-2xl p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <span>👑</span>
                        <p className="text-[#4D8FFF] font-black text-lg">Admin Paneli</p>
                      </div>
                      <p className="text-[#8A919E] text-xs mb-4">Tüm işlem ücretleri otomatik olarak cüzdanına geliyor.</p>
                      <div className="space-y-2">
                        <a href={`https://basescan.org/address/${CONTRACT_ADDRESS}#writeContract`} target="_blank"
                          className="flex items-center justify-between bg-[#0052FF]/10 border border-[#0052FF]/30 text-[#4D8FFF] py-3 px-4 rounded-xl text-sm hover:bg-[#0052FF]/20 transition-colors font-semibold">
                          <span>⚙️ Kontrat Fiyatlarını Değiştir</span><span>↗</span>
                        </a>
                        <a href={`https://basescan.org/address/${CONTRACT_ADDRESS}`} target="_blank"
                          className="flex items-center justify-between bg-[#0A0B0D] border border-[#1E2128] text-[#8A919E] py-3 px-4 rounded-xl text-sm hover:text-white transition-colors font-semibold">
                          <span>📊 Kontrat İstatistikleri</span><span>↗</span>
                        </a>
                      </div>
                      <div className="mt-4 p-3 bg-[#0A0B0D] rounded-xl border border-[#1E2128]">
                        <p className="text-[#5B6271] text-xs mb-1.5 font-semibold">Mevcut fiyatlar:</p>
                        <p className="text-[#8A919E] text-xs">📝 Post: {fmtPrice(postPrice)} ETH</p>
                        <p className="text-[#8A919E] text-xs">🔥 Like: {fmtPrice(likePrice)} ETH</p>
                        <p className="text-[#8A919E] text-xs">💬 Yorum: {fmtPrice(commentPrice)} ETH</p>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>
      </main>

      {/* ── Right Sidebar — Leaderboard preview (xl+) ── */}
      <aside className="hidden xl:flex flex-col fixed right-0 top-0 h-full w-72 bg-[#0F1115] border-l border-[#1E2128] z-40 px-4 py-6">
        <h2 className="text-base font-black mb-4 px-2 text-white">🏆 Top Flamers</h2>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {leaderboard.slice(0, 12).map(({ address: addr, profile: p }, idx) => (
            <button key={addr} onClick={() => setActiveTab('leaderboard')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#16181D] transition-colors text-left">
              <span className={`text-sm font-black w-5 text-center flex-shrink-0 ${
                idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-600' : 'text-[#5B6271]'
              }`}>{idx + 1}</span>
              <Avatar addr={addr} profiles={profiles} size="sm" />
              <p className="font-semibold text-sm text-white truncate flex-1">{p.username}</p>
              <p className="text-[#4D8FFF] text-sm font-black flex-shrink-0">{p.flames.toString()} 🔥</p>
            </button>
          ))}
          {leaderboard.length === 0 && <p className="text-[#5B6271] text-sm px-3">Henüz veri yok</p>}
        </div>
        <div className="border-t border-[#1E2128] pt-4 mt-4 space-y-1.5 px-2">
          <p className="text-[#5B6271] text-xs font-semibold mb-2">Güncel ücretler</p>
          <p className="text-[#8A919E] text-xs flex justify-between"><span>📝 Post</span><span className="text-white">{fmtPrice(postPrice)} ETH</span></p>
          <p className="text-[#8A919E] text-xs flex justify-between"><span>🔥 Like</span><span className="text-white">{fmtPrice(likePrice)} ETH</span></p>
          <p className="text-[#8A919E] text-xs flex justify-between"><span>💬 Yorum</span><span className="text-white">{fmtPrice(commentPrice)} ETH</span></p>
          <p className="text-[#8A919E] text-xs flex justify-between"><span>💸 Tip</span><span className="text-white">serbest</span></p>
        </div>
      </aside>

      {/* ── Mobile bottom nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0F1115]/95 backdrop-blur border-t border-[#1E2128] z-50">
        <div className="flex">
          {navItems.map(({ tab, icon, label }) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition-colors ${activeTab === tab ? 'text-[#4D8FFF]' : 'text-[#5B6271]'}`}>
              <span className="text-xl">{icon}</span>
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
