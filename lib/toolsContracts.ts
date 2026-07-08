import { encodeAbiParameters, encodeFunctionData } from 'viem'

export const TOOLS_ADDRESS = (process.env.NEXT_PUBLIC_TOOLS_CONTRACT || '') as `0x${string}`
export const TOKEN_FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN_FACTORY || '') as `0x${string}`
export const NFT_FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_NFT_FACTORY || '') as `0x${string}`
export const DAO_ADDRESS = (process.env.NEXT_PUBLIC_DAO_CONTRACT || '') as `0x${string}`
export const FOLLOW_ADDRESS = (process.env.NEXT_PUBLIC_FOLLOW_CONTRACT || '') as `0x${string}`

export const TOOLS_ABI = [
  { name: 'globalCounter', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'userCounters', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'count', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] },
  { name: 'streakDays', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'maxStreak', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'lastCheckin', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'checkIn', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] },
  { name: 'canCheckInToday', type: 'function', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'bool' }] },
  { name: 'log', type: 'function', stateMutability: 'payable', inputs: [{ name: '_text', type: 'string' }], outputs: [] },
  { name: 'getLogs', type: 'function', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ components: [{ name: 'text', type: 'string' }, { name: 'timestamp', type: 'uint256' }], internalType: 'struct FlameBaseTools.LogEntry[]', type: 'tuple[]' }] },
  { name: 'greet', type: 'function', stateMutability: 'payable', inputs: [{ name: '_greeting', type: 'string' }], outputs: [] },
  { name: 'greetings', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'string' }] },
] as const

export const TOKEN_FACTORY_ABI = [
  { name: 'DEPLOY_FEE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'deployToken', type: 'function', stateMutability: 'payable', inputs: [{ name: '_name', type: 'string' }, { name: '_symbol', type: 'string' }, { name: '_supply', type: 'uint256' }], outputs: [{ type: 'address' }] },
  { name: 'tokenCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const

export const NFT_FACTORY_ABI = [
  { name: 'DEPLOY_FEE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'deployNFT', type: 'function', stateMutability: 'payable', inputs: [{ name: '_name', type: 'string' }, { name: '_symbol', type: 'string' }, { name: '_maxSupply', type: 'uint256' }, { name: '_mintPrice', type: 'uint256' }, { name: '_baseURI', type: 'string' }], outputs: [{ type: 'address' }] },
  { name: 'collectionCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'getCollections', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ components: [{ name: 'addr', type: 'address' }, { name: 'name', type: 'string' }, { name: 'symbol', type: 'string' }, { name: 'creator', type: 'address' }, { name: 'maxSupply', type: 'uint256' }, { name: 'mintPrice', type: 'uint256' }], type: 'tuple[]' }] },
] as const

export const FLAME_NFT_ABI = [
  { name: 'mint', type: 'function', stateMutability: 'payable', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'totalSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'maxSupply', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'mintPrice', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'name', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'string' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const

export const FLAME_NFT_ADDRESS = (process.env.NEXT_PUBLIC_FLAME_NFT || '') as `0x${string}`

export const DAO_ABI = [
  { name: 'PROPOSE_FEE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'VOTE_FEE', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'proposalCount', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { name: 'propose', type: 'function', stateMutability: 'payable', inputs: [{ name: '_title', type: 'string' }, { name: '_description', type: 'string' }], outputs: [{ type: 'uint256' }] },
  { name: 'vote', type: 'function', stateMutability: 'payable', inputs: [{ name: '_id', type: 'uint256' }, { name: '_support', type: 'bool' }], outputs: [] },
  { name: 'getProposal', type: 'function', stateMutability: 'view', inputs: [{ name: '_id', type: 'uint256' }], outputs: [{ components: [{ name: 'id', type: 'uint256' }, { name: 'proposer', type: 'address' }, { name: 'title', type: 'string' }, { name: 'description', type: 'string' }, { name: 'votesFor', type: 'uint256' }, { name: 'votesAgainst', type: 'uint256' }, { name: 'deadline', type: 'uint256' }], type: 'tuple' }] },
  { name: 'isActive', type: 'function', stateMutability: 'view', inputs: [{ name: '_id', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'hasVoted', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'uint256' }, { name: '', type: 'address' }], outputs: [{ type: 'bool' }] },
] as const

// Base's native B-20 token standard (Beryl upgrade, live on Base mainnet since 2026-06-25).
// Singleton precompile — same address on every Base chain that has activated Beryl.
// Spec: https://github.com/base/base-std (src/interfaces/IB20Factory.sol, src/lib/B20FactoryLib.sol)
export const B20_FACTORY_ADDRESS = '0xB20f000000000000000000000000000000000000' as const

export const B20_FACTORY_ABI = [
  {
    name: 'createB20',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'variant', type: 'uint8' },
      { name: 'salt', type: 'bytes32' },
      { name: 'params', type: 'bytes' },
      { name: 'initCalls', type: 'bytes[]' },
    ],
    outputs: [{ name: 'token', type: 'address' }],
  },
] as const

const B20_BATCH_MINT_ABI = [
  {
    name: 'batchMint',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipients', type: 'address[]' },
      { name: 'amounts', type: 'uint256[]' },
    ],
    outputs: [],
  },
] as const

// Mirrors B20FactoryLib.encodeAssetCreateParams exactly: abi.encode(B20AssetCreateParams{...}).
// CRITICAL: the native precompile rejects non-canonical calldata with AbiDecodeFailed. In Solidity,
// abi.encode(struct) of a dynamic struct is encoded as a SINGLE tuple param — it carries a leading
// 0x20 offset word. Encoding the fields as a flat 5-tuple omits that word and fails to decode. So we
// must encode one tuple param, not five separate params.
const B20_ASSET_PARAMS_TUPLE = [
  {
    type: 'tuple',
    components: [
      { name: 'version', type: 'uint8' },
      { name: 'name', type: 'string' },
      { name: 'symbol', type: 'string' },
      { name: 'initialAdmin', type: 'address' },
      { name: 'decimals', type: 'uint8' },
    ],
  },
] as const
export function encodeB20AssetCreateParams(name: string, symbol: string, initialAdmin: `0x${string}`, decimals: number) {
  return encodeAbiParameters(B20_ASSET_PARAMS_TUPLE, [
    { version: 1, name, symbol, initialAdmin, decimals },
  ])
}

// Mirrors B20FactoryLib.encodeBatchMint — passed as a createB20 initCall to mint the initial
// supply during the bootstrap window, which bypasses MINT_ROLE entirely.
export function encodeB20BatchMintInitCall(recipient: `0x${string}`, amount: bigint) {
  return encodeFunctionData({ abi: B20_BATCH_MINT_ABI, functionName: 'batchMint', args: [[recipient], [amount]] })
}

export const FOLLOW_ABI = [
  { name: 'follow', type: 'function', stateMutability: 'payable', inputs: [{ name: 'target', type: 'address' }], outputs: [] },
  { name: 'unfollow', type: 'function', stateMutability: 'payable', inputs: [{ name: 'target', type: 'address' }], outputs: [] },
  { name: 'isFollowing', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }, { name: '', type: 'address' }], outputs: [{ type: 'bool' }] },
  { name: 'getFollowing', type: 'function', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'address[]' }] },
  { name: 'followingCount', type: 'function', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'followerCount', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const
