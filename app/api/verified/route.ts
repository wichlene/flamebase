import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'

const COINBASE_ATTESTER = '0x357458739F90461b99789350868CD7CF330Dd7EE'
const VERIFIED_ACCOUNT_SCHEMA = '0xf8b05c79f090979bf4a80270aba232dff11a10d9ca55c4f88de95317970f0de9'
const EAS_GRAPHQL = 'https://base.easscan.org/graphql'

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ verified: false })
  }

  try {
    const res = await fetch(EAS_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query CheckVerified($recipient: String!, $attester: String!, $schema: String!) {
          attestations(
            where: {
              recipient: { equals: $recipient }
              attester: { equals: $attester }
              schemaId: { equals: $schema }
              revoked: { equals: false }
            }
            take: 1
          ) { id }
        }`,
        variables: {
          // EAS stores `recipient` checksummed and filters case-sensitively —
          // a lowercased address never matches, so the badge never showed.
          recipient: getAddress(address),
          attester: COINBASE_ATTESTER,
          schema: VERIFIED_ACCOUNT_SCHEMA,
        },
      }),
      signal: AbortSignal.timeout(5000),
    })

    const data = await res.json()
    const verified = (data?.data?.attestations?.length ?? 0) > 0
    return NextResponse.json({ verified }, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    })
  } catch {
    return NextResponse.json({ verified: false })
  }
}
