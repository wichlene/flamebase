import { NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import path from 'path'

export async function POST() {
  try {
    if (!process.env.PINATA_JWT) {
      return NextResponse.json({ error: 'PINATA_JWT env var is missing' }, { status: 500 })
    }

    // 1. Read logo from public folder
    const logoPath = path.join(process.cwd(), 'public', 'logo.png')
    const logoBuffer = await readFile(logoPath)
    const logoBlob = new Blob([new Uint8Array(logoBuffer)], { type: 'image/png' })

    // 2. Upload logo image to Pinata
    const imageForm = new FormData()
    imageForm.append('file', logoBlob, 'flamebase-logo.png')
    imageForm.append('pinataMetadata', JSON.stringify({ name: 'flamebase-logo.png' }))
    imageForm.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))

    const imageRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
      body: imageForm,
    })
    const imageData = await imageRes.json()
    if (!imageRes.ok || !imageData.IpfsHash) {
      return NextResponse.json({ error: 'Image upload failed', detail: imageData }, { status: 500 })
    }
    const imageHash = imageData.IpfsHash

    // 3. baseURI → our own API endpoint.
    //    tokenURI(n) = baseURI + n  →  https://flamebase.xyz/api/nft-metadata/<n>
    //    The metadata API always returns the same JSON, so every token gets the image.
    const baseURI = 'https://flamebase.xyz/api/nft-metadata/'

    return NextResponse.json({
      imageHash,
      baseURI,
      imageUrl: `https://gateway.pinata.cloud/ipfs/${imageHash}`,
      imageIpfs: `ipfs://${imageHash}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Setup failed'
    console.error('setup-logo-nft error', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
