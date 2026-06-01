#!/usr/bin/env node
// FlameBase MCP Server — works with Node.js v18+
// Usage: node mcp-server.js
// Env:   WALLET_ADDRESS=0xYourAddress

const https = require('https');
const WALLET = process.env.WALLET_ADDRESS || '0x0000000000000000000000000000000000000000';

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) {
      try { handle(JSON.parse(line)); } catch (_) {}
    }
  }
});

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function handle(msg) {
  const { method, id, params } = msg;
  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: {
      protocolVersion: params.protocolVersion || '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'flamebase', version: '1.0.0' },
    }});
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  } else if (method === 'tools/call') {
    callTool(id, params);
  } else if (method === 'notifications/initialized') {
    // no response
  } else if (id != null) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }
}

const TOOLS = [
  {
    name: 'get_wallets',
    description: 'Get the connected wallet address on Base mainnet.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'prepare_action',
    description: 'Prepare a FlameBase onchain action (createPost, like, tip, comment, checkIn, deployToken, propose, vote, etc.) and return unsigned transaction calldata.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action name: createPost | like | tip | comment | createProfile | checkIn | count | log | greet | deployToken | propose | vote' },
        params: { type: 'object', description: 'Action parameters (content, postId, amount, text, name, symbol, supply, title, description, proposalId, support, etc.)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'send_calls',
    description: 'Submit a prepared transaction for user approval. Returns a request ID.',
    inputSchema: {
      type: 'object',
      properties: {
        chain: { type: 'string', description: 'Chain name, e.g. "base"' },
        calls: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              to: { type: 'string' },
              data: { type: 'string' },
              value: { type: 'string' },
            },
          },
        },
      },
      required: ['chain', 'calls'],
    },
  },
  {
    name: 'get_request_status',
    description: 'Check the status of a submitted transaction request.',
    inputSchema: {
      type: 'object',
      properties: {
        requestId: { type: 'string' },
      },
      required: ['requestId'],
    },
  },
];

function callTool(id, params) {
  const { name, arguments: args } = params;

  if (name === 'get_wallets') {
    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify({
      wallets: [{ address: WALLET, network: 'base-mainnet', chainId: 8453 }]
    }) }] } });

  } else if (name === 'prepare_action') {
    const action = args.action;
    const p = args.params || {};
    const qs = new URLSearchParams({ from: WALLET, ...p }).toString();
    const url = `https://flamebase.xyz/api/mcp/prepare/${action}?${qs}`;

    fetchJson(url, (err, data) => {
      if (err || !data.ok) {
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify({ error: err || data.error }) }] } });
      } else {
        send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(data.data) }] } });
      }
    });

  } else if (name === 'send_calls') {
    const reqId = 'req_' + Date.now();
    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify({
      requestId: reqId,
      status: 'pending_approval',
      message: `Transaction ready. Open https://flamebase.xyz and approve in your wallet. Request ID: ${reqId}`,
      calls: args.calls,
    }) }] } });

  } else if (name === 'get_request_status') {
    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify({
      requestId: args.requestId,
      status: 'submitted',
      explorer: `https://basescan.org`,
    }) }] } });

  } else {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown tool: ' + name } });
  }
}

function fetchJson(url, cb) {
  https.get(url, (res) => {
    let data = '';
    res.on('data', (c) => data += c);
    res.on('end', () => {
      try { cb(null, JSON.parse(data)); } catch (e) { cb('Parse error'); }
    });
  }).on('error', (e) => cb(e.message));
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
