import { verifyMessage } from 'viem'

// Proof-of-address-ownership for the notification endpoints. The client
// signs `authMessage(...)` with the connected wallet, and the server
// re-derives the same message and verifies the signature came from the
// claimed address. The timestamp bounds replay risk.
//
// `payload` binds the signature to the SPECIFIC sensitive data being
// submitted (a push subscription endpoint, a Farcaster fid, or a
// fid+url+token triple) — without it, a signature only proved "this address
// signed *something* for this action", not "this address authorized *this
// exact* subscription/fid/token". An attacker could get a victim to sign the
// generic action+address+timestamp message (nothing about it looks
// dangerous) and then replay that valid signature with the ATTACKER's own
// fid/endpoint/token in the request body, since only address+timestamp were
// ever checked — silently rerouting the victim's notifications. Binding the
// payload closes that: the signature is only valid for the exact data it
// was shown.
const MAX_AGE_MS = 5 * 60 * 1000

// Messages are polled every few seconds while a thread is open — requiring a
// fresh signature per request would mean a wallet popup every 3s. Instead the
// client signs ONCE per session (lib/messages, see components/Messages.tsx)
// and reuses that signature for every messages/* call within this window.
export const MESSAGES_AUTH_MAX_AGE_MS = 12 * 60 * 60 * 1000

export function authMessage(action: string, address: string, timestamp: number, payload = ''): string {
  return `FlameBase notifications\naction: ${action}\naddress: ${address.toLowerCase()}\ntimestamp: ${timestamp}\npayload: ${payload}`
}

export async function verifyWalletAuth(
  action: string,
  address: string | undefined | null,
  timestamp: number | undefined | null,
  signature: string | undefined | null,
  payload = '',
  maxAgeMs = MAX_AGE_MS,
): Promise<boolean> {
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return false
  if (!signature || typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return false
  if (Math.abs(Date.now() - timestamp) > maxAgeMs) return false
  try {
    return await verifyMessage({
      address: address as `0x${string}`,
      message: authMessage(action, address, timestamp, payload),
      signature: signature as `0x${string}`,
    })
  } catch {
    return false
  }
}
