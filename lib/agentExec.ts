'use client'

import { parseEther, parseUnits, encodeFunctionData, erc20Abi, isAddress } from 'viem'
import { CONTRACT_ABI, CONTRACT_ADDRESS } from './contract'
import { TOOLS_ABI, TOOLS_ADDRESS, TOKEN_FACTORY_ABI, TOKEN_FACTORY_ADDRESS, DAO_ABI, DAO_ADDRESS } from './toolsContracts'
import { safeSend, type RawCall, type MinimalProvider } from './safeSend'

// USDC on Base (6 decimals).
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

export type AgentAction = { tool: string; args: Record<string, unknown> }

// Intentional, user-facing failures (vs. raw wallet/RPC errors). AIChat's
// friendlyError surfaces these verbatim instead of collapsing them to a
// generic "Something went wrong", so the user learns what to actually fix.
export class AgentActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentActionError'
  }
}

type WalletLike = {
  account?: { address: `0x${string}` } | undefined
  // viem WalletClient.sendTransaction is deeply generic; accept loosely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendTransaction: (args: any) => Promise<`0x${string}`>
}

// Minimal shape of viem's PublicClient we need for price/postId reads and
// the safeSend pre-flight simulation / receipt check.
type PublicClientLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readContract: (args: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  waitForTransactionReceipt?: (args: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  call: (args: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTransactionReceipt: (args: any) => Promise<any>
}

// Whether the connected wallet is the Base App / Farcaster mini-app's
// ERC-4337 Coinbase Smart Wallet — see lib/safeSend.ts for why that changes
// how a transaction must be sent and verified.
export type ExecContext = { isSmartWallet: boolean; provider?: MinimalProvider }

const DEFAULT_LIKE_PRICE = parseEther('0.0001')
const DEFAULT_COMMENT_PRICE = parseEther('0.0003')
const DEFAULT_POST_PRICE = parseEther('0.0002')

// Uniswap V3 on Base (official addresses from Uniswap/docs Base-Deployments.md).
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as const
const SWAP_ROUTER_ADDRESS = '0x2626664c2603336E57B271c5C0b26F421741e481' as const
const QUOTER_ADDRESS = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' as const
const SWAP_FEE_TIERS = [500, 3000, 10000] as const
const SWAP_SLIPPAGE_BPS = 100n // 1%

const QUOTER_V2_ABI = [{
  type: 'function', name: 'quoteExactInputSingle', stateMutability: 'nonpayable',
  inputs: [{
    name: 'params', type: 'tuple', components: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'fee', type: 'uint24' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
  }],
  outputs: [
    { name: 'amountOut', type: 'uint256' },
    { name: 'sqrtPriceX96After', type: 'uint160' },
    { name: 'initializedTicksCrossed', type: 'uint32' },
    { name: 'gasEstimate', type: 'uint256' },
  ],
}] as const

const SWAP_ROUTER_ABI = [
  {
    type: 'function', name: 'exactInputSingle', stateMutability: 'payable',
    inputs: [{
      name: 'params', type: 'tuple', components: [
        { name: 'tokenIn', type: 'address' },
        { name: 'tokenOut', type: 'address' },
        { name: 'fee', type: 'uint24' },
        { name: 'recipient', type: 'address' },
        { name: 'amountIn', type: 'uint256' },
        { name: 'amountOutMinimum', type: 'uint256' },
        { name: 'sqrtPriceLimitX96', type: 'uint160' },
      ],
    }],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    type: 'function', name: 'unwrapWETH9', stateMutability: 'payable',
    inputs: [{ name: 'amountMinimum', type: 'uint256' }, { name: 'recipient', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function', name: 'multicall', stateMutability: 'payable',
    inputs: [{ name: 'data', type: 'bytes[]' }],
    outputs: [{ name: '', type: 'bytes[]' }],
  },
] as const

function tokenAddress(symbol: string): `0x${string}` {
  if (symbol === 'ETH') return WETH_ADDRESS
  if (symbol === 'USDC') return USDC_ADDRESS
  throw new AgentActionError('Unsupported token (ETH or USDC only).')
}

function tokenDecimals(symbol: string): number {
  return symbol === 'USDC' ? 6 : 18
}

async function bestSwapQuote(
  publicClient: PublicClientLike,
  tokenIn: `0x${string}`,
  tokenOut: `0x${string}`,
  amountIn: bigint,
): Promise<{ fee: number; amountOut: bigint }> {
  let best: { fee: number; amountOut: bigint } | null = null
  for (const fee of SWAP_FEE_TIERS) {
    try {
      const result = (await publicClient.readContract({
        address: QUOTER_ADDRESS,
        abi: QUOTER_V2_ABI,
        functionName: 'quoteExactInputSingle',
        args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
      })) as readonly [bigint, bigint, number, bigint]
      const amountOut = result[0]
      if (!best || amountOut > best.amountOut) best = { fee, amountOut }
    } catch {}
  }
  if (!best) throw new AgentActionError('No liquidity found for this swap on Base.')
  return best
}

// Whether an address has a FlameBase profile (profiles() returns
// [username, avatarHash, exists, flames, tips]).
async function hasProfile(publicClient: PublicClientLike, address: `0x${string}`): Promise<boolean> {
  try {
    const p = (await publicClient.readContract({
      address: CONTRACT_ADDRESS, abi: CONTRACT_ABI, functionName: 'profiles', args: [address],
    })) as readonly unknown[]
    return Boolean(p?.[2])
  } catch {
    return false
  }
}

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
  if (count === 0n) throw new AgentActionError('No posts yet on FlameBase.')
  return count - 1n
}

function parsePostId(postId: unknown): bigint | undefined {
  if (postId === undefined || postId === null || postId === '') return undefined
  const n = BigInt(postId as string | number)
  if (n < 0n) throw new AgentActionError('Invalid post ID.')
  return n
}

function requireAddress(address: string, label: string): void {
  if (!address) throw new AgentActionError(`${label} isn't deployed yet.`)
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
      return `Post: "${args.content}"${typeof args.ipfsHash === 'string' && args.ipfsHash.trim() ? ' · 🖼️ with media' : ''}`
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
    case 'swap_token':
      return `Swap ${args.amount} ${args.fromToken} → ${args.toToken} (Uniswap V3)`
    case 'trade_token':
      return `${args.side === 'buy' ? 'Buy' : 'Sell'} ${args.amount} ${args.side === 'buy' ? 'ETH of' : 'of'} ${String(args.tokenAddress).slice(0, 10)}… (DEX)`
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
      if (args.postId != null && args.postId !== '' && !isNumeric(args.postId)) return 'Invalid post ID.'
      return null
    case 'tip_post': {
      if (args.postId != null && args.postId !== '' && !isNumeric(args.postId)) return 'Invalid post ID.'
      if (!args.amount || isNaN(Number(args.amount)) || Number(args.amount) <= 0) return 'Invalid tip amount.'
      return null
    }
    case 'comment_post': {
      if (args.postId != null && args.postId !== '' && !isNumeric(args.postId)) return 'Invalid post ID.'
      if (!args.text || typeof args.text !== 'string' || !args.text.trim()) return 'Comment text is required.'
      return null
    }
    case 'create_post': {
      // IPFS CIDs are plain alphanumeric (v0 base58 / v1 base32); we also allow
      // our own `vid_` prefix. Anything else is not something /api/upload produced.
      if (args.ipfsHash != null && args.ipfsHash !== '' &&
          (typeof args.ipfsHash !== 'string' || !/^(vid_)?[A-Za-z0-9]+$/.test(args.ipfsHash.trim())))
        return 'Invalid media attachment.'
      const hasMedia = typeof args.ipfsHash === 'string' && args.ipfsHash.trim() !== ''
      // Media-only posts (empty text) are valid — the feed renders them fine.
      if (!hasMedia && (!args.content || typeof args.content !== 'string' || !args.content.trim())) return 'Post content is required.'
      return null
    }
    case 'create_profile':
      if (!args.username || typeof args.username !== 'string' || !args.username.trim()) return 'Username is required.'
      return null
    case 'check_in':
    case 'tap_counter':
      return null
    case 'log_entry':
      if (!args.text || typeof args.text !== 'string' || !args.text.trim()) return 'Log text is required.'
      // Contract requires 1-280 bytes (require "1-280 chars").
      if (new TextEncoder().encode(args.text).length > 280) return 'Log text is too long (max 280 characters).'
      return null
    case 'send_greeting':
      if (!args.greeting || typeof args.greeting !== 'string' || !args.greeting.trim()) return 'Greeting text is required.'
      // Contract caps the greeting at 100 bytes (require "Max 100 chars").
      if (new TextEncoder().encode(args.greeting).length > 100) return 'Greeting is too long (max 100 characters).'
      return null
    case 'deploy_token': {
      const { name, symbol, supply } = args
      if (!name || typeof name !== 'string' || !name.trim()) return 'Token name is required.'
      if (!symbol || typeof symbol !== 'string' || !symbol.trim()) return 'Token symbol is required.'
      const n = Number(supply)
      // Must be a whole number too — a decimal like "1000.5" passes isNumeric
      // but then throws a raw RangeError at BigInt(supply) later.
      if (!isNumeric(supply) || !Number.isInteger(n) || n <= 0 || n > 1_000_000_000) return 'Supply must be a whole number between 1 and 1,000,000,000.'
      return null
    }
    case 'create_proposal':
      if (!args.title || typeof args.title !== 'string' || !args.title.trim()) return 'Proposal title is required.'
      // Contract caps the title at 100 bytes (require "Title 1-100 chars").
      if (new TextEncoder().encode(args.title).length > 100) return 'Proposal title is too long (max 100 characters).'
      return null
    case 'vote_proposal': {
      if (!isNumeric(args.proposalId)) return 'Invalid proposal ID.'
      if (typeof args.support !== 'boolean') return 'Vote must be for or against.'
      return null
    }
    case 'swap_token': {
      const { fromToken, toToken, amount } = args
      if (fromToken !== 'ETH' && fromToken !== 'USDC') return 'Unsupported token (ETH or USDC only).'
      if (toToken !== 'ETH' && toToken !== 'USDC') return 'Unsupported token (ETH or USDC only).'
      if (fromToken === toToken) return 'From and to token must be different.'
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return 'Invalid amount.'
      return null
    }
    case 'trade_token': {
      if (args.side !== 'buy' && args.side !== 'sell') return 'Side must be buy or sell.'
      if (!args.tokenAddress || !isAddress(String(args.tokenAddress))) return 'Give me the token contract address (0x…).'
      if (!args.amount || isNaN(Number(args.amount)) || Number(args.amount) <= 0) return 'Invalid amount.'
      return null
    }
    default:
      return `Unsupported action: ${a.tool}`
  }
}

/**
 * Execute the action via the connected wallet. Returns the tx hash.
 * `ctx` carries whether this is the Base App's ERC-4337 smart wallet (and its
 * EIP-1193 provider) so every send goes through safeSend's pre-flight
 * simulation + UserOperationEvent check — without it, a smart-wallet
 * "success" here can be an inner revert that silently moved nothing, exactly
 * like the bug that used to hit tips/follows in the main feed.
 */
export async function executeAction(a: AgentAction, wallet: WalletLike, publicClient: PublicClientLike, ctx?: ExecContext): Promise<`0x${string}`> {
  if (!wallet.account) throw new Error('Wallet not connected')
  const account = wallet.account.address
  const args = a.args as Record<string, any>

  const send = (call: RawCall) => safeSend({
    call,
    account,
    publicClient,
    isSmartWallet: !!ctx?.isSmartWallet,
    provider: ctx?.provider,
    sendTransaction: c => wallet.sendTransaction({ to: c.to, data: c.data, value: c.value }),
  })

  switch (a.tool) {
    case 'send_token': {
      const { to, amount, token } = args as { to: `0x${string}`; amount: string; token: string }
      if (token === 'ETH') return send({ to, value: parseEther(amount) })
      const data = encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, parseUnits(amount, 6)] })
      return send({ to: USDC_ADDRESS, data })
    }

    case 'like_post': {
      const postId = parsePostId(args.postId) ?? (await resolveLatestPostId(publicClient))
      const value = await effectiveFee(publicClient, 'likePrice', DEFAULT_LIKE_PRICE)
      const data = encodeFunctionData({ abi: CONTRACT_ABI, functionName: 'like', args: [postId] })
      return send({ to: CONTRACT_ADDRESS, data, value })
    }

    case 'tip_post': {
      const postId = parsePostId(args.postId) ?? (await resolveLatestPostId(publicClient))
      const data = encodeFunctionData({ abi: CONTRACT_ABI, functionName: 'tip', args: [postId] })
      return send({ to: CONTRACT_ADDRESS, data, value: parseEther(String(args.amount)) })
    }

    case 'comment_post': {
      const postId = parsePostId(args.postId) ?? (await resolveLatestPostId(publicClient))
      const value = await effectiveFee(publicClient, 'commentPrice', DEFAULT_COMMENT_PRICE)
      const data = encodeFunctionData({ abi: CONTRACT_ABI, functionName: 'comment', args: [postId, String(args.text)] })
      return send({ to: CONTRACT_ADDRESS, data, value })
    }

    case 'create_post': {
      // createPost reverts with "Create profile first" if the caller has no
      // profile — catch it up front with a message that tells them what to do.
      if (!(await hasProfile(publicClient, wallet.account.address)))
        throw new AgentActionError('You need a FlameBase profile before posting — ask me to create one for you first.')
      const value = await effectiveFee(publicClient, 'postPrice', DEFAULT_POST_PRICE)
      // Strip any leaked "[attached media …]" marker from the text — the media
      // travels in the dedicated ipfsHash field, never inside the content.
      const content = String(args.content ?? '').replace(/\[attached media ipfs:[^\]]*\]/gi, '').trim()
      const ipfsHash = typeof args.ipfsHash === 'string' ? args.ipfsHash.trim() : ''
      const data = encodeFunctionData({ abi: CONTRACT_ABI, functionName: 'createPost', args: [content, ipfsHash] })
      return send({ to: CONTRACT_ADDRESS, data, value })
    }

    case 'create_profile': {
      // createProfile reverts with "Profile exists" on a second call.
      if (await hasProfile(publicClient, wallet.account.address))
        throw new AgentActionError('You already have a FlameBase profile.')
      const data = encodeFunctionData({ abi: CONTRACT_ABI, functionName: 'createProfile', args: [String(args.username), ''] })
      return send({ to: CONTRACT_ADDRESS, data })
    }

    case 'check_in': {
      requireAddress(TOOLS_ADDRESS, 'FlameBase Tools')
      const value = await fixedFeeWei()
      const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'checkIn', args: [] })
      return send({ to: TOOLS_ADDRESS, data, value })
    }

    case 'tap_counter': {
      requireAddress(TOOLS_ADDRESS, 'FlameBase Tools')
      const value = await fixedFeeWei()
      const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'count', args: [] })
      return send({ to: TOOLS_ADDRESS, data, value })
    }

    case 'log_entry': {
      requireAddress(TOOLS_ADDRESS, 'FlameBase Tools')
      const value = await fixedFeeWei()
      const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'log', args: [String(args.text)] })
      return send({ to: TOOLS_ADDRESS, data, value })
    }

    case 'send_greeting': {
      requireAddress(TOOLS_ADDRESS, 'FlameBase Tools')
      const value = await fixedFeeWei()
      const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'greet', args: [String(args.greeting)] })
      return send({ to: TOOLS_ADDRESS, data, value })
    }

    case 'deploy_token': {
      requireAddress(TOKEN_FACTORY_ADDRESS, 'Token Factory')
      const value = await fixedFeeWei()
      const data = encodeFunctionData({
        abi: TOKEN_FACTORY_ABI,
        functionName: 'deployToken',
        args: [String(args.name), String(args.symbol), BigInt(args.supply)],
      })
      return send({ to: TOKEN_FACTORY_ADDRESS, data, value })
    }

    case 'create_proposal': {
      requireAddress(DAO_ADDRESS, 'FlameBase DAO')
      const value = await fixedFeeWei()
      const data = encodeFunctionData({
        abi: DAO_ABI,
        functionName: 'propose',
        args: [String(args.title), String(args.description ?? '')],
      })
      return send({ to: DAO_ADDRESS, data, value })
    }

    case 'vote_proposal': {
      requireAddress(DAO_ADDRESS, 'FlameBase DAO')
      const value = await fixedFeeWei()
      const data = encodeFunctionData({
        abi: DAO_ABI,
        functionName: 'vote',
        args: [BigInt(args.proposalId), Boolean(args.support)],
      })
      return send({ to: DAO_ADDRESS, data, value })
    }

    case 'swap_token': {
      const { fromToken, toToken, amount } = args as { fromToken: string; toToken: string; amount: string }
      if (fromToken === toToken) throw new AgentActionError('From and to token must be different.')
      const tokenIn = tokenAddress(fromToken)
      const tokenOut = tokenAddress(toToken)
      const amountIn = parseUnits(String(amount), tokenDecimals(fromToken))

      const { fee, amountOut } = await bestSwapQuote(publicClient, tokenIn, tokenOut, amountIn)
      const amountOutMinimum = amountOut - (amountOut * SWAP_SLIPPAGE_BPS) / 10000n
      const value = fromToken === 'ETH' ? amountIn : 0n

      if (fromToken === 'USDC') {
        const allowance = (await publicClient.readContract({
          address: USDC_ADDRESS, abi: erc20Abi, functionName: 'allowance',
          args: [wallet.account.address, SWAP_ROUTER_ADDRESS],
        })) as bigint
        if (allowance < amountIn) {
          const approveData = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [SWAP_ROUTER_ADDRESS, amountIn] })
          const approveHash = await send({ to: USDC_ADDRESS, data: approveData })
          if (publicClient.waitForTransactionReceipt) await publicClient.waitForTransactionReceipt({ hash: approveHash })
        }
      }

      if (toToken === 'ETH') {
        // The router pays out unwrapWETH9's call to whoever calls it using its
        // ENTIRE WETH balance — swap and unwrap must be one atomic multicall,
        // never two separate txs, or the unwrapped ETH could be front-run.
        const swapData = encodeFunctionData({
          abi: SWAP_ROUTER_ABI, functionName: 'exactInputSingle',
          args: [{ tokenIn, tokenOut, fee, recipient: SWAP_ROUTER_ADDRESS, amountIn, amountOutMinimum, sqrtPriceLimitX96: 0n }],
        })
        const unwrapData = encodeFunctionData({
          abi: SWAP_ROUTER_ABI, functionName: 'unwrapWETH9', args: [amountOutMinimum, wallet.account.address],
        })
        const data = encodeFunctionData({ abi: SWAP_ROUTER_ABI, functionName: 'multicall', args: [[swapData, unwrapData]] })
        return send({ to: SWAP_ROUTER_ADDRESS, data, value })
      }

      const data = encodeFunctionData({
        abi: SWAP_ROUTER_ABI, functionName: 'exactInputSingle',
        args: [{ tokenIn, tokenOut, fee, recipient: wallet.account.address, amountIn, amountOutMinimum, sqrtPriceLimitX96: 0n }],
      })
      return send({ to: SWAP_ROUTER_ADDRESS, data, value })
    }

    case 'trade_token': {
      // Buy/sell ANY token by contract address via the DEX aggregator (all Base
      // DEXs). Same /api/swap route the B20 DEX uses, so it inherits routing +
      // the platform fee. Buy: ETH→token; sell: token→ETH (approve first).
      const side = args.side as 'buy' | 'sell'
      const token = String(args.tokenAddress) as `0x${string}`
      const amount = String(args.amount)
      const NATIVE = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
      const sender = wallet.account.address

      let dec = 18
      if (side === 'sell') {
        try { dec = Number(await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' })) } catch {}
      }
      const amountIn = side === 'buy' ? parseEther(amount) : parseUnits(amount, dec)

      const res = await fetch('/api/swap', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tokenIn: side === 'buy' ? NATIVE : token,
          tokenOut: side === 'buy' ? token : NATIVE,
          amountIn: amountIn.toString(), sender, recipient: sender, slippageBps: 1000,
        }),
      })
      const d = await res.json()
      if (!res.ok || !d?.to) throw new AgentActionError(d?.error || 'No liquidity route for this token.')

      if (side === 'sell' && d.needsApprove) {
        const allowance = (await publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [sender, d.router] })) as bigint
        if (allowance < amountIn) {
          const approveData = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [d.router, amountIn] })
          const approveHash = await send({ to: token, data: approveData })
          if (publicClient.waitForTransactionReceipt) await publicClient.waitForTransactionReceipt({ hash: approveHash })
        }
      }
      return send({ to: d.to, data: d.data, value: BigInt(d.value || '0') })
    }

    default:
      throw new Error(`Unsupported action: ${a.tool}`)
  }
}
