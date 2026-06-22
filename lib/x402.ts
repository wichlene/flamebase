import { x402ResourceServer, HTTPFacilitatorClient } from '@x402/core/server'
import { ExactEvmScheme } from '@x402/evm/exact/server'
import { facilitator } from '@coinbase/x402'
import { BUILDER_CODE, declareBuilderCodeExtension } from '@x402/extensions/builder-code'

// FlameBase's Base Builder Code (from dashboard.base.org → Settings → Builder
// Codes). It is public onchain data, not a secret — env override is supported
// for flexibility. Every x402 payment settled through the routes below gets
// this code appended to the settlement calldata (ERC-8021 Schema 2), so the
// transaction is attributed to FlameBase for Base builder rewards.
export const FLAMEBASE_BUILDER_CODE = process.env.BUILDER_CODE || 'bc_m8fvx957'

// Address that receives the x402 micropayments (FlameBase main wallet on
// Base). Public on-chain data; env override supported.
export const X402_PAY_TO =
  process.env.X402_PAY_TO || '0xa77A5D4D37d6F39C20C2441295da9fA60Ab9fD69'

// Base mainnet.
export const X402_NETWORK = 'eip155:8453' as const

// The CDP facilitator settles payments on Base. It reads CDP_API_KEY_ID /
// CDP_API_KEY_SECRET from the environment (required for mainnet settlement).
// The resource server must sync the facilitator's supported kinds before it
// can issue 402 challenges or settle, so this is ON by default. It can be
// disabled with X402_SYNC_FACILITATOR=false (e.g. in offline/test sandboxes
// where the facilitator is unreachable).
export const x402SyncOnStart = process.env.X402_SYNC_FACILITATOR !== 'false'

let _server: x402ResourceServer | null = null

/** Lazily-built, shared x402 resource server (one per server process). */
export function getX402Server(): x402ResourceServer {
  if (!_server) {
    _server = new x402ResourceServer(new HTTPFacilitatorClient(facilitator)).register(
      X402_NETWORK,
      new ExactEvmScheme(),
    )
  }
  return _server
}

/** Builder-code extension entry for a route's `extensions` map. */
export function builderCodeExtension() {
  return { [BUILDER_CODE]: declareBuilderCodeExtension(FLAMEBASE_BUILDER_CODE) }
}
