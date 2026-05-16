'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWriteContract, useReadContract, usePublicClient } from 'wagmi'
import { useState, useEffect } from 'react'
import { parseEther, formatEther } from 'viem'
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../lib/contract'

const ADMIN_ADDRESS = '0xa77A5D4D37d6F39C20C2441295da9fA60Ab9fD69'
const LIKE_PRICE = '0.0001'
const COMMENT_PRICE = '0.0003'
const POST_PRICE = '0.0002'

interface Post {
  id: bigint
  author: string
  content: string
  ipfsHash: string
  timestamp: bigint
  likes: bigint
  tips: bigint
}

export default function Home() {
  const { address, isConnected } = useAccount()
  const [activeTab, setActiveTab] = useState<'feed' | 'post' | 'profile'>('feed')
  const [posts, setPosts] = useState<Post[]>([])
  const [newPost, setNewPost] = useState('')
  const [username, setUsername] = useState('')
  const [tipAmount, setTipAmount] = useState('0.001')
  const [commentText, setCommentText] = useState<{[key: string]: string}>({})
  const [showComment, setShowComment] = useState<{[key: string]: boolean}>({})
  const [loading, setLoading] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const { data: profile, refetch: refetchProfile } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'profiles',
    args: address ? [address] : undefined,
    query: { enabled: !!address }
  })

  const { data: postCount, refetch: refetchCount } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'postCount',
  })

  const hasProfile = profile && profile[2]
  const isAdmin = address?.toLowerCase() === ADMIN_ADDRESS.toLowerCase()

  useEffect(() => {
    if (!postCount || !publicClient) return
    const fetchPosts = async () => {
      const count = Number(postCount)
      const fetched: Post[] = []
      for (let i = count - 1; i >= Math.max(0, count - 20); i--) {
        try {
          const post = await publicClient.readContract({
            address: CONTRACT_ADDRESS,
            abi: CONTRACT_ABI,
            functionName: 'getPost',
            args: [BigInt(i)],
          }) as Post
          fetched.push(post)
        } catch (e) {}
      }
      setPosts(fetched)
    }
    fetchPosts()
  }, [postCount, publicClient])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null
    setSelectedFile(file)
    if (file) setPreviewUrl(URL.createObjectURL(file))
    else setPreviewUrl(null)
  }

  const createProfile = async () => {
    if (!username) return
    setLoading(true)
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'createProfile',
        args: [username, ''],
      })
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
        const formData = new FormData()
        formData.append('file', selectedFile)
        const res = await fetch('/api/upload', { method: 'POST', body: formData })
        const data = await res.json()
        ipfsHash = data.ipfsHash || ''
      }
      await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'createPost',
        args: [newPost, ipfsHash],
        value: parseEther(POST_PRICE),
      })
      setNewPost('')
      setSelectedFile(null)
      setPreviewUrl(null)
      setTimeout(() => refetchCount(), 3000)
      setActiveTab('feed')
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const handleLike = async (postId: bigint) => {
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'like',
        args: [postId],
        value: parseEther(LIKE_PRICE),
      })
    } catch (e) { console.error(e) }
  }

  const handleComment = async (postId: bigint) => {
    const text = commentText[postId.toString()]
    if (!text) return
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'comment',
        args: [postId, text],
        value: parseEther(COMMENT_PRICE),
      })
      setCommentText(prev => ({...prev, [postId.toString()]: ''}))
      setShowComment(prev => ({...prev, [postId.toString()]: false}))
    } catch (e) { console.error(e) }
  }

  const handleTip = async (postId: bigint) => {
    if (!tipAmount || parseFloat(tipAmount) <= 0) return
    try {
      await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'tip',
        args: [postId],
        value: parseEther(tipAmount),
      })
    } catch (e) { console.error(e) }
  }

  const timeAgo = (timestamp: bigint) => {
    const diff = Date.now() / 1000 - Number(timestamp)
    if (diff < 60) return `${Math.floor(diff)}s`
    if (diff < 3600) return `${Math.floor(diff/60)}m`
    if (diff < 86400) return `${Math.floor(diff/3600)}h`
    return `${Math.floor(diff/86400)}d`
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a0a0a]/95 backdrop-blur border-b border-[#1a1a1a] px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <span className="text-lg font-bold bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">FlameBase</span>
          </div>
          <ConnectButton />
        </div>
      </header>

      <div className="max-w-lg mx-auto pt-16 pb-24 px-0">
        {!isConnected ? (
          <div className="text-center mt-32 px-6">
            <div className="text-8xl mb-6">🔥</div>
            <h1 className="text-4xl font-bold mb-2">
              <span className="bg-gradient-to-r from-orange-400 to-red-500 bg-clip-text text-transparent">FlameBase</span>
            </h1>
            <p className="text-gray-500 mb-2">On-chain social on Base.</p>
            <p className="text-gray-600 text-sm mb-10">Every post, like and tip is a real transaction.</p>
            <ConnectButton />
          </div>
        ) : !hasProfile ? (
          <div className="mt-32 mx-4 bg-[#111] border border-[#222] rounded-2xl p-6">
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">🔥</div>
              <h2 className="text-xl font-bold text-white">Welcome to FlameBase</h2>
              <p className="text-gray-500 text-sm mt-1">Create your on-chain profile</p>
            </div>
            <input type="text" placeholder="Choose a username" value={username} onChange={(e) => setUsername(e.target.value)} className="w-full bg-[#0a0a0a] border border-[#333] rounded-xl px-4 py-3 mb-3 text-white placeholder-gray-600 focus:outline-none focus:border-orange-500" />
            <button onClick={createProfile} disabled={loading || !username} className="w-full bg-gradient-to-r from-orange-500 to-red-500 py-3 rounded-xl font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity">
              {loading ? 'Creating...' : 'Create Profile'}
            </button>
          </div>
        ) : (
          <>
            {activeTab === 'feed' && (
              <div className="space-y-0">
                {posts.length === 0 && (
                  <div className="text-center text-gray-600 mt-32 px-6">
                    <div className="text-5xl mb-4">🔥</div>
                    <p className="font-semibold">No posts yet</p>
                    <p className="text-sm mt-1">Be the first to post!</p>
                  </div>
                )}
                {posts.map((post) => (
                  <div key={post.id.toString()} className="border-b border-[#1a1a1a]">
                    <div className="flex items-center gap-3 px-4 pt-4 pb-2">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-sm font-bold">
                        {post.author.slice(2,4).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{post.author.slice(0,6)}...{post.author.slice(-4)}</p>
                        <p className="text-gray-600 text-xs">{timeAgo(post.timestamp)}</p>
                      </div>
                      <a href={`https://basescan.org/address/${post.author}`} target="_blank" className="text-gray-700 hover:text-orange-400 text-xs transition-colors">↗</a>
                    </div>
                    {post.content && (
                      <p className="px-4 pb-3 text-[15px] leading-relaxed text-gray-100">{post.content}</p>
                    )}
                    {post.ipfsHash && (
                      <img src={`https://gateway.pinata.cloud/ipfs/${post.ipfsHash}`} className="w-full max-h-96 object-cover" alt="post" />
                    )}
                    <div className="px-4 py-3 flex items-center gap-4">
                      <button onClick={() => handleLike(post.id)} className="flex items-center gap-1.5 text-gray-500 hover:text-red-400 transition-colors text-sm">
                        <span>❤️</span>
                        <span>{post.likes.toString()}</span>
                      </button>
                      <button onClick={() => setShowComment(prev => ({...prev, [post.id.toString()]: !prev[post.id.toString()]}))} className="flex items-center gap-1.5 text-gray-500 hover:text-blue-400 transition-colors text-sm">
                        <span>💬</span>
                      </button>
                      <div className="flex items-center gap-2 ml-auto">
                        <span className="text-gray-600 text-xs">ETH</span>
                        <input type="number" value={tipAmount} onChange={(e) => setTipAmount(e.target.value)} className="w-16 bg-[#111] border border-[#333] rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-orange-500" step="0.001" min="0.001" />
                        <button onClick={() => handleTip(post.id)} className="bg-gradient-to-r from-orange-500 to-red-500 px-3 py-1 rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity">💸 Tip</button>
                      </div>
                    </div>
                    {showComment[post.id.toString()] && (
                      <div className="px-4 pb-3 flex gap-2">
                        <input type="text" placeholder="Add a comment..." value={commentText[post.id.toString()] || ''} onChange={(e) => setCommentText(prev => ({...prev, [post.id.toString()]: e.target.value}))} className="flex-1 bg-[#111] border border-[#333] rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-orange-500" />
                        <button onClick={() => handleComment(post.id)} className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-xl text-sm font-semibold transition-colors">Send</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'post' && (
              <div className="px-4 mt-4">
                <div className="bg-[#111] border border-[#222] rounded-2xl overflow-hidden">
                  <div className="flex items-center gap-3 p-4 border-b border-[#1a1a1a]">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-sm font-bold">
                      {address?.slice(2,4).toUpperCase()}
                    </div>
                    <span className="text-orange-400 font-semibold text-sm">{profile[0]}</span>
                    <span className="ml-auto text-gray-600 text-xs">0.0002 ETH</span>
                  </div>
                  <textarea placeholder="What's on your mind?" value={newPost} onChange={(e) => setNewPost(e.target.value)} rows={5} className="w-full bg-transparent px-4 py-3 text-white placeholder-gray-600 resize-none focus:outline-none text-[15px]" />
                  {previewUrl && (
                    <div className="relative">
                      <img src={previewUrl} className="w-full max-h-64 object-cover" alt="preview" />
                      <button onClick={() => { setSelectedFile(null); setPreviewUrl(null) }} className="absolute top-2 right-2 bg-black/70 rounded-full w-7 h-7 flex items-center justify-center text-white text-sm">✕</button>
                    </div>
                  )}
                  <div className="flex items-center gap-3 px-4 py-3 border-t border-[#1a1a1a]">
                    <label className="cursor-pointer text-gray-500 hover:text-orange-400 transition-colors">
                      <span className="text-xl">📸</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    </label>
                    <button onClick={createPost} disabled={loading || !newPost} className="ml-auto bg-gradient-to-r from-orange-500 to-red-500 px-6 py-2 rounded-xl font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity text-sm">
                      {loading ? 'Posting...' : '🔥 Post'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'profile' && (
              <div className="px-4 mt-4 space-y-4">
                <div className="bg-[#111] border border-[#222] rounded-2xl p-6">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-2xl font-bold">
                      {address?.slice(2,4).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">{profile[0]}</h2>
                      <p className="text-gray-500 text-sm">{address?.slice(0,6)}...{address?.slice(-4)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-[#0a0a0a] rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-orange-400">{profile[3].toString()}</p>
                      <p className="text-gray-500 text-sm">Flames</p>
                    </div>
                    <div className="bg-[#0a0a0a] rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-orange-400">{parseFloat(formatEther(profile[4])).toFixed(4)}</p>
                      <p className="text-gray-500 text-sm">ETH earned</p>
                    </div>
                  </div>
                  <a href={`https://basescan.org/address/${address}`} target="_blank" className="flex items-center justify-center gap-2 text-gray-500 hover:text-orange-400 text-sm transition-colors">View on Basescan ↗</a>
                </div>

                {isAdmin && (
                  <div className="bg-[#111] border border-orange-500/30 rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span>👑</span>
                      <p className="text-orange-400 font-semibold">Admin Panel</p>
                    </div>
                    <p className="text-gray-500 text-xs mb-3">Tüm işlem ücretleri otomatik olarak cüzdanına geliyor.</p>
                    <a href={`https://basescan.org/address/${CONTRACT_ADDRESS}`} target="_blank" className="flex items-center justify-center gap-2 bg-orange-500/10 border border-orange-500/30 text-orange-400 py-2 rounded-xl text-sm hover:bg-orange-500/20 transition-colors">📊 Kontrat İstatistikleri ↗</a>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {isConnected && hasProfile && (
        <nav className="fixed bottom-0 left-0 right-0 bg-[#0a0a0a]/95 backdrop-blur border-t border-[#1a1a1a]">
          <div className="max-w-lg mx-auto flex">
            <button onClick={() => setActiveTab('feed')} className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'feed' ? 'text-orange-400' : 'text-gray-700'}`}>
              <span className="text-xl">🏠</span>
              <span className="text-[10px]">Feed</span>
            </button>
            <button onClick={() => setActiveTab('post')} className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'post' ? 'text-orange-400' : 'text-gray-700'}`}>
              <span className="text-xl">➕</span>
              <span className="text-[10px]">Post</span>
            </button>
            <button onClick={() => setActiveTab('profile')} className={`flex-1 py-4 flex flex-col items-center gap-1 transition-colors ${activeTab === 'profile' ? 'text-orange-400' : 'text-gray-700'}`}>
              <span className="text-xl">👤</span>
              <span className="text-[10px]">Profile</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}
