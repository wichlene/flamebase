import { http, fallback, type Transport } from 'viem'

// Shared Base RPC transport for every server-side cron/scan route. An
// Alchemy endpoint (if configured) goes first — a dedicated, non-shared RPC
// that doesn't hit the Cloudflare bot-challenges the free public RPCs
// increasingly throw at automated traffic (GitHub Actions' shared IP ranges
// got hit specifically: base.llamarpc.com started serving a "Just a
// moment..." challenge page instead of JSON-RPC responses, silently
// breaking notify-scan/leaderboard-scan/b20-scan with no code change on our
// side). Falls back to the public pool either way, so nothing breaks for
// anyone who hasn't set ALCHEMY_API_KEY.
export function baseRpcTransport(): Transport {
  const alchemyKey = process.env.ALCHEMY_API_KEY
  if (!alchemyKey) {
    // Surfaces in notify-scan's error body (it has a catch block that
    // returns the real error) instead of silently falling through to the
    // public pool and failing with an unrelated Cloudflare 403 — makes a
    // missing/misconfigured env var on the deploy immediately diagnosable.
    console.warn('ALCHEMY_API_KEY is not set — falling back to public Base RPCs only')
  }
  return fallback([
    ...(alchemyKey ? [http(`https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`)] : []),
    http('https://mainnet.base.org'),
    http('https://base.drpc.org'),
    http('https://base-rpc.publicnode.com'),
    http('https://base.llamarpc.com'),
  ])
}
