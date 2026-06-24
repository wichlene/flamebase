---
title: "FlameBase Plugin"
description: "Post, like, comment, tip, and follow on FlameBase — on-chain social on Base."
tags: [social, posting, tipping, follow]
name: flamebase
version: 0.1.0
integration: http-api
chains: [base]
requires:
  shell: none
  allowlist: [flamebase.xyz]
  externalMcp: null
  cliPackage: null
auth: none
risk: [permanent-onchain-content]
---

# FlameBase

FlameBase is an on-chain social network on Base. Posting, liking, commenting,
tipping, and following are all real transactions on Base mainnet (chain id
8453). The plugin never holds keys: it asks the FlameBase API to build an
unsigned transaction, then hands `{ to, data, value, chainId }` to Base MCP so
the user approves it in their Base Account.

Open it when the user names **FlameBase** and wants to publish a post, like /
comment / tip a post, follow or unfollow a user, check in for a streak, deploy
a token, or vote in the FlameBase DAO.

## Surface routing

| Surface     | How                                                            |
|-------------|---------------------------------------------------------------|
| Discovery   | `GET https://flamebase.xyz/api/mcp` — live actions + addresses |
| Prepare tx  | `GET https://flamebase.xyz/api/mcp/prepare/{action}?{params}` |
| Skill spec  | `GET https://flamebase.xyz/.well-known/flamebase-mcp.md`      |

## Prepare endpoints

`GET /api/mcp/prepare/{action}` returns:

```json
{ "ok": true, "data": { "to": "0x…", "data": "0x…", "value": "0x…", "chainId": 8453 } }
```

On a bad request: `{ "ok": false, "error": "…" }` — relay it and ask for the
missing field. Never invent a `postId`, `target`, or amount.

| action         | required params         | optional params        | does                              |
|----------------|-------------------------|------------------------|-----------------------------------|
| `createProfile`| `username`              | `avatarHash`           | Create the caller's profile       |
| `createPost`   | `content`               | `ipfsHash`             | Publish a post                    |
| `like`         | `postId`                | —                      | Like a post                       |
| `comment`      | `postId`, `text`        | —                      | Comment on a post                 |
| `tip`          | `postId`                | `amount` (ETH decimal) | Tip the author in ETH             |
| `follow`       | `target` (address)      | —                      | Follow a user on-chain            |
| `unfollow`     | `target` (address)      | —                      | Unfollow a user on-chain          |
| `checkIn`      | —                       | —                      | Daily check-in (streak)           |
| `deployToken`  | `name`, `symbol`        | `supply`               | Deploy an ERC-20                  |
| `propose`      | `title`, `description`  | —                      | Open a DAO proposal               |
| `vote`         | `proposalId`            | `support` (true/false) | Vote on a DAO proposal            |

## Orchestration

```
web_request (GET prepare endpoint)  →  send_calls (to/value/data)
   →  user approves in Base Account  →  get_request_status (poll txHash)
```

## Profile is required first

`createPost`, `like`, `comment`, and `tip` revert with `"Create profile first"`
unless the caller already has a profile. If the user is new to FlameBase, send
`createProfile` as its **own** transaction and let it confirm, then send the
requested action. Do **not** batch `createProfile` + the action into one
`send_calls`: gas estimation simulates the batch against current state, so the
second call still sees "no profile" and the whole batch reverts.

## Example prompts

- "Post 'gm from FlameBase'"
  → prepare `createPost?content=gm%20from%20FlameBase` → `send_calls`
- "Tip ~$1 of ETH to post 42"
  → prepare `tip?postId=42&amount=0.0003` → `send_calls`
- "Follow 0xabc…123 on FlameBase"
  → prepare `follow?target=0xabc...123` → `send_calls`

## Notes

- `amount` / `value` params are ETH decimal strings (e.g. `0.0003`), not wei.
- All transactions settle on Base mainnet (chain id 8453).
- Usernames are permanent: the contract has no rename, so confirm the username
  with the user before `createProfile`.
- Posts are permanent on-chain content (`risk: permanent-onchain-content`) —
  confirm wording before sending.
