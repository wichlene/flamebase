---
name: flamebase
description: >-
  Post, like, comment, tip, follow, and run social actions on FlameBase — the
  on-chain social network on Base. Every action is a real Base transaction.
  Use this skill whenever the user wants to publish a post, like/tip/comment on
  a post, follow another user, check in for a streak, deploy a token, or vote
  in the FlameBase DAO. All transactions settle on Base mainnet (chainId 8453).
homeUrl: https://flamebase.xyz
chain: eip155:8453
keywords:
  - flamebase
  - social
  - post
  - tip
  - follow
  - onchain social
  - base social
---

# FlameBase skill

FlameBase is an on-chain social network on Base. Posting, liking, commenting,
tipping and following are all real transactions on Base mainnet.

This skill never holds keys and never broadcasts anything itself. It asks the
FlameBase API to **build an unsigned transaction**, then hands the
`{ to, data, value, chainId }` object to Base MCP so the user approves it in
their own wallet with one click.

## How it works

1. Pick the action the user asked for (see the table below).
2. Call the prepare endpoint to get an unsigned transaction:

   ```
   GET https://flamebase.xyz/api/mcp/prepare/{action}?{params}
   ```

   The response is:

   ```json
   { "ok": true, "data": { "to": "0x…", "data": "0x…", "value": "0x…", "chainId": 8453 } }
   ```

   On a bad request it returns `{ "ok": false, "error": "…" }` — relay the
   error to the user and ask for the missing field; do not invent values.

3. Pass `data` (the `{ to, data, value, chainId }` object) to Base MCP's
   send-transaction tool so the user can review and approve it.
4. After approval, confirm to the user and link the post/profile on
   https://flamebase.xyz when relevant.

To discover the live action list and the deployed contract addresses at any
time, call `GET https://flamebase.xyz/api/mcp`.

## Actions

| action         | required params              | optional params         | what it does                                  |
|----------------|------------------------------|-------------------------|-----------------------------------------------|
| `createPost`   | `content`                    | `ipfsHash`              | Publish a post (text, optional image/video)   |
| `like`         | `postId`                     | —                       | Like a post (🔥)                              |
| `comment`      | `postId`, `text`             | —                       | Comment on a post                             |
| `tip`          | `postId`                     | `amount` (ETH)          | Tip the post author in ETH                    |
| `createProfile`| `username`                   | `avatarHash`            | Create the caller's FlameBase profile         |
| `follow`       | `target` (address)           | —                       | Follow a user on-chain                        |
| `unfollow`     | `target` (address)           | —                       | Unfollow a user on-chain                      |
| `checkIn`      | —                            | —                       | Daily check-in (streak)                        |
| `deployToken`  | `name`, `symbol`             | `supply`                | Deploy an ERC-20 via the FlameBase factory    |
| `propose`      | `title`, `description`       | —                       | Open a FlameBase DAO proposal                 |
| `vote`         | `proposalId`                 | `support` (true/false)  | Vote on a DAO proposal                        |

## Examples

- "Post 'gm from FlameBase' for me"
  → `GET /api/mcp/prepare/createPost?content=gm%20from%20FlameBase`
- "Tip $1 of ETH to post 42"
  → `GET /api/mcp/prepare/tip?postId=42&amount=0.0003`
- "Follow 0xabc…123 on FlameBase"
  → `GET /api/mcp/prepare/follow?target=0xabc...123`

## Rules

- Never fabricate a `postId`, `target` address, or amount. If the user hasn't
  given it, ask.
- `amount`/`value`-style params are denominated in ETH as a decimal string
  (e.g. `0.0003`), not wei.
- Always let the user approve the transaction in their wallet. This skill only
  prepares transactions; it does not sign or send them.
- All transactions are on Base mainnet (chainId 8453).
