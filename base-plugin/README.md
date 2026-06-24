# FlameBase — Base MCP skill plugin

This folder holds the skill plugin that lets AI agents (Claude, Cursor, Codex,
ChatGPT, Hermes) drive FlameBase actions on Base via [Base MCP](https://base.org/agents).

## What's here

- **`flamebase-skill.md`** — the skill spec. It teaches the assistant to call
  the FlameBase API for an unsigned transaction, then hand it to Base MCP for
  one-click user approval. Served live at
  `https://flamebase.xyz/.well-known/flamebase-mcp.md`.

## How it plugs into Base MCP

FlameBase already serves everything an agent needs — no keys, no signing on our
side:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/mcp` | Discovery: live action list + deployed contract addresses |
| `GET /api/mcp/prepare/{action}?…` | Returns `{ ok, data: { to, data, value, chainId } }` — an unsigned Base tx |

The agent gets the unsigned tx and passes it to Base MCP's send-transaction
tool; the user approves in their own wallet. We never touch private keys.

## Files

- **`flamebase.md`** — the plugin file in Base's official `base/skills` format
  (mirrors `skills/base-mcp/plugins/moonwell.md`). This is what gets submitted.
- **`flamebase-skill.md`** — standalone skill spec, served live at
  `https://flamebase.xyz/.well-known/flamebase-mcp.md`, usable today without a
  listing.

## Submitting to Base (to appear at base.org/agents)

The catalog (Morpho, Uniswap, Moonwell, Aerodrome, Virtuals…) lives in the
public repo **https://github.com/base/skills** under `skills/base-mcp/`. Each
protocol is a file in `plugins/` plus a row in `SKILL.md`'s plugin table. Native
plugins fetch their API through Base MCP's `web_request`, which only allows
**allowlisted** domains — so listing also means getting `flamebase.xyz` added to
that allowlist.

Steps:

1. Verify everything is live:
   - `https://flamebase.xyz/api/mcp`
   - `https://flamebase.xyz/api/mcp/prepare/createPost?content=gm`
   - `https://flamebase.xyz/.well-known/flamebase-mcp.md`
2. Fork `base/skills`, add `base-plugin/flamebase.md` as
   `skills/base-mcp/plugins/flamebase.md`.
3. Add a row to the plugin table in `skills/base-mcp/SKILL.md`:

   | [FlameBase](plugins/flamebase.md) | Open it when the user names **FlameBase** and wants to post, like, comment, tip, follow, check in, deploy a token, or vote in the DAO. | createPost, like, comment, tip, follow/unfollow, checkIn, deployToken, propose, vote | Base only. Posts are permanent on-chain. |

4. In the PR description, request that **`flamebase.xyz`** be added to the
   `web_request` allowlist (the plugin declares `requires.allowlist:
   [flamebase.xyz]`).
5. Read Base's contributing guide in the repo before opening the PR.

## Works today without the listing

"Add to Claude" the Base MCP, then in a chat:

> Read https://flamebase.xyz/.well-known/flamebase-mcp.md and post "gm" for me
> on FlameBase.

Claude fetches the spec + prepare endpoint with its own browsing (not Base
MCP's allowlisted `web_request`), gets the unsigned tx, and hands it to Base
MCP's `send_calls` for one-click approval. Verified end-to-end on 2026-06-24
(profile + post created on-chain via this flow).

## Test the API locally

```bash
curl "http://localhost:3000/api/mcp"
curl "http://localhost:3000/api/mcp/prepare/createPost?content=gm"
curl "http://localhost:3000/api/mcp/prepare/follow?target=0x0000000000000000000000000000000000000001"
```
