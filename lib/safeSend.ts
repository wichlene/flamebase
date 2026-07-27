import { decodeEventLog, parseAbiItem } from 'viem'
import { base } from 'wagmi/chains'

// Shared safety wrapper for RAW {to, data, value} calls, used everywhere a
// transaction leaves the app — the main feed (app/page.tsx has its own
// ABI-based writeContractAsync but follows the exact same steps), the DEX
// (Launchpad.tsx), and the AI agent (agentExec.ts). All three can be driven
// from inside the Base App / Farcaster mini-app, where the connected wallet
// is an ERC-4337 Coinbase Smart Wallet: EntryPoint.handleOps can report the
// OUTER transaction "Success" even when the INNER UserOperation (our actual
// call) reverted, and the classic eth_sendTransaction path often fails
// outright for smart-wallet contract calls. This module centralizes: (1) a
// pre-flight eth_call simulation that surfaces the real revert reason before
// the wallet ever prompts, (2) the EIP-5792 wallet_sendCalls route with
// version-shape negotiation, and (3) decoding UserOperationEvent to catch a
// "successful" outer tx that actually failed inside.

export type RawCall = { to: `0x${string}`; data?: `0x${string}`; value?: bigint }

export type MinimalPublicClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  call: (args: any) => Promise<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTransactionReceipt: (args: any) => Promise<any>
}

export type MinimalProvider = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: (args: { method: string; params?: any[] }) => Promise<any>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractRevertReason(err: any): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let node: any = err
  for (let i = 0; node && i < 8; i++) {
    const name: string = node?.name || ''
    if (name === 'ContractFunctionRevertedError') {
      return node?.reason || node?.shortMessage || ''
    }
    const sm: string = (node?.shortMessage || node?.details || '').toString()
    if (/revert|execution reverted/i.test(sm)) {
      const reasonMatch = sm.match(/reverted with the following reason:\s*(.+)/i)
      if (reasonMatch) return reasonMatch[1].trim()
      const sigMatch = sm.match(/reverted with the following signature:\s*\n?\s*(0x[0-9a-fA-F]+)/i)
      if (sigMatch) return `unrecognized error ${sigMatch[1]}`
      const execMatch = sm.match(/execution reverted:?\s*(.+)/i)
      if (execMatch && execMatch[1].trim()) return execMatch[1].trim()
      return sm.split('\n')[0].trim()
    }
    node = node?.cause
  }
  return ''
}

async function preflightSimulate(publicClient: MinimalPublicClient, account: `0x${string}`, call: RawCall) {
  try {
    await publicClient.call({ account, to: call.to, data: call.data, value: call.value })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (simErr: any) {
    const reason = extractRevertReason(simErr)
    if (reason) throw new Error(`CONTRACT_REVERT:${reason}`)
    // Not a recognizable revert (RPC noise, timeout, etc.) — let the tx
    // through rather than block a possibly-valid action.
  }
}

async function sendViaEip5792(
  provider: MinimalProvider,
  account: `0x${string}`,
  call: RawCall,
  publicClient: MinimalPublicClient,
): Promise<`0x${string}`> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const callParam: any = { to: call.to, data: call.data ?? '0x' }
  if (call.value) callParam.value = `0x${call.value.toString(16)}`
  const chainIdHex = `0x${base.id.toString(16)}`

  // EIP-5792 changed shape across versions (Base App / Farcaster hosts moved
  // to "2.0.0" — see app/page.tsx's writeContractAsync for the full story).
  // Try current shape first, then legacy "1.0" for older hosts.
  const shapes = [
    { version: '2.0.0', from: account, chainId: chainIdHex, atomicRequired: false, calls: [callParam] },
    { version: '1.0', chainId: chainIdHex, from: account, calls: [callParam] },
  ]
  let id: string | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastErr: any
  for (const params of shapes) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await provider.request({ method: 'wallet_sendCalls', params: [params] })
      id = typeof res === 'string' ? res : res?.id
      break
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (sendErr: any) {
      const code = sendErr?.code
      const msg = (sendErr?.message || '').toLowerCase()
      const userRejected =
        code === 4001 || msg.includes('user rejected') || msg.includes('user denied') || msg.includes('rejected the request')
      if (userRejected) throw sendErr
      const wrongShape =
        code === -32601 || code === 4200 || code === -32602 ||
        msg.includes('not support') || msg.includes('unsupported') ||
        msg.includes('method not found') || msg.includes('invalid param')
      lastErr = sendErr
      if (!wrongShape) throw sendErr
    }
  }
  if (!id) throw lastErr || new Error('wallet_sendCalls failed')

  let hash: `0x${string}` | undefined
  let callStatus: string | undefined
  for (let i = 0; i < 14 && !hash; i++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const st: any = await provider.request({ method: 'wallet_getCallsStatus', params: [id] })
      const receipt = st?.receipts?.[0]
      const h = receipt?.transactionHash
      if (h) {
        hash = h as `0x${string}`
        const rStatus = (receipt?.status ?? '').toString().toLowerCase()
        const bStatus = (st?.status ?? '').toString().toLowerCase()
        if (rStatus === '0x0' || rStatus === 'reverted' || bStatus === 'failed' || bStatus === '400' || bStatus === '500') {
          callStatus = 'reverted'
        }
      }
    } catch {}
    if (!hash) await new Promise(r => setTimeout(r, 1500))
  }
  if (callStatus === 'reverted') throw new Error('CONTRACT_REVERT:transaction reverted on-chain')
  // Didn't resolve in time — `id` is a bundle id, not a real tx hash. Surface
  // as an unknown outcome rather than silently treating it as success.
  if (!hash) throw new Error(`PENDING_UNCONFIRMED:${id}`)

  // ERC-4337 smart wallets route the call through EntryPoint.handleOps, which
  // reports the OUTER transaction as successful even when the INNER
  // UserOperation reverted — the real per-op outcome is only recorded in a
  // UserOperationEvent(...,bool success,...) log. Fetch the real receipt and
  // check it directly.
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash })
    const uoAbi = parseAbiItem(
      'event UserOperationEvent(bytes32 indexed userOpHash, address indexed sender, address indexed paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)'
    )
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: [uoAbi], data: log.data, topics: log.topics })
        if (decoded.eventName === 'UserOperationEvent' && (decoded.args as { success: boolean }).success === false) {
          throw new Error('CONTRACT_REVERT:transaction reverted on-chain (inner call failed)')
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (decodeErr: any) {
        if (decodeErr?.message?.startsWith('CONTRACT_REVERT:')) throw decodeErr
        // Not a UserOperationEvent log (or an unrecognized shape) — keep scanning.
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (receiptErr: any) {
    if (receiptErr?.message?.startsWith('CONTRACT_REVERT:')) throw receiptErr
    // RPC hiccup fetching the receipt — we already have a resolved hash from
    // the wallet, so don't block a possibly-successful tx on this.
  }

  return hash
}

/**
 * Send a raw {to, data, value} call with full smart-wallet safety: pre-flight
 * simulation, EIP-5792 routing + UserOperationEvent verification for smart
 * wallets, and a classic-path fallback for everyone else. Mirrors
 * app/page.tsx's writeContractAsync wrapper but works on ABI-agnostic raw
 * calldata, so ABI-based callers just encodeFunctionData() first.
 *
 * `dataSuffix` (Base Builder Code attribution) is applied ONLY on the
 * classic path, never on the smart-wallet EIP-5792 path. A prior version of
 * this function tried the suffix first there and fell back on failure — but
 * on at least some hosts, the wallet's own confirmation preview doesn't
 * cleanly reject suffixed calldata, it just never renders a prompt at all.
 * wallet_sendCalls then hangs indefinitely with nothing to catch, so the
 * fallback never runs — it took down every smart-wallet action (likes,
 * tips, DEX trades, agent actions) in Base App. Do not reintroduce this
 * without a way to time out a stuck confirmation and fall back cleanly.
 */
export async function safeSend(opts: {
  call: RawCall
  account: `0x${string}`
  publicClient: MinimalPublicClient
  isSmartWallet: boolean
  provider?: MinimalProvider
  dataSuffix?: `0x${string}`
  sendTransaction: (call: RawCall) => Promise<`0x${string}`>
}): Promise<`0x${string}`> {
  const { call, account, publicClient, isSmartWallet, provider, sendTransaction } = opts

  await preflightSimulate(publicClient, account, call)

  if (isSmartWallet && provider) {
    return sendViaEip5792(provider, account, call, publicClient)
  }

  return sendTransaction(call)
}
