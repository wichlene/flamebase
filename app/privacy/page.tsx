import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — FlameBase',
  description: 'How FlameBase handles your data.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-[#0A0B0D]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="text-sm text-[#0052FF] hover:underline">← Back to FlameBase</Link>
        <h1 className="text-3xl md:text-4xl font-black mt-6 mb-2">Privacy Policy</h1>
        <p className="text-[#8A919E] text-sm mb-10">Last updated: May 2026</p>

        <div className="space-y-8 text-[#3D424D] leading-relaxed">
          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">1. Overview</h2>
            <p>
              FlameBase is an on-chain social application running on the Base blockchain. By design, we
              store as little personal information as possible. Most of what you publish — posts, likes,
              comments, tips, follows — is recorded directly on a public blockchain by you, not by us.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">2. What is on-chain (public)</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Your wallet address and every transaction you sign (posts, likes, comments, tips, follows, profile updates).</li>
              <li>Post content, profile name, bio, and avatar URL, when you upload them through the app.</li>
              <li>Tool interactions: counters, streak check-ins, logbook entries, greetings, deployed tokens / NFTs / DAO proposals.</li>
            </ul>
            <p className="mt-3">
              This data is permanently public. Anyone can read it directly from the blockchain. We cannot
              delete or hide it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">3. What we store off-chain</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><b>Uploaded media</b> (images / videos for posts and avatars): hosted via a third-party file storage provider. Only the URL ends up on-chain.</li>
              <li><b>Local browser storage</b>: language preference, seen activity snapshot, hidden post IDs, draft text. This never leaves your device.</li>
              <li><b>Direct messages</b>: routed through the XMTP network and encrypted end-to-end. We cannot read them.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">4. Third-party services</h2>
            <p>
              The app talks to: the Base RPC, the XMTP network, your connected wallet, YouTube&apos;s
              embed player (Reels tab), and the AI provider that powers the AI chat. Each has its own
              privacy practices outside our control.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">5. Your rights</h2>
            <p>
              You can disconnect your wallet at any time. You can stop using the app at any time. Because
              the blockchain is public and immutable, we are not able to erase records that have already
              been written there.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">6. Contact</h2>
            <p>
              Questions about this policy? Reach out on{' '}
              <a href="https://x.com/PrimeAirdropTR" target="_blank" rel="noopener noreferrer" className="text-[#0052FF] hover:underline">X</a> or{' '}
              <a href="https://farcaster.xyz/wichlene" target="_blank" rel="noopener noreferrer" className="text-[#0052FF] hover:underline">Farcaster</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
