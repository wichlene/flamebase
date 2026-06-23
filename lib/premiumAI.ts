'use client'

import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from '@x402/fetch'
import { ExactEvmScheme } from '@x402/evm/exact/client'

// Minimal shape we need from a wagmi/viem WalletClient: the connected account
// and EIP-712 typed-data signing. The x402 "exact" base flow on Base only
// needs address + signTypedData (USDC supports EIP-3009 transferWithAuthorization).
type WalletLike = {
  account?: { address: `0x${string}` } | undefined
  // viem's WalletClient.signTypedData is a deeply generic method; accept it
  // loosely so a wagmi wallet client satisfies this type at the call site.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signTypedData: (args: any) => Promise<`0x${string}`>
}

export type AgentReply =
  | { type: 'text'; content: string }
  | { type: 'action'; tool: string; args: Record<string, unknown>; note?: string }
  | { type: 'error'; content: string }

export type PremiumResult = {
  reply?: AgentReply
  // x402 settlement tx for the $0.01 premium fee.
  paymentTx?: string
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

  const data = await res.json().catch(() => null)
  let paymentTx: string | undefined
  if (settlement) {
    try {
      paymentTx = decodePaymentResponseHeader(settlement).transaction
    } catch {}
  }

  // Surface the real failure instead of a generic message: if the server didn't
  // return a well-formed AgentReply (e.g. a 5xx/timeout with an HTML or empty
  // body), build an error reply from the status so the user sees what happened.
  const reply: AgentReply | undefined =
    data && typeof data === 'object' && 'type' in data
      ? (data as AgentReply)
      : res.status === 402
        ? undefined
        : { type: 'error', content: `The AI request failed (HTTP ${res.status}). Please try again in a moment.` }

  return { reply, paymentTx, status: res.status }
}
