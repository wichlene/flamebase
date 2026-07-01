import type { Metadata } from 'next'
import { createPublicClient, http } from 'viem'
import { base } from 'viem/chains'
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../../../lib/contract'

// Cache each post page for 5 min: content is effectively immutable, only
// likes/tips drift, and this keeps generateMetadata from hitting an RPC on
// every crawler request.
export const revalidate = 300

const SITE = 'https://flamebase.xyz'
const FALLBACK_IMG = `${SITE}/thumbnail-base.png`
const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/'

// Server-side reader — same public RPCs the client uses, first one that answers.
const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
})

type PostView = {
  content: string
  author: `0x${string}`
  ipfsHash: string
  likes: bigint
  tips: bigint
  username: string
}

async function loadPost(id: string): Promise<PostView | null> {
  if (!/^\d+$/.test(id)) return null
  try {
    const post: any = await client.readContract({
      address: CONTRACT_ADDRESS,
      abi: CONTRACT_ABI,
      functionName: 'getPost',
      args: [BigInt(id)],
    })
    let username = ''
    try {
      const profile: any = await client.readContract({
        address: CONTRACT_ADDRESS,
        abi: CONTRACT_ABI,
        functionName: 'profiles',
        args: [post.author],
      })
      username = profile?.[0] || ''
    } catch {}
    return {
      content: post.content || '',
      author: post.author,
      ipfsHash: post.ipfsHash || '',
      likes: post.likes ?? 0n,
      tips: post.tips ?? 0n,
      username,
    }
  } catch {
    return null
  }
}

function displayName(p: PostView): string {
  return p.username || `${p.author.slice(0, 6)}…${p.author.slice(-4)}`
}

function postImage(p: PostView | null): string {
  if (p?.ipfsHash) return IPFS_GATEWAY + p.ipfsHash
  return FALLBACK_IMG
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params
  const post = await loadPost(id)

  const title = post
    ? `${displayName(post)} on FlameBase`
    : 'FlameBase — On-chain social on Base'
  const description = post
    ? (post.content || 'A post on FlameBase').slice(0, 200)
    : 'Every like, comment, and tip is a real transaction on Base.'
  const image = postImage(post)
  const url = `${SITE}/post/${id}`

  // Base App / Farcaster Mini App embed for this specific post: sharing the
  // link renders a rich card whose "Open" button launches the app straight
  // into this post (via the ?post= deep-link the client reads on load).
  const embed = {
    version: '1',
    imageUrl: image,
    button: {
      title: '🔥 Open on FlameBase',
      action: {
        type: 'launch_miniapp',
        name: 'FlameBase',
        url: `${SITE}/?post=${id}`,
        splashImageUrl: `${SITE}/logo.png`,
        splashBackgroundColor: '#0052FF',
      },
    },
  }
  const frameEmbed = {
    ...embed,
    button: { ...embed.button, action: { ...embed.button.action, type: 'launch_frame' } },
  }

  return {
    title,
    description,
    alternates: { canonical: `/post/${id}` },
    openGraph: {
      type: 'article',
      url,
      siteName: 'FlameBase',
      title,
      description,
      images: [{ url: image, width: 1200, height: 628, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
    other: {
      'fc:miniapp': JSON.stringify(embed),
      'fc:frame': JSON.stringify(frameEmbed),
    },
  }
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const post = await loadPost(id)
  const appUrl = `${SITE}/?post=${id}`

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px', fontFamily: 'system-ui, sans-serif' }}>
      {/* Send humans into the app; crawlers keep the server-rendered meta above. */}
      <meta httpEquiv="refresh" content={`1;url=${appUrl}`} />

      <a href={SITE} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: '#0052FF', fontWeight: 800, fontSize: 20 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${SITE}/logo.png`} alt="FlameBase" width={28} height={28} style={{ borderRadius: 8 }} />
        FlameBase
      </a>

      {post ? (
        <article style={{ marginTop: 24, border: '1px solid #E4E7EB', borderRadius: 16, padding: 20 }}>
          <p style={{ fontWeight: 700, color: '#0A0B0D', margin: 0 }}>{displayName(post)}</p>
          {post.content && (
            <p style={{ color: '#0A0B0D', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginTop: 10 }}>{post.content}</p>
          )}
          {post.ipfsHash && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={IPFS_GATEWAY + post.ipfsHash} alt="" style={{ marginTop: 12, maxWidth: '100%', borderRadius: 12 }} />
          )}
          <p style={{ color: '#5B6271', fontSize: 14, marginTop: 12 }}>🔥 {post.likes.toString()} · 💸 {post.tips.toString()} tips</p>
        </article>
      ) : (
        <p style={{ marginTop: 24, color: '#5B6271' }}>This post could not be loaded.</p>
      )}

      <a href={appUrl}
        style={{ display: 'inline-block', marginTop: 20, background: '#0052FF', color: '#fff', fontWeight: 700, padding: '12px 20px', borderRadius: 12, textDecoration: 'none' }}>
        🔥 Open on FlameBase
      </a>
    </main>
  )
}
