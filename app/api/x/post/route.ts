import { NextRequest, NextResponse } from 'next/server'
import { generateAndPost, generatePost } from '../../../../lib/xPost'

// Generate + post to X. Secret-protected (Vercel Cron bearer, x-notify-secret,
// or ?key=). `?dry=1` returns the generated text WITHOUT posting — lets you
// preview the content (needs only Groq, no X keys yet).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') || ''
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) return true
  const key = req.headers.get('x-notify-secret') || req.nextUrl.searchParams.get('key') || ''
  return Boolean(process.env.NOTIFY_SECRET) && key === process.env.NOTIFY_SECRET
}

async function handle(req: NextRequest, dry: boolean) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  try {
    if (dry) return NextResponse.json({ ok: true, dryRun: true, text: await generatePost() })
    const r = await generateAndPost()
    return NextResponse.json({ ok: true, ...r })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message || 'failed' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return handle(req, req.nextUrl.searchParams.get('dry') === '1')
}
export async function POST(req: NextRequest) {
  return handle(req, req.nextUrl.searchParams.get('dry') === '1')
}
