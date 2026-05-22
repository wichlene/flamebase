import { createConnector } from 'wagmi'
import { sdk } from '@farcaster/miniapp-sdk'
import { base } from 'wagmi/chains'

export function farcasterConnector() {
  return createConnector((config) => ({
    id: 'farcaster',
    name: 'Farcaster',
    type: 'farcaster' as const,

    async connect() {
      const provider = await sdk.wallet.getEthereumProvider()
      if (!provider) throw new Error('Farcaster wallet not available')
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as `0x${string}`[]
      const chainIdHex = (await provider.request({ method: 'eth_chainId' })) as string
      return { accounts, chainId: Number(chainIdHex) }
    },

    async disconnect() {},

    async getAccounts() {
      const provider = await sdk.wallet.getEthereumProvider()
      if (!provider) return []
      return (await provider.request({ method: 'eth_accounts' })) as `0x${string}`[]
    },

    async getChainId() {
      const provider = await sdk.wallet.getEthereumProvider()
      if (!provider) return base.id
      const hex = (await provider.request({ method: 'eth_chainId' })) as string
      return Number(hex)
    },

    async getProvider() {
      return sdk.wallet.getEthereumProvider()
    },

    async isAuthorized() {
      try {
        const provider = await sdk.wallet.getEthereumProvider()
        if (!provider) return false
        const accs = (await provider.request({ method: 'eth_accounts' })) as string[]
        return accs.length > 0
      } catch {
        return false
      }
    },

    onAccountsChanged(accounts) {
      config.emitter.emit('change', { accounts: accounts as `0x${string}`[] })
    },

    onChainChanged(chainId) {
      config.emitter.emit('change', { chainId: Number(chainId) })
    },

    onDisconnect() {
      config.emitter.emit('disconnect')
    },
  }))
}
