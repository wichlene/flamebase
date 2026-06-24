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

## Submitting to Base

Base's catalog (the protocols listed at base.org/agents — Morpho, Uniswap,
Moonwell, Aerodrome, etc.) is populated from their plugins repo. To get
FlameBase listed:

1. Confirm the skill spec is live: open
   `https://flamebase.xyz/.well-known/flamebase-mcp.md`.
2. Follow Base's custom-plugin guide:
   https://docs.base.org/ai-agents/plugins/custom-plugins
3. Open a PR to Base's plugins repository adding `flamebase-skill.md` (or a link
   to the hosted spec), with FlameBase's metadata (name, homeUrl, category
   `social`, chain `eip155:8453`).
4. Anyone can already use it today without waiting for the listing: in Claude,
   "Add to Claude" the Base MCP, then point the assistant at the spec URL above.

## Test the API locally

```bash
curl "http://localhost:3000/api/mcp"
curl "http://localhost:3000/api/mcp/prepare/createPost?content=gm"
curl "http://localhost:3000/api/mcp/prepare/follow?target=0x0000000000000000000000000000000000000001"
```
