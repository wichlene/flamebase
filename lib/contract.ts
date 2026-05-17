export const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as `0x${string}`

export const CONTRACT_ABI = [
  {
    "inputs": [],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [{"internalType": "string","name": "_username","type": "string"},{"internalType": "string","name": "_avatarHash","type": "string"}],
    "name": "createProfile",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "string","name": "_content","type": "string"},{"internalType": "string","name": "_ipfsHash","type": "string"}],
    "name": "createPost",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256","name": "_postId","type": "uint256"}],
    "name": "like",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256","name": "_postId","type": "uint256"},{"internalType": "string","name": "_text","type": "string"}],
    "name": "comment",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256","name": "_postId","type": "uint256"}],
    "name": "tip",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "string","name": "_ipfsHash","type": "string"}],
    "name": "uploadAvatar",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256","name": "_postId","type": "uint256"}],
    "name": "getPost",
    "outputs": [{"components": [{"internalType": "uint256","name": "id","type": "uint256"},{"internalType": "address","name": "author","type": "address"},{"internalType": "string","name": "content","type": "string"},{"internalType": "string","name": "ipfsHash","type": "string"},{"internalType": "uint256","name": "timestamp","type": "uint256"},{"internalType": "uint256","name": "likes","type": "uint256"},{"internalType": "uint256","name": "tips","type": "uint256"}],"internalType": "struct FlameBase.Post","name": "","type": "tuple"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256","name": "_postId","type": "uint256"}],
    "name": "getPostComments",
    "outputs": [{"components": [{"internalType": "address","name": "commenter","type": "address"},{"internalType": "string","name": "text","type": "string"},{"internalType": "uint256","name": "timestamp","type": "uint256"}],"internalType": "struct FlameBase.Comment[]","name": "","type": "tuple[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "postCount",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address","name": "","type": "address"}],
    "name": "profiles",
    "outputs": [{"internalType": "string","name": "username","type": "string"},{"internalType": "string","name": "avatarHash","type": "string"},{"internalType": "bool","name": "exists","type": "bool"},{"internalType": "uint256","name": "flames","type": "uint256"},{"internalType": "uint256","name": "tips","type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "postPrice",
    "outputs": [{"internalType": "uint256","name": "","type": "uint256"}],
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
    "name": "owner",
    "outputs": [{"internalType": "address","name": "","type": "address"}],
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
    "inputs": [{"internalType": "uint256","name": "_price","type": "uint256"}],
    "name": "setLikePrice",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256","name": "_price","type": "uint256"}],
    "name": "setCommentPrice",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256","name": "_price","type": "uint256"}],
    "name": "setPostPrice",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256","name": "_price","type": "uint256"}],
    "name": "setPhotoPrice",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const
