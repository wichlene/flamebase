import { NextResponse } from 'next/server'

// Fallback upload path. The primary path is now browser -> Pinata directly
// (see lib/uploadMedia.ts + app/api/upload/sign), because Vercel caps a
// function's request body at 4.5 MB at the platform edge — anything larger
// never reaches this handler at all. This route still serves small uploads
// and covers the case where minting a scoped Pinata key fails.
export const maxDuration = 60

// Matches the platform ceiling rather than the old 50 MB, which was
// unreachable here and only served to make the real failure confusing.
const MAX_PROXY_BYTES = 4 * 1024 * 1024

export async function POST(request: Request) {
  try {
    if (!process.env.PINATA_JWT) {
      return NextResponse.json({ error: 'PINATA_JWT env var is missing on the server' }, { status: 500 })
    }

    const formData = await request.formData() as unknown as globalThis.FormData
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file' }, { status: 400 })
    }
    if (file.size > MAX_PROXY_BYTES) {
      return NextResponse.json(
        { error: 'File too large for the fallback upload path — the direct upload should have handled this.' },
        { status: 413 },
      )
    }
    if (!/^(image|video)\//.test(file.type)) {
      return NextResponse.json({ error: 'Only image or video files are allowed' }, { status: 415 })
    }

    const pinataFormData = new FormData()
    pinataFormData.append('file', file)
    pinataFormData.append('pinataMetadata', JSON.stringify({ name: file.name }))
    pinataFormData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))

    const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
      },
      body: pinataFormData,
    })

    const text = await response.text()
    let data: any
    try { data = JSON.parse(text) } catch { data = { raw: text } }

    if (!response.ok) {
      // Log the upstream detail server-side, but don't echo the raw Pinata
      // response body back to the client.
      console.error('Pinata upload failed', response.status, data)
      return NextResponse.json({ error: 'Upload failed' }, { status: 502 })
    }

    return NextResponse.json({ ipfsHash: data.IpfsHash })
  } catch (error: any) {
    console.error('Upload route error', error)
    return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 500 })
  }
}
