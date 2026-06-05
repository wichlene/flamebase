const OAuth = require('oauth-1.0a')
const crypto = require('crypto')

const oauth = OAuth({
  consumer: { key: process.env.TW_API_KEY, secret: process.env.TW_API_SECRET },
  signature_method: 'HMAC-SHA1',
  hash_function(base_string, key) {
    return crypto.createHmac('sha1', key).update(base_string).digest('base64')
  },
})

const token = {
  key: process.env.TW_ACCESS_TOKEN,
  secret: process.env.TW_ACCESS_SECRET,
}

// ── Static tweet pool ─────────────────────────────────────────────────────────

const STATIC_TWEETS = [
  // FlameBase promo
  `🔥 What's your Base wallet score?\n\nCheck your on-chain activity, get a tier badge (S/A/B/C/D), and see real stats — TX count, streaks, NFTs, contracts called.\n\nFree. No signup.\n👉 flamebase.xyz\n\n#Base #BuildOnBase #Onchain`,

  `Your Base wallet tells a story.\n\nflamebase.xyz reads it for you:\n• Activity score /100\n• Longest TX streak\n• Contracts you interacted with\n• Sybil risk rating\n\nCheck yours 👇\nflamebase.xyz\n\n#Base #Crypto`,

  `Most wallets on Base are sleeping 💤\n\nIs yours one of them?\n\nflamebase.xyz shows you exactly how active you are — and what it takes to move up a tier.\n\n#Base #OnchainSummer`,

  `Tier S on Base = top 1% of active wallets.\n\nWhere do you rank?\n🔥 flamebase.xyz\n\n#Base #BuildOnBase`,

  `If you're on Base but haven't checked your wallet score yet — what are you doing?\n\nflamebase.xyz gives you:\n✅ Activity score\n✅ Streak data\n✅ NFT + token breakdown\n✅ Sybil risk\n\nFree, instant, no wallet connect needed.\n\n#Base`,

  // Base facts
  `Base facts 🔵\n\n• Built by Coinbase\n• Settled on Ethereum\n• <$0.001 avg gas fee\n• 10M+ wallets\n• 100M+ transactions\n\nAnd it's just getting started.\n\n#Base #L2 #Ethereum`,

  `Base is the fastest growing L2 right now.\n\nMore transactions than most chains.\nGas so cheap you barely notice.\nCoinbase backing it.\n\nAnd you're already here.\n\n#Base #BuildOnBase`,

  `Why Base?\n\n→ Coinbase users onboard directly\n→ No gas surprises (<$0.01 most txs)\n→ Full EVM compatibility\n→ OP Stack = battle-tested\n→ Growing developer ecosystem\n\n#Base #Ethereum #L2`,

  `On Ethereum mainnet: $30 gas for a swap\nOn Base: $0.001\n\nSame security. Same assets.\nJust actually affordable.\n\n#Base #L2 #BuildOnBase`,

  `Base doesn't have a native token.\n\nThat's intentional.\n\nAll fees go back to Ethereum. The network is designed to be infrastructure, not a casino.\n\n#Base #Ethereum #Onchain`,

  // Engagement
  `Quick question for Base users:\n\nHow many transactions have you made?\n\n🟩 <50 — lurker\n🟨 50–200 — active\n🟧 200–1000 — degen\n🟥 1000+ — you live here\n\nCheck yours: flamebase.xyz\n\n#Base`,

  `If Base shut down tomorrow, how many on-chain actions would you lose?\n\nPosts, swaps, NFTs, streaks...\n\nYour history is permanent. flamebase.xyz shows you all of it.\n\n#Base #Onchain`,

  `The best time to start building on Base was 2 years ago.\n\nThe second best time is today.\n\nflamebase.xyz — check where you stand.\n\n#Base #BuildOnBase`,

  // Humor/relatable
  `Me before Base: "gas fees are just the cost of crypto"\n\nMe after Base: "why would I ever pay $20 to swap again"\n\n#Base #L2 #Ethereum`,

  `ETH mainnet: $40 to say hello on-chain\nBase: $0.001 to say hello on-chain\n\nSame message. Different wallet damage.\n\n#Base #BuildOnBase`,

  `"I'll move to Base when it's more mature"\n— someone who missed 100M transactions happening\n\nIt's mature. It's fast. It's cheap.\nflamebase.xyz\n\n#Base`,
]

// ── Live stat tweet (fetched from Blockscout) ─────────────────────────────────

async function fetchBaseStats() {
  try {
    const res = await fetch('https://base.blockscout.com/api/v2/stats')
    if (!res.ok) return null
    const data = await res.json()
    return {
      totalTx: parseInt(data.total_transactions || '0').toLocaleString(),
      totalAddresses: parseInt(data.total_addresses || '0').toLocaleString(),
      avgBlockTime: parseFloat(data.average_block_time || '2').toFixed(1),
    }
  } catch {
    return null
  }
}

async function buildLiveStatTweet() {
  const stats = await fetchBaseStats()
  if (!stats) return null

  const templates = [
    `📊 Base network right now:\n\n🔢 ${stats.totalTx} total transactions\n👤 ${stats.totalAddresses} total addresses\n⚡ ${stats.avgBlockTime}s avg block time\n\nAll for <$0.001 per tx.\n\nCheck your piece of it: flamebase.xyz\n\n#Base #Onchain`,
    `Base by the numbers 🔵\n\n${stats.totalTx} transactions confirmed.\n${stats.totalAddresses} wallets active.\nBlock every ${stats.avgBlockTime}s.\n\nAre you one of them? flamebase.xyz\n\n#Base #BuildOnBase`,
  ]

  return templates[Math.floor(Math.random() * templates.length)]
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 30% chance of live stat tweet, 70% static
  let text
  if (Math.random() < 0.3) {
    text = await buildLiveStatTweet()
  }

  if (!text) {
    // Pick a random static tweet, seeded loosely by hour so we don't repeat too often
    const hour = new Date().getUTCHours()
    const day = new Date().getUTCDate()
    const idx = (hour * 7 + day * 13) % STATIC_TWEETS.length
    text = STATIC_TWEETS[idx]
  }

  console.log('Tweeting:\n', text)

  const url = 'https://api.twitter.com/2/tweets'
  const authHeader = oauth.toHeader(oauth.authorize({ url, method: 'POST' }, token))

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(`X API error ${res.status}: ${JSON.stringify(data)}`)
  console.log('Tweet posted:', data.data.id)
}

main().catch(err => {
  console.error('Failed to tweet:', err)
  process.exit(1)
})
