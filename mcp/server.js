#!/usr/bin/env node
// FlameBase AI Agent — MCP Server
// Otomatik imzalar ve Base mainnet'e gönderir
// Config: PRIVATE_KEY=0x... RPC_URL=https://mainnet.base.org

const https = require('https');
const { ethers } = require('ethers');

const PRIVATE_KEY = process.env.PRIVATE_KEY || '';
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';

let provider, wallet;
if (PRIVATE_KEY) {
  provider = new ethers.JsonRpcProvider(RPC_URL);
  wallet = new ethers.Wallet(PRIVATE_KEY, provider);
}

// MCP stdio transport
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
      serverInfo: { name: 'flamebase-agent', version: '2.0.0' },
    }});
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
  } else if (method === 'tools/call') {
    callTool(id, params).catch((e) => {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }] } });
    });
  } else if (id != null) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }
}

const TOOLS = [
  {
    name: 'get_wallets',
    description: 'Ajan cüzdanın Base mainnet adresini döner.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'flamebase_action',
    description: 'FlameBase\'de bir işlem yapar: post oluştur, beğen, yorum yap, bahşiş ver, check-in yap, token deploy et, DAO\'ya teklif sun veya oy ver. İşlemi otomatik imzalar ve Base\'e gönderir.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: 'Yapılacak işlem: createPost | like | tip | comment | createProfile | checkIn | count | log | greet | deployToken | propose | vote',
        },
        params: {
          type: 'object',
          description: 'İşlem parametreleri. createPost için: {content, ipfsHash?}. like için: {postId}. tip için: {postId, amount?}. comment için: {postId, text}. deployToken için: {name, symbol, supply?}. propose için: {title, description}. vote için: {proposalId, support}.',
        },
      },
      required: ['action'],
    },
  },
];

async function callTool(id, params) {
  const { name, arguments: args } = params;

  if (name === 'get_wallets') {
    const address = wallet ? wallet.address : '(PRIVATE_KEY ayarlanmamış)';
    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify({
      address,
      network: 'base-mainnet',
      chainId: 8453,
    }) }] } });

  } else if (name === 'flamebase_action') {
    if (!wallet) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'Hata: PRIVATE_KEY ayarlanmamış.' }] } });
      return;
    }

    const action = args.action;
    const p = args.params || {};

    // 1. Calldata'yı FlameBase API'den al
    const qs = new URLSearchParams({ from: wallet.address, ...p }).toString();
    const url = `https://flamebase.xyz/api/mcp/prepare/${action}?${qs}`;

    const apiData = await fetchJson(url);
    if (!apiData.ok) {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify({ error: apiData.error }) }] } });
      return;
    }

    const { to, data, value } = apiData.data;

    // 2. Transaction'ı imzala ve gönder
    const tx = await wallet.sendTransaction({ to, data, value: BigInt(value), chainId: 8453 });

    // 3. Onay bekle
    const receipt = await tx.wait(1);

    send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify({
      success: true,
      action,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      explorer: `https://basescan.org/tx/${tx.hash}`,
      message: `✅ ${action} işlemi başarıyla tamamlandı! Tx: ${tx.hash}`,
    }) }] } });

  } else {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Bilinmeyen araç: ' + name } });
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
