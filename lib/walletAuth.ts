import { verifyMessage } from 'viem'

// Proof-of-address-ownership for the notification endpoints. Without this,
// anyone could POST an arbitrary wallet address to /api/notifications/subscribe
// or /api/farcaster/link and hijack that address's incoming like/comment/tip
// notifications — the client signs `authMessage(...)` with the connected
// wallet, and the server re-derives the same message and verifies the
// signature came from the claimed address. The timestamp bounds replay risk.
const MAX_AGE_MS = 5 * 60 * 1000

export function authMessage(action: string, address: string, timestamp: number): string {
  return `FlameBase notifications\naction: ${action}\naddress: ${address.toLowerCase()}\ntimestamp: ${timestamp}`
}

export async function verifyWalletAuth(
  action: string,
  address: string | undefined | null,
  timestamp: number | undefined | null,
  signature: string | undefined | null,
): Promise<boolean> {
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return false
  if (!signature || typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return false
  if (Math.abs(Date.now() - timestamp) > MAX_AGE_MS) return false
  try {
    return await verifyMessage({
      address: address as `0x${string}`,
      message: authMessage(action, address, timestamp),
      signature: signature as `0x${string}`,
    })
  } catch {
    return false
  }
}
