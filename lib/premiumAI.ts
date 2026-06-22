'use client'

import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from '@x402/fetch'
import { ExactEvmScheme } from '@x402/evm/exact/client'

// Minimal shape we need from a wagmi/viem WalletClient: the connected account
// and EIP-712 typed-data signing. The x402 "exact" base flow on Base only
// needs address + signTypedData (USDC supports EIP-3009 transferWithAuthorization).
type WalletLike = {
  account?: { address: `0x${string}` } | undefined
  signTypedData: (args: {
    account: { address: `0x${string}` }
    domain: Record<string, unknown>
    types: Record<string, unknown>
    primaryType: string
    message: Record<string, unknown>
  }) => Promise<`0x${string}`>
}

export type PremiumResult = {
  content?: string
  txHash?: string
  status: number
}

/**
 * Ask the x402-gated premium AI endpoint, paying $0.01 USDC on Base with the
 * connected wallet. The wallet prompts the user to sign the payment
 * authorization (gasless — the facilitator submits the settlement tx, which is
 * attributed to FlameBase via its Builder Code).
 */
export async function askPremium(
  walletClient: WalletLike,
  messages: { role: 'user' | 'assistant'; content: string }[],
): Promise<PremiumResult> {
  const account = walletClient.account
  if (!account) throw new Error('Wallet not connected')

  const signer = {
    address: account.address,
    signTypedData: (msg: {
      domain: Record<string, unknown>
      types: Record<string, unknown>
      primaryType: string
      message: Record<string, unknown>
    }) =>
      walletClient.signTypedData({
        account,
        domain: msg.domain,
        types: msg.types,
        primaryType: msg.primaryType,
        message: msg.message,
      }),
  }

  const client = new x402Client()
  client.register('eip155:*', new ExactEvmScheme(signer))

  // Capture the settlement header at the raw-fetch level (the wrapper consumes
  // it). The Next adapter emits it as `payment-response`.
  let settlement: string | null = null
  const captureFetch: typeof fetch = async (input, init) => {
    const r = await fetch(input, init)
    const h = r.headers.get('payment-response') || r.headers.get('x-payment-response')
    if (h) settlement = h
    return r
  }

  const fetchWithPay = wrapFetchWithPayment(captureFetch, client)
  const res = await fetchWithPay('/api/premium', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })

  const data = await res.json().catch(() => ({}))
  let txHash: string | undefined
  if (settlement) {
    try {
      txHash = decodePaymentResponseHeader(settlement).transaction
    } catch {}
  }
  return { content: data.content, txHash, status: res.status }
}
