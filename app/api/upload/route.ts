import { NextResponse } from 'next/server'

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
      console.error('Pinata upload failed', response.status, data)
      return NextResponse.json({ error: data, status: response.status }, { status: 500 })
    }

    return NextResponse.json({ ipfsHash: data.IpfsHash })
  } catch (error: any) {
    console.error('Upload route error', error)
    return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 500 })
  }
}
