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

## Profile is required before posting

Posting, liking, commenting and tipping require the user to have a FlameBase
profile on-chain. If the user has never used FlameBase, send `createProfile`
**first** (its own transaction), wait for it to confirm, then send the action
they asked for. Skipping this makes the action revert with
`"Create profile first"`.

Do **not** bundle `createProfile` and the follow-up action into a single
batched approval — gas estimation simulates the batch against current state, so
the second call still sees "no profile" and the whole batch reverts. Send them
as two separate, sequential approvals.

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
| `deployB20Token`| `name`, `symbol`, `account`  | `supply`, `decimals`    | Deploy a native Base B-20 token (Beryl)       |
| `propose`      | `title`, `description`       | —                       | Open a FlameBase DAO proposal                 |
| `vote`         | `proposalId`                 | `support` (true/false)  | Vote on a DAO proposal                        |

## Examples

- "Post 'gm from FlameBase' for me"
  → `GET /api/mcp/prepare/createPost?content=gm%20from%20FlameBase`
- "Tip $1 of ETH to post 42"
  → `GET /api/mcp/prepare/tip?postId=42&amount=0.0003`
- "Follow 0xabc…123 on FlameBase"
  → `GET /api/mcp/prepare/follow?target=0xabc...123`

## deployB20Token — Base's native token standard

`deployB20Token` creates a token through Base's B-20 precompile factory
(`0xB20f...`, live on Base mainnet since the 2026-06-25 Beryl upgrade) instead
of FlameBase's own `TokenFactory` contract. Differences from `deployToken`:

- **No protocol fee** — only gas. `deployToken` charges a fixed 0.001 ETH fee.
- Standard ERC-20 interface, but token logic runs as a chain-native precompile
  (cheaper transfers, no separate contract bytecode per token).
- Requires an extra **`account`** param: the caller's own wallet address. Unlike
  every other action here, the recipient of the initial supply is baked
  directly into the unsigned transaction's calldata (it cannot be inferred
  from `msg.sender` on-chain like the other actions), so it must be supplied
  up front. Never guess this — use the address returned by the wallet/Base MCP
  detection step.
- Deploys admin-less (no `DEFAULT_ADMIN_ROLE` holder): the full `supply` is
  minted once to `account` at creation, and after that nobody — including the
  creator — can ever mint more, pause it, or change its policies. This mirrors
  `deployToken`'s fixed-supply guarantee.
- `decimals` (optional, default `18`) must be an integer in `[6, 18]`.

This is new (hours old at time of writing) infrastructure. Prefer `deployToken`
unless the user specifically asks for a B-20 / native Base token.

## Rules

- Never fabricate a `postId`, `target` address, `account` address, or amount.
  If the user hasn't given it, ask.
- `amount`/`value`-style params are denominated in ETH as a decimal string
  (e.g. `0.0003`), not wei.
- Always let the user approve the transaction in their wallet. This skill only
  prepares transactions; it does not sign or send them.
- All transactions are on Base mainnet (chainId 8453).
