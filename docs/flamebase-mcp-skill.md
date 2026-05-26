# FlameBase Skill Plugin for Base MCP

## Overview

FlameBase is a decentralized social media platform on Base where every interaction — posting, liking, commenting, tipping — is an onchain transaction. Users earn ETH tips directly to their wallet, build onchain reputation, and deploy their own tokens, NFT collections, and DAOs.

**Live at:** https://flamebase-omega.vercel.app  
**Network:** Base Mainnet (chainId: 8453)  
**Builder Code:** bc_m8fvx957

---

## Skill API

All transaction requests go to:

```
POST https://flamebase-omega.vercel.app/api/mcp
Content-Type: application/json
```

The API returns unsigned transaction calldata (`to`, `data`, `value`, `chainId`) ready to be handed to Base MCP for user approval.

---

## Available Actions

### 1. Create a Post

Publish content onchain on FlameBase.

```json
{
  "action": "createPost",
  "params": {
    "content": "Hello Base! 🔥",
    "ipfsHash": ""
  }
}
```

**Cost:** ~0.0001 ETH  
**Example prompts:**
- "Post 'Hello Base!' on FlameBase"
- "Publish my thoughts on FlameBase: [text]"

---

### 2. Like a Post

Like any post by its ID.

```json
{
  "action": "like",
  "params": {
    "postId": 42
  }
}
```

**Cost:** ~0.00001 ETH  
**Example prompts:**
- "Like post #42 on FlameBase"
- "Give a flame to post 7 on FlameBase"

---

### 3. Tip a Post Creator

Send ETH tip directly to the post author.

```json
{
  "action": "tip",
  "params": {
    "postId": 42,
    "amount": "0.001"
  }
}
```

**Cost:** Custom amount (default 0.0001 ETH)  
**Example prompts:**
- "Tip 0.001 ETH to post #5 on FlameBase"
- "Send a tip to the creator of post 12 on FlameBase"

---

### 4. Comment on a Post

Leave an onchain comment on any post.

```json
{
  "action": "comment",
  "params": {
    "postId": 42,
    "text": "Great post!"
  }
}
```

**Cost:** ~0.00001 ETH  
**Example prompts:**
- "Comment 'Amazing!' on post #3 on FlameBase"

---

### 5. Create Profile

Register a username on FlameBase.

```json
{
  "action": "createProfile",
  "params": {
    "username": "satoshi",
    "avatarHash": ""
  }
}
```

**Cost:** Free (no ETH required)

---

### 6. Daily Check-In

Check in daily to build your streak onchain.

```json
{
  "action": "checkIn",
  "params": {}
}
```

**Cost:** ~0.00001 ETH  
**Example prompts:**
- "Check in on FlameBase today"
- "Do my daily FlameBase check-in"

---

### 7. Onchain Counter

Increment your personal onchain counter.

```json
{
  "action": "count",
  "params": {}
}
```

**Cost:** ~0.00001 ETH

---

### 8. Onchain Log

Write a permanent onchain log entry.

```json
{
  "action": "log",
  "params": {
    "text": "Today I learned about Base MCP."
  }
}
```

**Cost:** ~0.00001 ETH  
**Example prompts:**
- "Log 'Deployed my first contract' on FlameBase"

---

### 9. Deploy a Token

Launch your own ERC-20 token through FlameBase Token Factory.

```json
{
  "action": "deployToken",
  "params": {
    "name": "My Token",
    "symbol": "MTK",
    "supply": 1000000
  }
}
```

**Cost:** ~0.001 ETH  
**Example prompts:**
- "Deploy a token called 'Base Coin' with symbol 'BC' on FlameBase"
- "Launch my token on FlameBase with 1 million supply"

---

### 10. Create DAO Proposal

Submit a governance proposal to the FlameBase DAO.

```json
{
  "action": "propose",
  "params": {
    "title": "Add video support",
    "description": "Allow users to upload short videos to FlameBase posts."
  }
}
```

**Cost:** ~0.001 ETH  
**Example prompts:**
- "Create a DAO proposal on FlameBase to add dark mode"

---

### 11. Vote on Proposal

Vote for or against a DAO proposal.

```json
{
  "action": "vote",
  "params": {
    "proposalId": 1,
    "support": true
  }
}
```

**Cost:** ~0.0001 ETH  
**Example prompts:**
- "Vote yes on proposal #1 on FlameBase"

---

## Response Format

All POST requests return:

```json
{
  "to": "0x...",
  "data": "0x...",
  "value": "0x...",
  "chainId": 8453
}
```

Pass this directly to Base MCP's transaction approval flow.

---

## Read Endpoints

Fetch data without transactions:

```
GET https://flamebase-omega.vercel.app/api/mcp
```

Returns contract addresses and supported actions list.

---

## About FlameBase

- **Builder:** wichlene.base.eth
- **Builder Code:** bc_m8fvx957 (every FlameBase tx is attributed on Base)
- **Farcaster Mini App:** Live on Warpcast
- **Contracts:** Deployed on Base Mainnet
- **Features:** Social feed, tipping, token factory, NFT factory, DAO, tools (counter, streak, logbook, greeter)
