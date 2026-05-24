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

    // 3. Create metadata JSON (same metadata for all tokens since baseURI + tokenId)
    const metadata = {
      name: 'FlameBase Logo',
      description: 'Official FlameBase NFT — the first on-chain social network on Base. Holders are recognized as early supporters of the FlameBase community.',
      image: `ipfs://${imageHash}`,
      external_url: 'https://flamebase.xyz',
      attributes: [
        { trait_type: 'Type', value: 'Official Logo' },
        { trait_type: 'Network', value: 'Base' },
        { trait_type: 'Project', value: 'FlameBase' },
      ],
    }

    const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' })
    const metadataForm = new FormData()
    metadataForm.append('file', metadataBlob, 'flamebase-logo-metadata.json')
    metadataForm.append('pinataMetadata', JSON.stringify({ name: 'flamebase-logo-metadata.json' }))
    metadataForm.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))

    const metaRes = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
      body: metadataForm,
    })
    const metaData = await metaRes.json()
    if (!metaRes.ok || !metaData.IpfsHash) {
      return NextResponse.json({ error: 'Metadata upload failed', detail: metaData }, { status: 500 })
    }

    return NextResponse.json({
      imageHash,
      metadataHash: metaData.IpfsHash,
      baseURI: `ipfs://${metaData.IpfsHash}/`,
      imageUrl: `https://gateway.pinata.cloud/ipfs/${imageHash}`,
      metadataUrl: `https://gateway.pinata.cloud/ipfs/${metaData.IpfsHash}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Setup failed'
    console.error('setup-logo-nft error', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
