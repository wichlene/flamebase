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
  const dims = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-16 h-16 text-2xl' : 'w-10 h-10 text-sm'
  if (avatarUrl) {
    return <img src={avatarUrl} className={`${dims} rounded-full object-cover ring-2 ring-orange-500/30 flex-shrink-0`} alt="avatar" />
  }
  return (
    <div className={`${dims} rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center font-bold text-white flex-shrink-0`}>
      {addr.slice(2, 4).toUpperCase()}
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
    if (!likePrice) return
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
    const prefix = `@${uname} `
    setReplyingTo(prev => ({ ...prev, [postId]: uname }))
    setCommentTexts(prev => ({ ...prev, [postId]: prefix }))
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

  // ── Not connected ──
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center">
        <div className="text-center px-6 max-w-md">
          <div className="text-[90px] mb-6 leading-none">🔥</div>
          <h1 className="text-5xl font-black mb-3 bg-gradient-to-r from-orange-400 via-red-500 to-rose-500 bg-clip-text text-transparent">FlameBase</h1>
          <p className="text-gray-400 text-lg mb-1">On-chain social on Base.</p>
          <p className="text-gray-600 text-sm mb-10">Her like, yorum ve tip gerçek bir işlem.</p>
          <ConnectButton />
        </div>
      </div>
    )
  }

  // ── No profile ──
  if (!hasProfile) {
    return (
      <div className="min-h-screen bg-[#070707] flex items-center justify-center">
        <div className="w-full max-w-sm mx-4 bg-[#111] border border-[#1e1e1e] rounded-3xl p-8">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🔥</div>
            <h2 className="text-2xl font-black text-white">FlameBase'e Katıl</h2>
            <p className="text-gray-500 text-sm mt-2">On-chain kimliğini oluştur</p>
          </div>
          <input
            type="text" placeholder="Kullanıcı adı seç" value={newUsername}
            onChange={e => setNewUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createProfile()}
            className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl px-4 py-4 mb-4 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500 text-lg"
          />
          <button onClick={createProfile} disabled={loading || !newUsername}
            className="w-full bg-gradient-to-r from-orange-500 to-red-600 py-4 rounded-2xl font-black text-lg disabled:opacity-40 hover:opacity-90 transition-opacity">
            {loading ? 'Oluşturuluyor...' : '🔥 Profil Oluştur'}
          </button>
        </div>
      </div>
    )
  }

  const navItems: { tab: Tab; icon: string; label: string }[] = [
    { tab: 'feed', icon: '🏠', label: 'Feed' },
    { tab: 'post', icon: '✏️', label: 'Yeni Post' },
    { tab: 'leaderboard', icon: '🏆', label: 'Leaderboard' },
    { tab: 'profile', icon: '👤', label: 'Profil' },
  ]

  return (
    <div className="min-h-screen bg-[#070707] text-white flex">

      {/* ── Left Sidebar (desktop) ── */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full w-60 bg-[#0b0b0b] border-r border-[#161616] z-40 px-3 py-5">
        <div className="flex items-center gap-2.5 mb-8 px-3">
          <span className="text-3xl">🔥</span>
          <span className="text-xl font-black bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">FlameBase</span>
        </div>
        <nav className="flex-1 space-y-1">
          {navItems.map(({ tab, icon, label }) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl font-semibold transition-all text-left text-sm ${
                activeTab === tab ? 'bg-orange-500/20 text-orange-400 border border-orange-500/20' : 'text-gray-500 hover:bg-[#161616] hover:text-white'
              }`}>
              <span className="text-xl">{icon}</span>{label}
            </button>
          ))}
        </nav>
        <div className="border-t border-[#161616] pt-4 mt-4 space-y-3">
          <div className="flex items-center gap-2.5 px-2">
            <Avatar addr={address!} profiles={profiles} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate text-orange-400">{myProfile?.[0]}</p>
              <p className="text-xs text-gray-600 truncate">{address?.slice(0,6)}...{address?.slice(-4)}</p>
            </div>
          </div>
          <ConnectButton />
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 md:ml-60 xl:mr-72 min-h-screen">

        {/* Mobile header */}
        <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#0b0b0b]/95 backdrop-blur border-b border-[#161616] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <span className="font-black text-lg bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">FlameBase</span>
          </div>
          <ConnectButton />
        </header>

        <div className="pt-[60px] md:pt-0 pb-24 md:pb-10 max-w-2xl mx-auto">

          {/* ══ FEED ══ */}
          {activeTab === 'feed' && (
            <div>
              <div className="hidden md:flex items-center justify-between px-5 py-4 border-b border-[#161616] sticky top-0 bg-[#070707]/90 backdrop-blur z-10">
                <h1 className="text-lg font-black">Feed</h1>
                <button onClick={() => setActiveTab('post')}
                  className="bg-gradient-to-r from-orange-500 to-red-600 px-5 py-2 rounded-xl font-bold text-sm hover:opacity-90 transition-opacity">
                  + Yeni Post
                </button>
              </div>

              {posts.length === 0 && (
                <div className="text-center text-gray-600 mt-40 px-6">
                  <div className="text-7xl mb-4">🔥</div>
                  <p className="font-bold text-gray-400 text-xl">Henüz post yok</p>
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
                  <article key={key} className="border-b border-[#101010] hover:bg-[#0c0c0c] transition-colors">
                    <div className="p-4">
                      <div className="flex gap-3">
                        <div className="flex-shrink-0">
                          <Avatar addr={post.author} profiles={profiles} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-black text-white text-[15px]">{getUsername(post.author)}</span>
                            <span className="text-gray-700 text-xs">{post.author.slice(0,6)}...{post.author.slice(-4)}</span>
                            <span className="text-gray-700 text-xs">·</span>
                            <span className="text-gray-600 text-xs">{timeAgo(post.timestamp)}</span>
                            <a href={`https://basescan.org/tx/${post.author}`} target="_blank"
                              className="ml-auto text-gray-700 hover:text-orange-400 text-xs transition-colors">↗</a>
                          </div>

                          {post.content && (
                            <p className="text-gray-100 text-[15px] leading-relaxed mb-3 whitespace-pre-wrap">{post.content}</p>
                          )}

                          {post.ipfsHash && (
                            <div className="rounded-2xl overflow-hidden mb-3 border border-[#1a1a1a]">
                              <img src={`https://gateway.pinata.cloud/ipfs/${post.ipfsHash}`}
                                className="w-full max-h-[520px] object-cover" alt="post" />
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex items-center gap-0.5 -ml-2 mt-1">
                            <button onClick={() => handleLike(post.id)} disabled={isLiking}
                              className="flex items-center gap-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl px-3 py-2 text-sm transition-all group">
                              <span className="text-lg group-hover:scale-125 transition-transform">🔥</span>
                              <span className="font-bold">{post.likes.toString()}</span>
                              <span className="text-[11px] opacity-50">{fmtPrice(likePrice)}</span>
                            </button>

                            <button onClick={() => toggleComments(key)}
                              className={`flex items-center gap-1.5 hover:bg-blue-400/10 rounded-xl px-3 py-2 text-sm transition-all ${expandedComments[key] ? 'text-blue-400' : 'text-gray-500 hover:text-blue-400'}`}>
                              <span className="text-lg">💬</span>
                              <span className="font-bold">{comments.length > 0 ? comments.length : ''}</span>
                            </button>

                            <div className="flex items-center gap-1.5 ml-auto">
                              <input type="number" placeholder="ETH"
                                value={tipAmounts[key] || ''}
                                onChange={e => setTipAmounts(prev => ({ ...prev, [key]: e.target.value }))}
                                className="w-20 bg-[#131313] border border-[#202020] rounded-xl px-2 py-1.5 text-xs text-white text-center focus:outline-none focus:border-orange-500 placeholder-gray-700"
                                step="0.001" min="0.001" />
                              <button onClick={() => handleTip(post.id)} disabled={isTipping || !tipAmounts[key]}
                                className="bg-gradient-to-r from-orange-500 to-red-600 hover:opacity-90 disabled:opacity-40 px-3 py-1.5 rounded-xl text-xs font-black transition-all whitespace-nowrap">
                                {isTipping ? '...' : '💸 Tip'}
                              </button>
                            </div>
                          </div>

                          {post.tips > 0n && (
                            <p className="text-xs text-orange-400/50 mt-0.5 ml-1">{parseFloat(formatEther(post.tips)).toFixed(4)} ETH tip toplamı</p>
                          )}
                        </div>
                      </div>

                      {/* Comments */}
                      {expandedComments[key] && (
                        <div className="mt-4 ml-[52px] border-l-2 border-[#161616] pl-3 space-y-1">
                          {comments.length === 0 && (
                            <p className="text-gray-600 text-sm py-2">Henüz yorum yok. İlk sen yaz!</p>
                          )}
                          {comments.map((c, idx) => (
                            <div key={idx} className="flex items-start gap-2 py-2 px-2 hover:bg-[#0f0f0f] rounded-xl transition-colors group">
                              <Avatar addr={c.commenter} profiles={profiles} size="sm" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="font-bold text-sm text-white">{getUsername(c.commenter)}</span>
                                  <span className="text-gray-700 text-xs">{timeAgo(c.timestamp)}</span>
                                </div>
                                <p className="text-gray-300 text-sm leading-relaxed">{c.text}</p>
                              </div>
                              <button onClick={() => setReply(key, c.commenter)}
                                className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-orange-400 text-xs transition-all px-2 py-1 rounded-lg hover:bg-orange-400/10 flex-shrink-0">
                                Yanıtla
                              </button>
                            </div>
                          ))}

                          <div className="flex gap-2 pt-2">
                            <Avatar addr={address!} profiles={profiles} size="sm" />
                            <div className="flex-1 flex gap-2">
                              <input type="text"
                                placeholder={replyingTo[key] ? `@${replyingTo[key]}'ya yanıtla...` : `${myUsername} olarak yorum yap... (${fmtPrice(commentPrice)} ETH)`}
                                value={commentTexts[key] || ''}
                                onChange={e => setCommentTexts(prev => ({ ...prev, [key]: e.target.value }))}
                                onKeyDown={e => e.key === 'Enter' && handleComment(post.id)}
                                className="flex-1 bg-[#131313] border border-[#1e1e1e] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500"
                              />
                              <button onClick={() => handleComment(post.id)} disabled={isCommenting || !commentTexts[key]}
                                className="bg-orange-500 hover:bg-orange-600 disabled:opacity-40 px-4 py-2 rounded-xl text-sm font-black transition-colors">
                                {isCommenting ? '...' : '↑'}
                              </button>
                            </div>
                          </div>
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
              <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-3xl overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b border-[#161616]">
                  <Avatar addr={address!} profiles={profiles} />
                  <div>
                    <p className="font-black text-orange-400">{myProfile?.[0]}</p>
                    <p className="text-xs text-gray-600">Post ücreti: {fmtPrice(postPrice)} ETH</p>
                  </div>
                </div>
                <textarea placeholder="Bugün ne yanıyor? 🔥" value={newPost}
                  onChange={e => setNewPost(e.target.value)} rows={6}
                  className="w-full bg-transparent px-5 py-4 text-white placeholder-gray-600 resize-none focus:outline-none text-[16px] leading-relaxed" />
                {previewUrl && (
                  <div className="relative mx-4 mb-4 rounded-2xl overflow-hidden border border-[#222]">
                    <img src={previewUrl} className="w-full max-h-80 object-cover" alt="preview" />
                    <button onClick={() => { setSelectedFile(null); setPreviewUrl(null) }}
                      className="absolute top-3 right-3 bg-black/80 backdrop-blur rounded-full w-8 h-8 flex items-center justify-center text-white text-sm hover:bg-black transition-colors">✕</button>
                  </div>
                )}
                <div className="flex items-center gap-3 px-4 py-3 border-t border-[#161616]">
                  <label className="cursor-pointer text-gray-500 hover:text-orange-400 transition-colors">
                    <span className="text-2xl">📷</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                  </label>
                  <span className="text-gray-700 text-xs flex-1">{newPost.length}/500</span>
                  <button onClick={createPost} disabled={loading || !newPost}
                    className="bg-gradient-to-r from-orange-500 to-red-600 px-8 py-2.5 rounded-2xl font-black disabled:opacity-40 hover:opacity-90 transition-opacity">
                    {loading ? 'Gönderiliyor...' : '🔥 Gönder'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ══ LEADERBOARD ══ */}
          {activeTab === 'leaderboard' && (
            <div>
              <div className="px-5 py-4 border-b border-[#161616] sticky top-0 bg-[#070707]/90 backdrop-blur z-10">
                <h1 className="text-lg font-black">🏆 Leaderboard</h1>
                <p className="text-gray-500 text-sm">Base'in en çok yananları</p>
              </div>
              {leaderboard.length === 0 ? (
                <div className="text-center text-gray-600 mt-32">
                  <p className="text-5xl mb-4">🏆</p>
                  <p>Henüz yeterli veri yok</p>
                </div>
              ) : (
                <div className="divide-y divide-[#0f0f0f]">
                  {leaderboard.map(({ address: addr, profile: p }, idx) => (
                    <div key={addr} className="flex items-center gap-4 px-5 py-4 hover:bg-[#0c0c0c] transition-colors">
                      <div className={`w-9 text-center font-black text-xl flex-shrink-0 ${
                        idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-600' : 'text-gray-600 text-base'
                      }`}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`}
                      </div>
                      <Avatar addr={addr} profiles={profiles} />
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-white text-[15px]">{p.username}</p>
                        <p className="text-gray-600 text-xs">{addr.slice(0,6)}...{addr.slice(-4)}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-black text-orange-400 text-lg">{p.flames.toString()} 🔥</p>
                        {p.tips > 0n && (
                          <p className="text-gray-600 text-xs">{parseFloat(formatEther(p.tips)).toFixed(4)} ETH</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ PROFILE ══ */}
          {activeTab === 'profile' && myProfile && (
            <div className="p-4 md:p-6 space-y-4">
              <h1 className="text-xl font-black hidden md:block">Profil</h1>

              <div className="bg-[#0f0f0f] border border-[#1a1a1a] rounded-3xl overflow-hidden">
                <div className="h-28 bg-gradient-to-r from-orange-600/30 via-red-500/20 to-rose-600/30" />
                <div className="px-6 pb-6">
                  <div className="-mt-10 mb-4">
                    <Avatar addr={address!} profiles={profiles} size="lg" />
                  </div>
                  <h2 className="text-2xl font-black text-white">{myProfile[0]}</h2>
                  <p className="text-gray-500 text-sm mb-5">{address?.slice(0,10)}...{address?.slice(-6)}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#0a0a0a] rounded-2xl p-4 text-center border border-[#161616]">
                      <p className="text-3xl font-black text-orange-400">{myProfile[3].toString()}</p>
                      <p className="text-gray-500 text-sm mt-1">🔥 Flames</p>
                    </div>
                    <div className="bg-[#0a0a0a] rounded-2xl p-4 text-center border border-[#161616]">
                      <p className="text-2xl font-black text-orange-400">{parseFloat(formatEther(myProfile[4])).toFixed(4)}</p>
                      <p className="text-gray-500 text-sm mt-1">💸 ETH Kazandı</p>
                    </div>
                  </div>
                  <a href={`https://basescan.org/address/${address}`} target="_blank"
                    className="flex items-center justify-center gap-2 mt-4 text-gray-600 hover:text-orange-400 text-sm transition-colors">
                    Basescan'de Görüntüle ↗
                  </a>
                </div>
              </div>

              {isAdmin && (
                <div className="bg-[#0f0f0f] border border-orange-500/30 rounded-3xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span>👑</span>
                    <p className="text-orange-400 font-black text-lg">Admin Paneli</p>
                  </div>
                  <p className="text-gray-500 text-xs mb-4">Tüm işlem ücretleri otomatik olarak cüzdanına geliyor.</p>
                  <div className="space-y-2">
                    <a href={`https://basescan.org/address/${CONTRACT_ADDRESS}#writeContract`} target="_blank"
                      className="flex items-center justify-between bg-orange-500/10 border border-orange-500/20 text-orange-400 py-3 px-4 rounded-2xl text-sm hover:bg-orange-500/20 transition-colors font-semibold">
                      <span>⚙️ Kontrat Fiyatlarını Değiştir</span><span>↗</span>
                    </a>
                    <a href={`https://basescan.org/address/${CONTRACT_ADDRESS}`} target="_blank"
                      className="flex items-center justify-between bg-[#0a0a0a] border border-[#1a1a1a] text-gray-400 py-3 px-4 rounded-2xl text-sm hover:text-white transition-colors font-semibold">
                      <span>📊 Kontrat İstatistikleri</span><span>↗</span>
                    </a>
                  </div>
                  <div className="mt-4 p-3 bg-[#0a0a0a] rounded-xl border border-[#161616]">
                    <p className="text-gray-600 text-xs mb-1.5 font-semibold">Mevcut fiyatlar:</p>
                    <p className="text-gray-500 text-xs">📝 Post: {fmtPrice(postPrice)} ETH</p>
                    <p className="text-gray-500 text-xs">🔥 Like: {fmtPrice(likePrice)} ETH</p>
                    <p className="text-gray-500 text-xs">💬 Yorum: {fmtPrice(commentPrice)} ETH</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── Right Sidebar — Leaderboard preview (xl+) ── */}
      <aside className="hidden xl:flex flex-col fixed right-0 top-0 h-full w-72 bg-[#0b0b0b] border-l border-[#161616] z-40 px-4 py-6">
        <h2 className="text-base font-black mb-4 px-2">🏆 Top Flamers</h2>
        <div className="flex-1 space-y-1 overflow-y-auto">
          {leaderboard.slice(0, 12).map(({ address: addr, profile: p }, idx) => (
            <button key={addr} onClick={() => setActiveTab('leaderboard')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-[#161616] transition-colors text-left">
              <span className={`text-sm font-black w-5 text-center flex-shrink-0 ${
                idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-gray-300' : idx === 2 ? 'text-orange-600' : 'text-gray-600'
              }`}>{idx + 1}</span>
              <Avatar addr={addr} profiles={profiles} size="sm" />
              <p className="font-semibold text-sm text-white truncate flex-1">{p.username}</p>
              <p className="text-orange-400 text-sm font-black flex-shrink-0">{p.flames.toString()} 🔥</p>
            </button>
          ))}
          {leaderboard.length === 0 && <p className="text-gray-600 text-sm px-3">Henüz veri yok</p>}
        </div>
        <div className="border-t border-[#161616] pt-4 mt-4 space-y-1.5 px-2">
          <p className="text-gray-600 text-xs font-semibold mb-2">Güncel ücretler</p>
          <p className="text-gray-500 text-xs flex justify-between"><span>📝 Post</span><span className="text-gray-400">{fmtPrice(postPrice)} ETH</span></p>
          <p className="text-gray-500 text-xs flex justify-between"><span>🔥 Like</span><span className="text-gray-400">{fmtPrice(likePrice)} ETH</span></p>
          <p className="text-gray-500 text-xs flex justify-between"><span>💬 Yorum</span><span className="text-gray-400">{fmtPrice(commentPrice)} ETH</span></p>
          <p className="text-gray-500 text-xs flex justify-between"><span>💸 Tip</span><span className="text-gray-400">serbest</span></p>
        </div>
      </aside>

      {/* ── Mobile bottom nav ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0b0b0b]/95 backdrop-blur border-t border-[#161616] z-50">
        <div className="flex">
          {navItems.map(({ tab, icon, label }) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 flex flex-col items-center gap-0.5 transition-colors ${activeTab === tab ? 'text-orange-400' : 'text-gray-700'}`}>
              <span className="text-xl">{icon}</span>
              <span className="text-[10px] font-semibold">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
