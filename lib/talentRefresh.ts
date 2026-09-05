'use client'

import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from '@x402/fetch'
import { ExactEvmScheme } from '@x402/evm/exact/client'

// Same shape/pattern as lib/premiumAI.ts's askPremium — see that file for why
// the signer is wrapped this way (defense-in-depth against a compromised
// response asking the wallet to sign a bigger/different payment).
type WalletLike = {
  account?: { address: `0x${string}` } | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTypedData: (args: any) => Promise<`0x${string}`>
}

export type TalentRefreshResult = {
  score?: number
  badges?: string[]
  verifyUrl?: string
  paymentTx?: string
  status: number
  error?: string
}

const X402_PAY_TO = (process.env.NEXT_PUBLIC_X402_PAY_TO || '0xa77A5D4D37d6F39C20C2441295da9fA60Ab9fD69').toLowerCase()
// $0.05 USDC at 6 decimals = 50000 units. Same 10x safety margin as the
// $0.01 premium-AI flow uses relative to its own fee.
const MAX_AUTHORIZED_UNITS = 500000n

/**
 * Pay $0.05 USDC on Base to force-rescan the chain for a newer Talent
 * Protocol Builder Score attestation. Only actually charges if the server
 * performs the rescan (see app/api/talent-score/refresh's cooldown check) —
 * a request inside the 3-day cooldown settles nothing.
 */
export async function refreshTalentScore(walletClient: WalletLike): Promise<TalentRefreshResult> {
  const account = walletClient.account
  if (!account) throw new Error('Wallet not connected')
  if (account.address.toLowerCase() === X402_PAY_TO) {
    return { status: 0, error: "this wallet is FlameBase's own payout wallet — it can't pay itself." }
  }

  const signer = {
    address: account.address,
    signTypedData: (msg: {
      domain: Record<string, unknown>
      types: Record<string, unknown>
      primaryType: string
      message: Record<string, unknown>
    }) => {
      const m = msg.message as { to?: unknown; value?: unknown }
      if (typeof m?.to === 'string' && m.to.toLowerCase() !== X402_PAY_TO) {
        throw new Error('Payment blocked: unexpected recipient.')
      }
      if (m?.value !== undefined) {
        let v: bigint
        try { v = BigInt(m.value as string | number | bigint) } catch { throw new Error('Payment blocked: unreadable amount.') }
        if (v > MAX_AUTHORIZED_UNITS) throw new Error('Payment blocked: amount exceeds the $0.05 fee.')
      }
      return walletClient.signTypedData({
        account, domain: msg.domain, types: msg.types, primaryType: msg.primaryType, message: msg.message,
      })
    },
  }

  const client = new x402Client()
  client.register('eip155:*', new ExactEvmScheme(signer))

  let settlement: string | null = null
  const captureFetch: typeof fetch = async (input, init) => {
    const r = await fetch(input, init)
    const h = r.headers.get('payment-response') || r.headers.get('x-payment-response')
    if (h) settlement = h
    return r
  }

  const fetchWithPay = wrapFetchWithPayment(captureFetch, client)
  const res = await fetchWithPay('/api/talent-score/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ address: account.address }),
  })

  const data = await res.json().catch(() => null)
  let paymentTx: string | undefined
  if (settlement) {
    try { paymentTx = decodePaymentResponseHeader(settlement).transaction } catch {}
  }

  const error = data && typeof data === 'object' && typeof data.error === 'string' ? data.error : undefined
  if (!res.ok || error) return { status: res.status, error: error || `Refresh failed (HTTP ${res.status})` }

  return { status: res.status, score: data?.score ?? undefined, badges: data?.badges, verifyUrl: data?.verifyUrl, paymentTx }
}
