import { NextResponse } from 'next/server'
import { safeJson } from '../../../../lib/safeJson'

// Mints a short-lived, upload-only Pinata key so the browser can pin a file
// directly instead of streaming it through this function.
//
// The reason this route exists at all: a Vercel serverless function's request
// body is capped at 4.5 MB by the platform, before our code runs. Routing
// uploads through /api/upload therefore made that cap the app's real media
// limit (while the UI advertised 50 MB). Handing the browser a scoped key and
// letting it talk to Pinata directly takes our function out of the data path.
//
// The long-lived PINATA_JWT never leaves the server — only a key that expires
// shortly and can do nothing but pin does.

export const dynamic = 'force-dynamic'

// Long enough for a slow phone to finish a large video, short enough that a
// leaked key is worth little.
const KEY_TTL_SECONDS = 60 * 30

export async function POST() {
  if (!process.env.PINATA_JWT) {
    return NextResponse.json({ error: 'PINATA_JWT env var is missing on the server' }, { status: 500 })
  }

  try {
    const res = await fetch('https://api.pinata.cloud/users/generateApiKey', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keyName: `flamebase-upload-${Date.now()}`,
        permissions: { endpoints: { pinning: { pinFileToIPFS: true } } },
        maxUses: 1,
      }),
      signal: AbortSignal.timeout(10000),
    })

    const data = await safeJson<{ JWT?: string; error?: unknown }>(res)

    if (!res.ok || !data?.JWT) {
      // Log the upstream detail, return something generic. The client falls
      // back to the proxy route when this fails, so a failure here degrades
      // to "small uploads still work" rather than "uploads are broken".
      console.error('Pinata key mint failed', res.status, data)
      return NextResponse.json({ error: 'Could not authorize upload' }, { status: 502 })
    }

    return NextResponse.json(
      { jwt: data.JWT, expiresIn: KEY_TTL_SECONDS },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e: any) {
    console.error('upload/sign error', e)
    return NextResponse.json({ error: 'Could not authorize upload' }, { status: 500 })
  }
}
