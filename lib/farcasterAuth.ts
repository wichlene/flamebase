import { createClient } from '@farcaster/quick-auth'

// Verifies Farcaster Quick Auth JWTs — Farcaster's own cryptographic proof
// that a given browser session is genuinely signed in as a specific FID
// (obtained via the mini-app host's native SIWF flow, not anything a caller
// can forge client-side). This is the missing piece that made
// /api/farcaster/link exploitable: a wallet signature alone only proves
// control of an address, never that the address's owner actually controls
// the FID they're claiming — anyone could sign a message asserting ANY fid.
// Quick Auth's JWT `sub` claim is the real, server-verified fid.
const quickAuthClient = createClient()

// Must match the domain the mini-app manifest/SIWF flow was issued for.
const DOMAIN = 'flamebase.xyz'

export async function verifyFarcasterFid(token: unknown, expectedFid: number): Promise<boolean> {
  if (typeof token !== 'string' || !token || !expectedFid) return false
  try {
    const payload = await quickAuthClient.verifyJwt({ token, domain: DOMAIN })
    // The JWT `sub` claim is a standard JWT string claim at the type level
    // (jose's generic JWTPayload) even though Farcaster always puts a plain
    // fid number in it — compare numerically rather than assuming the
    // runtime value's exact string/number shape.
    return Number(payload.sub) === expectedFid
  } catch {
    return false
  }
}
