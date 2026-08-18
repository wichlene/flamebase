import { NextResponse } from 'next/server'
import { getConversations, isAddr, isDurable } from '@/lib/messageStore'
import { verifyWalletAuth, MESSAGES_AUTH_MAX_AGE_MS } from '@/lib/walletAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address') || ''
  if (!isAddr(address)) return NextResponse.json({ error: 'valid address required' }, { status: 400 })
  const timestamp = Number(searchParams.get('ts'))
  const signature = searchParams.get('sig')
  const ok = await verifyWalletAuth('messages', address, timestamp, signature, '', MESSAGES_AUTH_MAX_AGE_MS)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const conversations = await getConversations(address)
    return NextResponse.json({ conversations, durable: isDurable })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
