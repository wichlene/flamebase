import { NextResponse } from 'next/server'
import { addMessage, isAddr } from '@/lib/messageStore'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid body' }, { status: 400 }) }
  const from = String(body?.from || '')
  const to = String(body?.to || '')
  const text = String(body?.text || '').trim()
  if (!isAddr(from) || !isAddr(to)) return NextResponse.json({ error: 'valid from/to required' }, { status: 400 })
  if (from.toLowerCase() === to.toLowerCase()) return NextResponse.json({ error: 'cannot message yourself' }, { status: 400 })
  if (!text) return NextResponse.json({ error: 'empty message' }, { status: 400 })
  try {
    const message = await addMessage(from, to, text)
    return NextResponse.json({ message })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 })
  }
}
