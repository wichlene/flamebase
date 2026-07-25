'use client'

import { useAccount, usePublicClient, useSendTransaction } from 'wagmi'
import { base } from 'wagmi/chains'
import { BUILDER_CODE_DATA_SUFFIX } from './builderCode'
import { safeSend, type RawCall, type MinimalProvider } from './safeSend'

// Component-side convenience wrapper around safeSend: pulls the connected
// account/publicClient/connector from wagmi so call sites only pass the raw
// {to, data, value}. ABI-based calls (ERC20 approve, Aerodrome swaps, …)
// should encodeFunctionData() into this shape first — see Launchpad.tsx.
//
// Applies Base Builder Code attribution to every call: unconditionally for
// classic (non-smart-wallet) sends, and as a try-first/fall-back-without-it
// attempt for smart wallets (see safeSend's dataSuffix handling) since a
// past host's confirmation preview once choked on the extra calldata bytes.
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
      dataSuffix: BUILDER_CODE_DATA_SUFFIX,
      sendTransaction: c => sendTransactionAsync({
        chainId: base.id,
        to: c.to,
        data: (!isSmartWallet && c.data) ? ((c.data + BUILDER_CODE_DATA_SUFFIX.slice(2)) as `0x${string}`) : c.data,
        value: c.value,
      }),
    })
  }
}
