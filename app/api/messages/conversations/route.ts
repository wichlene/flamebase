import { NextResponse } from 'next/server'
import { getConversations, isAddr, isDurable } from '@/lib/messageStore'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address') || ''
  if (!isAddr(address)) return NextResponse.json({ error: 'valid address required' }, { status: 400 })
  try {
    const conversations = await getConversations(address)
    return NextResponse.json({ conversations, durable: isDurable })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
