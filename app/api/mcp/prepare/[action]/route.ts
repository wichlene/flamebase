import { NextResponse } from 'next/server'
import { encodeFunctionData, parseEther } from 'viem'
import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../../../../../lib/contract'
import {
  TOOLS_ABI, TOOLS_ADDRESS,
  TOKEN_FACTORY_ABI, TOKEN_FACTORY_ADDRESS,
  DAO_ABI, DAO_ADDRESS,
  FOLLOW_ABI, FOLLOW_ADDRESS,
} from '../../../../../lib/toolsContracts'

const CHAIN_ID = 8453

function ok(to: string, data: string, ethValue: string) {
  return NextResponse.json({
    ok: true,
    data: {
      to,
      data,
      value: `0x${parseEther(ethValue).toString(16)}`,
      chainId: CHAIN_ID,
    },
  }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
}

function err(msg: string, status = 400) {
  return NextResponse.json({ ok: false, error: msg }, { status })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ action: string }> }
) {
  const { action } = await params
  const { searchParams } = new URL(request.url)
  const q = (k: string) => searchParams.get(k) ?? ''

  try {
    switch (action) {
      case 'createPost': {
        if (!q('content')) return err('content is required')
        const data = encodeFunctionData({
          abi: CONTRACT_ABI,
          functionName: 'createPost',
          args: [q('content'), q('ipfsHash')],
        })
        return ok(CONTRACT_ADDRESS, data, '0.0001')
      }

      case 'like': {
        if (!q('postId')) return err('postId is required')
        const data = encodeFunctionData({
          abi: CONTRACT_ABI,
          functionName: 'like',
          args: [BigInt(q('postId'))],
        })
        return ok(CONTRACT_ADDRESS, data, '0.00001')
      }

      case 'tip': {
        if (!q('postId')) return err('postId is required')
        const data = encodeFunctionData({
          abi: CONTRACT_ABI,
          functionName: 'tip',
          args: [BigInt(q('postId'))],
        })
        return ok(CONTRACT_ADDRESS, data, q('amount') || '0.0001')
      }

      case 'comment': {
        if (!q('postId') || !q('text')) return err('postId and text are required')
        const data = encodeFunctionData({
          abi: CONTRACT_ABI,
          functionName: 'comment',
          args: [BigInt(q('postId')), q('text')],
        })
        return ok(CONTRACT_ADDRESS, data, '0.00001')
      }

      case 'createProfile': {
        if (!q('username')) return err('username is required')
        const data = encodeFunctionData({
          abi: CONTRACT_ABI,
          functionName: 'createProfile',
          args: [q('username'), q('avatarHash')],
        })
        return ok(CONTRACT_ADDRESS, data, '0')
      }

      case 'follow': {
        if (!FOLLOW_ADDRESS) return err('follow is not available on this deployment', 503)
        if (!q('target')) return err('target (address) is required')
        const data = encodeFunctionData({
          abi: FOLLOW_ABI,
          functionName: 'follow',
          args: [q('target') as `0x${string}`],
        })
        return ok(FOLLOW_ADDRESS, data, '0')
      }

      case 'unfollow': {
        if (!FOLLOW_ADDRESS) return err('unfollow is not available on this deployment', 503)
        if (!q('target')) return err('target (address) is required')
        const data = encodeFunctionData({
          abi: FOLLOW_ABI,
          functionName: 'unfollow',
          args: [q('target') as `0x${string}`],
        })
        return ok(FOLLOW_ADDRESS, data, '0')
      }

      case 'checkIn': {
        const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'checkIn', args: [] })
        return ok(TOOLS_ADDRESS, data, '0.00001')
      }

      case 'count': {
        const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'count', args: [] })
        return ok(TOOLS_ADDRESS, data, '0.00001')
      }

      case 'log': {
        if (!q('text')) return err('text is required')
        const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'log', args: [q('text')] })
        return ok(TOOLS_ADDRESS, data, '0.00001')
      }

      case 'greet': {
        if (!q('greeting')) return err('greeting is required')
        const data = encodeFunctionData({ abi: TOOLS_ABI, functionName: 'greet', args: [q('greeting')] })
        return ok(TOOLS_ADDRESS, data, '0.00001')
      }

      case 'deployToken': {
        if (!q('name') || !q('symbol')) return err('name and symbol are required')
        const data = encodeFunctionData({
          abi: TOKEN_FACTORY_ABI,
          functionName: 'deployToken',
          args: [q('name'), q('symbol'), BigInt(q('supply') || '1000000')],
        })
        return ok(TOKEN_FACTORY_ADDRESS, data, '0.001')
      }

      case 'propose': {
        if (!q('title') || !q('description')) return err('title and description are required')
        const data = encodeFunctionData({
          abi: DAO_ABI,
          functionName: 'propose',
          args: [q('title'), q('description')],
        })
        return ok(DAO_ADDRESS, data, '0.001')
      }

      case 'vote': {
        if (!q('proposalId')) return err('proposalId is required')
        const data = encodeFunctionData({
          abi: DAO_ABI,
          functionName: 'vote',
          args: [BigInt(q('proposalId')), q('support') !== 'false'],
        })
        return ok(DAO_ADDRESS, data, '0.0001')
      }

      default:
        return err(`Unknown action: ${action}`)
    }
  } catch (e: any) {
    return err(e?.message || 'Failed to encode transaction', 500)
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET' },
  })
}
