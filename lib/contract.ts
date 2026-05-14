export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`

export const CONTRACT_ABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [{"internalType": "string","name": "_username","type": "string"},{"internalType": "string","name": "_ipfsHash","type": "string"}],
    "name": "createProfile",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address","name": "_to","type": "address"}],
    "name": "like",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address","name": "_to","type": "address"},{"internalType": "string","name": "_text","type": "string"}],
    "name": "comment",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "string","name": "_ipfsHash","type": "string"}],
    "name": "uploadPhoto",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address","name": "_user","type": "address"}],
    "name": "getLikes",
    "outputs": [{"internalType": "address[]","name": "","type": "address[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address","name": "_user","type": "address"}],
    "name": "getComments",
    "outputs": [{"components": [{"internalType": "address","name": "commenter","type": "address"},{"internalType": "string","name": "text","type": "string"},{"internalType": "uint256","name": "timestamp","type": "uint256"}],"internalType": "struct FlameBase.Comment[]","name": "","type": "tuple[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address","name": "","type": "address"}],
    "name": "profiles",
    "outputs": [{"internalType": "string","name": "username","type": "string"},{"internalType": "string","name": "ipfsHash","type": "string"},{"internalType": "bool","name": "exists","type": "bool"},{"internalType": "uint256","name": "flames","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "likePrice",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "commentPrice",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "photoPrice",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{"internalType": "address","name": "","type": "address"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const