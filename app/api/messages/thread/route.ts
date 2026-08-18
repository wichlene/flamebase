import { NextResponse } from 'next/server'
import { getThread, convId, isAddr } from '@/lib/messageStore'
import { verifyWalletAuth, MESSAGES_AUTH_MAX_AGE_MS } from '@/lib/walletAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const a = searchParams.get('a') || ''
  const b = searchParams.get('b') || ''
  if (!isAddr(a) || !isAddr(b)) return NextResponse.json({ error: 'two valid addresses required' }, { status: 400 })
  const timestamp = Number(searchParams.get('ts'))
  const signature = searchParams.get('sig')
  // `a` is the viewer whose thread this is — proving control of `a` is what
  // gates reading it (the reverse mapping in getThread(convId(a,b), a) means
  // whoever passes as `a` sees `a`'s "delete for me" state, so this must be
  // the authenticated caller, not the peer).
  const ok = await verifyWalletAuth('messages', a, timestamp, signature, '', MESSAGES_AUTH_MAX_AGE_MS)
  if (!ok) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    // `a` is the viewer, so their "delete for me" clear point is applied.
    const messages = await getThread(convId(a, b), a)
    return NextResponse.json({ messages })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
