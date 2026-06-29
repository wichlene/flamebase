import { NextResponse } from 'next/server'

export const dynamic = 'force-static'

// A2A-style Agent Card, served at the standard /.well-known/agent-card.json
// path so ERC-8004 Identity registries (basehub.fun et al.) and other agent
// directories can discover FlameBase's on-chain agent and its x402 pricing.
// The agent itself runs at /api/premium (x402-gated) and exposes its on-chain
// action catalog via the MCP spec at /.well-known/flamebase-mcp.md.
const card = {
  protocolVersion: '0.3.0',
  name: 'FlameBase Agent',
  description:
    'On-chain social agent for Base. Publishes posts, likes, comments, tips, follows, runs daily check-ins, deploys tokens, and opens/votes on DAO proposals — every action is a real transaction on Base mainnet. Pay-per-use via x402 ($0.01 USDC per call).',
  url: 'https://flamebase.xyz/api/premium',
  preferredTransport: 'JSONRPC',
  iconUrl: 'https://flamebase.xyz/icon.png',
  documentationUrl: 'https://flamebase.xyz/.well-known/flamebase-mcp.md',
  version: '1.0.0',
  provider: {
    organization: 'FlameBase',
    url: 'https://flamebase.xyz',
  },
  capabilities: {
    streaming: false,
    pushNotifications: false,
    // x402 micropayment support — every call settles $0.01 USDC on Base.
    extensions: [
      {
        uri: 'https://x402.org/extension',
        description: 'Pay-per-call via x402: $0.01 USDC on Base (eip155:8453).',
        required: true,
        params: {
          network: 'eip155:8453',
          asset: 'USDC',
          price: '$0.01',
          payTo: '0xa77A5D4D37d6F39C20C2441295da9fA60Ab9fD69',
        },
      },
    ],
  },
  defaultInputModes: ['application/json', 'text/plain'],
  defaultOutputModes: ['application/json', 'text/plain'],
  skills: [
    { id: 'createPost', name: 'Create post', description: 'Publish a post (text, optional image/video) on-chain.', tags: ['social', 'post'], examples: ['Post "gm from FlameBase"'] },
    { id: 'like', name: 'Like a post', description: 'Like a post (🔥) on-chain.', tags: ['social', 'like'], examples: ['Like post 42'] },
    { id: 'comment', name: 'Comment', description: 'Comment on a post on-chain.', tags: ['social', 'comment'], examples: ['Comment "great post" on 42'] },
    { id: 'tip', name: 'Tip', description: 'Tip a post author in ETH on-chain.', tags: ['social', 'payment', 'tip'], examples: ['Tip 0.001 ETH to post 42'] },
    { id: 'follow', name: 'Follow', description: 'Follow a user on-chain by address.', tags: ['social', 'follow'], examples: ['Follow 0x1234…'] },
    { id: 'checkIn', name: 'Daily check-in', description: 'Daily on-chain check-in to build a streak.', tags: ['social', 'streak'], examples: ['Check in for today'] },
    { id: 'deployToken', name: 'Deploy ERC-20', description: 'Deploy an ERC-20 token via the FlameBase factory.', tags: ['token', 'erc20', 'deploy'], examples: ['Deploy a token called Flame, symbol FLM'] },
    { id: 'propose', name: 'DAO propose', description: 'Open a FlameBase DAO proposal.', tags: ['dao', 'governance'], examples: ['Propose "Add dark mode"'] },
    { id: 'vote', name: 'DAO vote', description: 'Vote on a FlameBase DAO proposal.', tags: ['dao', 'governance', 'vote'], examples: ['Vote yes on proposal 3'] },
  ],
}

export function GET() {
  return NextResponse.json(card, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
