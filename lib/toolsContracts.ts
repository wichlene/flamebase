export const TOOLS_ADDRESS = (process.env.NEXT_PUBLIC_TOOLS_CONTRACT || '') as `0x${string}`
export const TOKEN_FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_TOKEN_FACTORY || '') as `0x${string}`
export const NFT_FACTORY_ADDRESS = (process.env.NEXT_PUBLIC_NFT_FACTORY || '') as `0x${string}`
export const DAO_ADDRESS = (process.env.NEXT_PUBLIC_DAO_CONTRACT || '') as `0x${string}`

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
] as const

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
