import { NextResponse } from 'next/server'
import { getThread, convId, isAddr } from '@/lib/messageStore'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const a = searchParams.get('a') || ''
  const b = searchParams.get('b') || ''
  if (!isAddr(a) || !isAddr(b)) return NextResponse.json({ error: 'two valid addresses required' }, { status: 400 })
  try {
    // `a` is the viewer, so their "delete for me" clear point is applied.
    const messages = await getThread(convId(a, b), a)
    return NextResponse.json({ messages })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
