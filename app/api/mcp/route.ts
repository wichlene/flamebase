import { NextResponse } from 'next/server'
import { encodeFunctionData, parseEther } from 'viem'
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../../../lib/contract'
import { TOOLS_ABI, TOOLS_ADDRESS, TOKEN_FACTORY_ABI, TOKEN_FACTORY_ADDRESS, DAO_ABI, DAO_ADDRESS } from '../../../lib/toolsContracts'

const CHAIN_ID = 8453 // Base mainnet

export async function GET() {
  return NextResponse.json({
    name: 'FlameBase',
    description: 'Web3 social media platform on Base — post, like, comment, tip onchain',
    version: '1.0.0',
    chainId: CHAIN_ID,
    contracts: {
      main: CONTRACT_ADDRESS,
      tools: TOOLS_ADDRESS,
      tokenFactory: TOKEN_FACTORY_ADDRESS,
      dao: DAO_ADDRESS,
    },
    actions: [
      'createPost', 'like', 'tip', 'comment',
      'createProfile', 'checkIn', 'count',
      'log', 'greet', 'deployToken', 'propose', 'vote',
    ],
  })
}

export async function POST(request: Request) {
  try {
    const { action, params = {} } = await request.json()

    switch (action) {
      case 'createPost': {
        const data = encodeFunctionData({
          abi: CONTRACT_ABI,
          functionName: 'createPost',
          args: [params.content ?? '', params.ipfsHash ?? ''],
        })
        return tx(CONTRACT_ADDRESS, data, '0.0001')
      }

      case 'like': {
        const data = encodeFunctionData({
          abi: CONTRACT_ABI,
          functionName: 'like',
          args: [BigInt(params.postId ?? 0)],
        })
        return tx(CONTRACT_ADDRESS, data, '0.00001')
      }

      case 'tip': {
        const data = encodeFunctionData({
          abi: CONTRACT_ABI,
          functionName: 'tip',
          args: [BigInt(params.postId ?? 0)],
        })
        return tx(CONTRACT_ADDRESS, data, params.amount ?? '0.0001')
      }

      case 'comment': {
        const data = encodeFunctionData({
          abi: CONTRACT_ABI,
          functionName: 'comment',
          args: [BigInt(params.postId ?? 0), params.text ?? ''],
        })
        return tx(CONTRACT_ADDRESS, data, '0.00001')
      }

      case 'createProfile': {
        const data = encodeFunctionData({
          abi: CONTRACT_ABI,
          functionName: 'createProfile',
          args: [params.username ?? '', params.avatarHash ?? ''],
        })
        return tx(CONTRACT_ADDRESS, data, '0')
      }

      case 'checkIn': {
        const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'checkIn', args: [] })
        return tx(TOOLS_ADDRESS, data, '0.00001')
      }

      case 'count': {
        const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'count', args: [] })
        return tx(TOOLS_ADDRESS, data, '0.00001')
      }

      case 'log': {
        const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'log', args: [params.text ?? ''] })
        return tx(TOOLS_ADDRESS, data, '0.00001')
      }

      case 'greet': {
        const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'greet', args: [params.greeting ?? ''] })
        return tx(TOOLS_ADDRESS, data, '0.00001')
      }

      case 'deployToken': {
        const data = encodeFunctionData({
          abi: TOKEN_FACTORY_ABI,
          functionName: 'deployToken',
          args: [params.name ?? '', params.symbol ?? '', BigInt(params.supply ?? 1000000)],
        })
        return tx(TOKEN_FACTORY_ADDRESS, data, '0.001')
      }

      case 'propose': {
        const data = encodeFunctionData({
          abi: DAO_ABI,
          functionName: 'propose',
          args: [params.title ?? '', params.description ?? ''],
        })
        return tx(DAO_ADDRESS, data, '0.001')
      }

      case 'vote': {
        const data = encodeFunctionData({
          abi: DAO_ABI,
          functionName: 'vote',
          args: [BigInt(params.proposalId ?? 0), params.support ?? true],
        })
        return tx(DAO_ADDRESS, data, '0.0001')
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to encode transaction' }, { status: 500 })
  }
}

function tx(to: string, data: string, ethValue: string) {
  return NextResponse.json({
    to,
    data,
    value: `0x${parseEther(ethValue).toString(16)}`,
    chainId: CHAIN_ID,
  })
}
