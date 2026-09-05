import { createPublicClient, http, fallback, decodeAbiParameters, parseAbiParameters, parseAbiItem } from 'viem'
import { base } from 'viem/chains'
import { getAttestationUID, setAttestationUID } from './talentStore'

// Reads a wallet's real Talent Protocol Builder Score straight from the EAS
// attestation the user themselves published on Base (via "Attest onchain" on
// talentprotocol.com) — no Talent API key involved, just the same public
// on-chain record anyone can verify. Confirmed against a real attestation:
// schema https://base.easscan.org/schema/view/0x9bba0ee6d4f74ab182e84e86c5c873ac5a37ef97f98ff7750f5dec7c3ac1edc7

const EAS_ADDRESS = '0x4200000000000000000000000000000000000021' as const
export const TALENT_SCHEMA_UID = '0x9bba0ee6d4f74ab182e84e86c5c873ac5a37ef97f98ff7750f5dec7c3ac1edc7' as const

const ATTESTED_EVENT = parseAbiItem(
  'event Attested(address indexed recipient, address indexed attester, bytes32 uid, bytes32 indexed schema)'
)

const EAS_ABI = [{
  type: 'function', name: 'getAttestation', stateMutability: 'view',
  inputs: [{ name: 'uid', type: 'bytes32' }],
  outputs: [{
    type: 'tuple', components: [
      { name: 'uid', type: 'bytes32' }, { name: 'schema', type: 'bytes32' },
      { name: 'time', type: 'uint64' }, { name: 'expirationTime', type: 'uint64' },
      { name: 'revocationTime', type: 'uint64' }, { name: 'refUID', type: 'bytes32' },
      { name: 'recipient', type: 'address' }, { name: 'attester', type: 'address' },
      { name: 'revocable', type: 'bool' }, { name: 'data', type: 'bytes' },
    ],
  }],
}] as const

// Field order/types exactly as published in Talent's schema (see comment
// above). Only the trailing fields we actually display are named below.
const TALENT_SCHEMA_FIELDS = parseAbiParameters(
  'string spec_version, address wallet, address[] extra_wallets, bytes[] ownership_proofs, ' +
  'bytes recipient_ownership_proof, uint64 proofs_issued_at, string github_handle, ' +
  'uint16 score, uint64 computed_at, uint64 block_number, string verify_url, string[] badges'
)

const client = createPublicClient({
  chain: base,
  transport: fallback([
    http('https://mainnet.base.org'),
    http('https://base.drpc.org'),
    http('https://base-rpc.publicnode.com'),
    http('https://base.llamarpc.com'),
  ]),
})

export type TalentBuilderScore = {
  score: number
  githubHandle: string
  verifyUrl: string
  badges: string[]
}

const CHUNK = 9000n
// The Talent Protocol EAS schema was only created 2026-08-18 (~18 days
// before this was written) — no attestation under it can be older than
// that, so a bounded backward scan is enough; no need to walk to genesis.
const MAX_CHUNKS = 100

// Attestations aren't indexed anywhere queryable by recipient except via
// logs, and we don't run our own indexer for this — so on a cache miss, walk
// backward from the chain tip looking for this address's Attested event
// under Talent's schema, and cache the UID once found so every later view is
// a single instant Redis read + one getAttestation call.
async function findAttestationUID(address: `0x${string}`): Promise<`0x${string}` | null> {
  const latest = await client.getBlockNumber()
  let to = latest
  for (let i = 0; i < MAX_CHUNKS && to > 0n; i++) {
    const from = to > CHUNK ? to - CHUNK : 0n
    const logs = await client.getLogs({
      address: EAS_ADDRESS,
      event: ATTESTED_EVENT,
      args: { recipient: address, schema: TALENT_SCHEMA_UID },
      fromBlock: from,
      toBlock: to,
    }).catch(() => [])
    if (logs.length > 0) {
      // Latest attestation wins if the user re-attested more than once.
      return logs[logs.length - 1].args.uid as `0x${string}`
    }
    to = from - 1n
  }
  return null
}

export async function getTalentBuilderScore(address: string): Promise<TalentBuilderScore | null> {
  const addr = address.toLowerCase() as `0x${string}`
  let uid = await getAttestationUID(addr)
  if (!uid) {
    const found = await findAttestationUID(addr)
    if (!found) return null
    uid = found
    await setAttestationUID(addr, uid)
  }

  const att = await client.readContract({
    address: EAS_ADDRESS, abi: EAS_ABI, functionName: 'getAttestation', args: [uid as `0x${string}`],
  })
  if (!att || att.revocationTime > 0n || /^0x0+$/.test(att.uid)) return null

  const decoded = decodeAbiParameters(TALENT_SCHEMA_FIELDS, att.data)
  const [, , , , , , githubHandle, score, , , verifyUrl, badges] = decoded as unknown as [
    string, string, string[], string[], string, bigint, string, number, bigint, bigint, string, string[]
  ]
  return { score: Number(score), githubHandle, verifyUrl, badges }
}
