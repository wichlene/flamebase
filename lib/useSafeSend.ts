'use client'

import { useAccount, usePublicClient, useSendTransaction } from 'wagmi'
import { base } from 'wagmi/chains'
import { safeSend, type RawCall, type MinimalProvider } from './safeSend'

// Component-side convenience wrapper around safeSend: pulls the connected
// account/publicClient/connector from wagmi so call sites only pass the raw
// {to, data, value}. ABI-based calls (ERC20 approve, Aerodrome swaps, …)
// should encodeFunctionData() into this shape first — see Launchpad.tsx.
export function useSafeSend() {
  const { address, connector } = useAccount()
  const publicClient = usePublicClient()
  const { sendTransactionAsync } = useSendTransaction()

  return async (call: RawCall): Promise<`0x${string}`> => {
    if (!address || !publicClient) throw new Error('Wallet not connected')
    const isSmartWallet = connector?.id === 'farcaster'
    let provider: MinimalProvider | undefined
    if (isSmartWallet) {
      try { provider = (await connector?.getProvider()) as MinimalProvider } catch {}
    }
    return safeSend({
      call,
      account: address,
      publicClient,
      isSmartWallet,
      provider,
      sendTransaction: c => sendTransactionAsync({ chainId: base.id, to: c.to, data: c.data, value: c.value }),
    })
  }
}
