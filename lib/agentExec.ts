'use client'

import { parseEther, parseUnits, encodeFunctionData, erc20Abi, isAddress } from 'viem'

// USDC on Base (6 decimals).
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

export type AgentAction = { tool: string; args: Record<string, unknown> }

type WalletLike = {
  account?: { address: `0x${string}` } | undefined
  // viem WalletClient.sendTransaction is deeply generic; accept loosely.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendTransaction: (args: any) => Promise<`0x${string}`>
}

/** Human-readable summary shown in the confirmation card before execution. */
export function describeAction(a: AgentAction): string {
  if (a.tool === 'send_token') {
    const { to, amount, token } = a.args as { to?: string; amount?: string; token?: string }
    return `Send ${amount} ${token} to ${to}`
  }
  return `Run ${a.tool}`
}

/** Validate an action's args; returns an error message or null if OK. */
export function validateAction(a: AgentAction): string | null {
  if (a.tool === 'send_token') {
    const { to, amount, token } = a.args as { to?: string; amount?: string; token?: string }
    if (!to || !isAddress(to)) return 'Invalid recipient address.'
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return 'Invalid amount.'
    if (token !== 'ETH' && token !== 'USDC') return 'Unsupported token (ETH or USDC only).'
    return null
  }
  return `Unsupported action: ${a.tool}`
}

/** Execute the action via the connected wallet. Returns the tx hash. */
export async function executeAction(a: AgentAction, wallet: WalletLike): Promise<`0x${string}`> {
  if (!wallet.account) throw new Error('Wallet not connected')

  if (a.tool === 'send_token') {
    const { to, amount, token } = a.args as { to: `0x${string}`; amount: string; token: string }
    if (token === 'ETH') {
      return wallet.sendTransaction({ to, value: parseEther(amount) })
    }
    // USDC ERC-20 transfer
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [to, parseUnits(amount, 6)],
    })
    return wallet.sendTransaction({ to: USDC_ADDRESS, data })
  }

  throw new Error(`Unsupported action: ${a.tool}`)
}
