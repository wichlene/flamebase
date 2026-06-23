'use client'

import { parseEther, parseUnits, encodeFunctionData, erc20Abi, isAddress } from 'viem'
import { CONTRACT_ABI, CONTRACT_ADDRESS } from './contract'
import { TOOLS_ABI, TOOLS_ADDRESS, TOKEN_FACTORY_ABI, TOKEN_FACTORY_ADDRESS, DAO_ABI, DAO_ADDRESS } from './toolsContracts'

// USDC on Base (6 decimals).
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

export type AgentAction = { tool: string; args: Record<string, unknown> }

type WalletLike = {
  account?: { address: `0x${string}` } | undefined
  // viem WalletClient.sendTransaction is deeply generic; accept loosely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendTransaction: (args: any) => Promise<`0x${string}`>
}

// Minimal shape of viem's PublicClient we need for price/postId reads.
type PublicClientLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readContract: (args: any) => Promise<any>
}

const DEFAULT_LIKE_PRICE = parseEther('0.0001')
const DEFAULT_COMMENT_PRICE = parseEther('0.0003')
const DEFAULT_POST_PRICE = parseEther('0.0002')

// Same USD-pegged fee FlameBase's UI charges for "Tools" actions (count,
// check-in, log, greet, deploy, propose, vote) — these contracts don't
// enforce a minimum on-chain, so this just keeps chat-driven actions
// consistent with using the app directly.
async function fixedFeeWei(): Promise<bigint> {
  let ethPrice = 2500
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd')
    const d = await r.json()
    if (d?.ethereum?.usd) ethPrice = d.ethereum.usd
  } catch {}
  return parseEther((0.04 / ethPrice).toFixed(10))
}

// like/comment/createPost on the main contract DO enforce a minimum
// (require(msg.value >= price)) — read the live price and use the higher of
// that or the fixed fee, so the tx never reverts for being underfunded.
async function effectiveFee(
  publicClient: PublicClientLike,
  functionName: 'likePrice' | 'commentPrice' | 'postPrice',
  fallback: bigint,
): Promise<bigint> {
  const fixed = await fixedFeeWei()
  try {
    const live = (await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName })) as bigint
    return live > fixed ? live : fixed
  } catch {
    return fallback > fixed ? fallback : fixed
  }
}

async function resolveLatestPostId(publicClient: PublicClientLike): Promise<bigint> {
  const count = (await publicClient.readContract({ address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'postCount' })) as bigint
  if (count === 0n) throw new Error('No posts yet on FlameBase.')
  return count - 1n
}

function parsePostId(postId: unknown): bigint | undefined {
  if (postId === undefined || postId === null || postId === '') return undefined
  const n = BigInt(postId as string | number)
  if (n < 0n) throw new Error('Invalid post ID.')
  return n
}

function requireAddress(address: string, label: string): void {
  if (!address) throw new Error(`${label} isn't deployed yet.`)
}

function isNumeric(v: unknown): boolean {
  return v !== undefined && v !== null && v !== '' && !isNaN(Number(v))
}

/** Human-readable summary shown in the confirmation card before execution. */
export function describeAction(a: AgentAction): string {
  const args = a.args as Record<string, any>
  switch (a.tool) {
    case 'send_token':
      return `Send ${args.amount} ${args.token} to ${args.to}`
    case 'like_post':
      return `Like post ${args.postId ?? '(latest)'}`
    case 'tip_post':
      return `Tip ${args.amount} ETH on post ${args.postId ?? '(latest)'}`
    case 'comment_post':
      return `Comment "${args.text}" on post ${args.postId ?? '(latest)'}`
    case 'create_post':
      return `Post: "${args.content}"`
    case 'create_profile':
      return `Create profile "${args.username}"`
    case 'check_in':
      return 'Daily check-in'
    case 'tap_counter':
      return 'Tap the global counter'
    case 'log_entry':
      return `Log: "${args.text}"`
    case 'send_greeting':
      return `Greet: "${args.greeting}"`
    case 'deploy_token':
      return `Deploy token ${args.name} (${args.symbol}), supply ${args.supply}`
    case 'create_proposal':
      return `Create DAO proposal "${args.title}"`
    case 'vote_proposal':
      return `Vote ${args.support ? 'FOR' : 'AGAINST'} proposal ${args.proposalId}`
    default:
      return `Run ${a.tool}`
  }
}

/** Validate an action's args; returns an error message or null if OK. */
export function validateAction(a: AgentAction): string | null {
  const args = a.args as Record<string, any>
  switch (a.tool) {
    case 'send_token': {
      const { to, amount, token } = args
      if (!to || !isAddress(to)) return 'Invalid recipient address.'
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return 'Invalid amount.'
      if (token !== 'ETH' && token !== 'USDC') return 'Unsupported token (ETH or USDC only).'
      return null
    }
    case 'like_post':
      if (args.postId !== undefined && args.postId !== '' && !isNumeric(args.postId)) return 'Invalid post ID.'
      return null
    case 'tip_post': {
      if (args.postId !== undefined && args.postId !== '' && !isNumeric(args.postId)) return 'Invalid post ID.'
      if (!args.amount || isNaN(Number(args.amount)) || Number(args.amount) <= 0) return 'Invalid tip amount.'
      return null
    }
    case 'comment_post': {
      if (args.postId !== undefined && args.postId !== '' && !isNumeric(args.postId)) return 'Invalid post ID.'
      if (!args.text || typeof args.text !== 'string' || !args.text.trim()) return 'Comment text is required.'
      return null
    }
    case 'create_post':
      if (!args.content || typeof args.content !== 'string' || !args.content.trim()) return 'Post content is required.'
      return null
    case 'create_profile':
      if (!args.username || typeof args.username !== 'string' || !args.username.trim()) return 'Username is required.'
      return null
    case 'check_in':
    case 'tap_counter':
      return null
    case 'log_entry':
      if (!args.text || typeof args.text !== 'string' || !args.text.trim()) return 'Log text is required.'
      return null
    case 'send_greeting':
      if (!args.greeting || typeof args.greeting !== 'string' || !args.greeting.trim()) return 'Greeting text is required.'
      return null
    case 'deploy_token': {
      const { name, symbol, supply } = args
      if (!name || typeof name !== 'string' || !name.trim()) return 'Token name is required.'
      if (!symbol || typeof symbol !== 'string' || !symbol.trim()) return 'Token symbol is required.'
      const n = Number(supply)
      if (!isNumeric(supply) || n <= 0 || n > 1_000_000_000) return 'Supply must be between 1 and 1,000,000,000.'
      return null
    }
    case 'create_proposal':
      if (!args.title || typeof args.title !== 'string' || !args.title.trim()) return 'Proposal title is required.'
      return null
    case 'vote_proposal': {
      if (!isNumeric(args.proposalId)) return 'Invalid proposal ID.'
      if (typeof args.support !== 'boolean') return 'Vote must be for or against.'
      return null
    }
    default:
      return `Unsupported action: ${a.tool}`
  }
}

/** Execute the action via the connected wallet. Returns the tx hash. */
export async function executeAction(a: AgentAction, wallet: WalletLike, publicClient: PublicClientLike): Promise<`0x${string}`> {
  if (!wallet.account) throw new Error('Wallet not connected')
  const args = a.args as Record<string, any>

  switch (a.tool) {
    case 'send_token': {
      const { to, amount, token } = args as { to: `0x${string}`; amount: string; token: string }
      if (token === 'ETH') return wallet.sendTransaction({ to, value: parseEther(amount) })
      const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, parseUnits(amount, 6)] })
      return wallet.sendTransaction({ to: USDC_ADDRESS, data })
    }

    case 'like_post': {
      const postId = parsePostId(args.postId) ?? (await resolveLatestPostId(publicClient))
      const value = await effectiveFee(publicClient, 'likePrice', DEFAULT_LIKE_PRICE)
      const data = encodeFunctionData({ abi: CONTRACT_ABI, functionName: 'like', args: [postId] })
      return wallet.sendTransaction({ to: CONTRACT_ADDRESS, data, value })
    }

    case 'tip_post': {
      const postId = parsePostId(args.postId) ?? (await resolveLatestPostId(publicClient))
      const data = encodeFunctionData({ abi: CONTRACT_ABI, functionName: 'tip', args: [postId] })
      return wallet.sendTransaction({ to: CONTRACT_ADDRESS, data, value: parseEther(String(args.amount)) })
    }

    case 'comment_post': {
      const postId = parsePostId(args.postId) ?? (await resolveLatestPostId(publicClient))
      const value = await effectiveFee(publicClient, 'commentPrice', DEFAULT_COMMENT_PRICE)
      const data = encodeFunctionData({ abi: CONTRACT_ABI, functionName: 'comment', args: [postId, String(args.text)] })
      return wallet.sendTransaction({ to: CONTRACT_ADDRESS, data, value })
    }

    case 'create_post': {
      const value = await effectiveFee(publicClient, 'postPrice', DEFAULT_POST_PRICE)
      const data = encodeFunctionData({ abi: CONTRACT_ABI, functionName: 'createPost', args: [String(args.content), ''] })
      return wallet.sendTransaction({ to: CONTRACT_ADDRESS, data, value })
    }

    case 'create_profile': {
      const data = encodeFunctionData({ abi: CONTRACT_ABI, functionName: 'createProfile', args: [String(args.username), ''] })
      return wallet.sendTransaction({ to: CONTRACT_ADDRESS, data })
    }

    case 'check_in': {
      requireAddress(TOOLS_ADDRESS, 'FlameBase Tools')
      const value = await fixedFeeWei()
      const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'checkIn', args: [] })
      return wallet.sendTransaction({ to: TOOLS_ADDRESS, data, value })
    }

    case 'tap_counter': {
      requireAddress(TOOLS_ADDRESS, 'FlameBase Tools')
      const value = await fixedFeeWei()
      const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'count', args: [] })
      return wallet.sendTransaction({ to: TOOLS_ADDRESS, data, value })
    }

    case 'log_entry': {
      requireAddress(TOOLS_ADDRESS, 'FlameBase Tools')
      const value = await fixedFeeWei()
      const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'log', args: [String(args.text)] })
      return wallet.sendTransaction({ to: TOOLS_ADDRESS, data, value })
    }

    case 'send_greeting': {
      requireAddress(TOOLS_ADDRESS, 'FlameBase Tools')
      const value = await fixedFeeWei()
      const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'greet', args: [String(args.greeting)] })
      return wallet.sendTransaction({ to: TOOLS_ADDRESS, data, value })
    }

    case 'deploy_token': {
      requireAddress(TOKEN_FACTORY_ADDRESS, 'Token Factory')
      const value = await fixedFeeWei()
      const data = encodeFunctionData({
        abi: TOKEN_FACTORY_ABI,
        functionName: 'deployToken',
        args: [String(args.name), String(args.symbol), BigInt(args.supply)],
      })
      return wallet.sendTransaction({ to: TOKEN_FACTORY_ADDRESS, data, value })
    }

    case 'create_proposal': {
      requireAddress(DAO_ADDRESS, 'FlameBase DAO')
      const value = await fixedFeeWei()
      const data = encodeFunctionData({
        abi: DAO_ABI,
        functionName: 'propose',
        args: [String(args.title), String(args.description ?? '')],
      })
      return wallet.sendTransaction({ to: DAO_ADDRESS, data, value })
    }

    case 'vote_proposal': {
      requireAddress(DAO_ADDRESS, 'FlameBase DAO')
      const value = await fixedFeeWei()
      const data = encodeFunctionData({
        abi: DAO_ABI,
        functionName: 'vote',
        args: [BigInt(args.proposalId), Boolean(args.support)],
      })
      return wallet.sendTransaction({ to: DAO_ADDRESS, data, value })
    }

    default:
      throw new Error(`Unsupported action: ${a.tool}`)
  }
}
