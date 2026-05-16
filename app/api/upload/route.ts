import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file' }, { status: 400 })
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

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json({ error: data }, { status: 500 })
    }

    return NextResponse.json({ ipfsHash: data.IpfsHash })
  } catch (error) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
