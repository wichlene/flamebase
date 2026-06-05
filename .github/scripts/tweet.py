import tweepy
import os
import random
import urllib.request
import json
from datetime import datetime, timezone

STATIC_TWEETS = [
    "🔥 What's your Base wallet score?\n\nCheck your on-chain activity, get a tier badge (S/A/B/C/D), and see real stats — TX count, streaks, NFTs, contracts called.\n\nFree. No signup.\n👉 flamebase.xyz\n\n#Base #BuildOnBase #Onchain",
    "Your Base wallet tells a story.\n\nflamebase.xyz reads it for you:\n• Activity score /100\n• Longest TX streak\n• Contracts you interacted with\n• Sybil risk rating\n\nCheck yours 👇\nflamebase.xyz\n\n#Base #Crypto",
    "Most wallets on Base are sleeping 💤\n\nIs yours one of them?\n\nflamebase.xyz shows you exactly how active you are — and what it takes to move up a tier.\n\n#Base #OnchainSummer",
    "Tier S on Base = top 1% of active wallets.\n\nWhere do you rank?\n🔥 flamebase.xyz\n\n#Base #BuildOnBase",
    "If you're on Base but haven't checked your wallet score yet — what are you doing?\n\nflamebase.xyz gives you:\n✅ Activity score\n✅ Streak data\n✅ NFT + token breakdown\n✅ Sybil risk\n\nFree, instant, no wallet connect needed.\n\n#Base",
    "Base facts 🔵\n\n• Built by Coinbase\n• Settled on Ethereum\n• <$0.001 avg gas fee\n• 10M+ wallets\n• 100M+ transactions\n\nAnd it's just getting started.\n\n#Base #L2 #Ethereum",
    "Base is the fastest growing L2 right now.\n\nMore transactions than most chains.\nGas so cheap you barely notice.\nCoinbase backing it.\n\nAnd you're already here.\n\n#Base #BuildOnBase",
    "Why Base?\n\n→ Coinbase users onboard directly\n→ No gas surprises (<$0.01 most txs)\n→ Full EVM compatibility\n→ OP Stack = battle-tested\n→ Growing developer ecosystem\n\n#Base #Ethereum #L2",
    "On Ethereum mainnet: $30 gas for a swap\nOn Base: $0.001\n\nSame security. Same assets.\nJust actually affordable.\n\n#Base #L2 #BuildOnBase",
    "Base doesn't have a native token.\n\nThat's intentional.\n\nAll fees go back to Ethereum. The network is designed to be infrastructure, not a casino.\n\n#Base #Ethereum #Onchain",
    "Quick question for Base users:\n\nHow many transactions have you made?\n\n🟩 <50 — lurker\n🟨 50–200 — active\n🟧 200–1000 — degen\n🟥 1000+ — you live here\n\nCheck yours: flamebase.xyz\n\n#Base",
    "The best time to start building on Base was 2 years ago.\n\nThe second best time is today.\n\nflamebase.xyz — check where you stand.\n\n#Base #BuildOnBase",
    "Me before Base: \"gas fees are just the cost of crypto\"\n\nMe after Base: \"why would I ever pay $20 to swap again\"\n\n#Base #L2 #Ethereum",
    "ETH mainnet: $40 to say hello on-chain\nBase: $0.001 to say hello on-chain\n\nSame message. Different wallet damage.\n\n#Base #BuildOnBase",
    "\"I'll move to Base when it's more mature\"\n— someone who missed 100M transactions happening\n\nIt's mature. It's fast. It's cheap.\nflamebase.xyz\n\n#Base",
]

def get_live_stat_tweet():
    try:
        url = "https://base.blockscout.com/api/v2/stats"
        with urllib.request.urlopen(url, timeout=5) as r:
            data = json.loads(r.read())
        total_tx = int(data.get("total_transactions", 0))
        total_addr = int(data.get("total_addresses", 0))
        block_time = float(data.get("average_block_time", 2))
        templates = [
            f"📊 Base network right now:\n\n🔢 {total_tx:,} total transactions\n👤 {total_addr:,} total addresses\n⚡ {block_time:.1f}s avg block time\n\nAll for <$0.001 per tx.\n\nCheck your piece of it: flamebase.xyz\n\n#Base #Onchain",
            f"Base by the numbers 🔵\n\n{total_tx:,} transactions confirmed.\n{total_addr:,} wallets active.\nBlock every {block_time:.1f}s.\n\nAre you one of them? flamebase.xyz\n\n#Base #BuildOnBase",
        ]
        return random.choice(templates)
    except Exception as e:
        print(f"Live stats failed: {e}")
        return None

# Build tweet text
text = None
if random.random() < 0.3:
    text = get_live_stat_tweet()

if not text:
    hour = datetime.now(timezone.utc).hour
    day = datetime.now(timezone.utc).day
    idx = (hour * 7 + day * 13) % len(STATIC_TWEETS)
    text = STATIC_TWEETS[idx]

print("Tweeting:\n", text)

client = tweepy.Client(
    consumer_key=os.environ["TW_API_KEY"],
    consumer_secret=os.environ["TW_API_SECRET"],
    access_token=os.environ["TW_ACCESS_TOKEN"],
    access_token_secret=os.environ["TW_ACCESS_SECRET"],
)

response = client.create_tweet(text=text)
print("Tweet posted:", response.data["id"])
