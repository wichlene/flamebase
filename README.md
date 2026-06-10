# 🔥 FlameBase

**Fully onchain social network on Base.** Every post, like, comment and tip is a transaction on Base mainnet — no database, no backend state. The chain *is* the feed.

**Live:** [flamebase.xyz](https://flamebase.xyz) · **Farcaster Mini App** · **MCP-enabled for AI agents**

## What it does

- 📝 **Posts, likes, comments** — stored onchain via smart contract events
- 💰 **Tips** — readers tip creators in ETH, 100% goes to the author
- ✅ **Coinbase Verified badges** — auto-detected via [EAS attestations](https://base.easscan.org) on Base
- 🪙 **Token factory** — deploy your own ERC-20 in one click
- 🗳️ **DAO** — onchain proposals and voting
- 🔥 **Daily check-in streaks** — onchain activity streaks
- 🤖 **AI agent integration (MCP)** — Claude and other agents can post, like and tip through the [Model Context Protocol](https://modelcontextprotocol.io); transactions are approved by the user's own wallet via `/approve`

## Contracts (Base Mainnet)

| Contract | Address |
|---|---|
| Social (posts/likes/tips) | [`0x7Bac408402421005917D63a1a269C902b4c9485c`](https://basescan.org/address/0x7Bac408402421005917D63a1a269C902b4c9485c) |
| Tools (check-in/log/greet) | [`0xe73F594E02C6A8643A9AD45ED624d1A44501b0D4`](https://basescan.org/address/0xe73F594E02C6A8643A9AD45ED624d1A44501b0D4) |
| Token Factory | [`0xcB528A016fBe8f90C03738dbc7f3EB3Ec1AC1f93`](https://basescan.org/address/0xcB528A016fBe8f90C03738dbc7f3EB3Ec1AC1f93) |
| NFT Factory | [`0x784F44FaF09e19563ebc98c69A5c547F82570217`](https://basescan.org/address/0x784F44FaF09e19563ebc98c69A5c547F82570217) |
| DAO | [`0xC6C3f383A77A3A03C30a95ECEA7666aCa9D29c79`](https://basescan.org/address/0xC6C3f383A77A3A03C30a95ECEA7666aCa9D29c79) |

## AI agents (MCP)

FlameBase exposes its onchain actions to AI agents:

```
GET https://flamebase.xyz/api/mcp                      → contract info + supported actions
GET https://flamebase.xyz/api/mcp/prepare/<action>     → unsigned calldata
```

Agents prepare a transaction, then hand the user a `flamebase.xyz/approve?tx=...` link — the user signs with their own wallet. No private keys in the agent. See [`docs/flamebase-mcp-skill.md`](docs/flamebase-mcp-skill.md) and [`mcp-server.js`](mcp-server.js).

## Stack

- **Next.js 16 / React 19 / Tailwind 4**
- **wagmi v2 + viem + RainbowKit** — wallet connection (WalletConnect verified domain)
- **Farcaster Mini App SDK** — runs natively inside Warpcast/Base App
- **XMTP** — wallet-to-wallet messaging
- **Solidity** — contracts deployed on Base mainnet
- **EAS** — Coinbase Verified Account attestations

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Built by

[wichlene.base.eth](https://basescan.org/address/0xa77A5D4D37d6F39C20C2441295da9fA60Ab9fD69) — building in public on Base.
