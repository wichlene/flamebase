import { NextResponse } from 'next/server'
import { clearConversationForUser, isAddr } from '@/lib/messageStore'

export const dynamic = 'force-dynamic'

// "Delete for me": hide a conversation for the requesting address only. The
// convId must contain that address, so a caller can only clear their own
// conversations — never the peer's copy.
export async function POST(req: Request) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }
  const address = String(body?.address || '')
  const convId = String(body?.convId || '')
  if (!isAddr(address)) return NextResponse.json({ error: 'valid address required' }, { status: 400 })
  if (!convId.includes('_') || !convId.toLowerCase().includes(address.toLowerCase())) {
    return NextResponse.json({ error: 'convId must be one of your conversations' }, { status: 400 })
  }
  try {
    await clearConversationForUser(address, convId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
