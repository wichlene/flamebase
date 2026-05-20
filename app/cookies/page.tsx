import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Cookie Policy — FlameBase',
  description: 'How FlameBase uses cookies and local storage.',
}

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-white text-[#0A0B0D]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="text-sm text-[#0052FF] hover:underline">← Back to FlameBase</Link>
        <h1 className="text-3xl md:text-4xl font-black mt-6 mb-2">Cookie Policy</h1>
        <p className="text-[#8A919E] text-sm mb-10">Last updated: May 2026</p>

        <div className="space-y-8 text-[#3D424D] leading-relaxed">
          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">1. The short version</h2>
            <p>
              FlameBase does not set tracking cookies, advertising cookies, or analytics cookies. We use
              your browser&apos;s local storage to remember a few preferences that make the app usable.
              Nothing leaves your device.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">2. What we store locally</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><b>Language preference</b> — so the app stays in the language you picked.</li>
              <li><b>Activity snapshot</b> — to show you which likes / comments / tips on your posts are new.</li>
              <li><b>Hidden posts</b> — posts you chose to hide from your feed.</li>
              <li><b>Wallet connection state</b> — managed by your wallet provider (RainbowKit / WalletConnect), so the app remembers you are connected after a reload.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">3. Third-party storage</h2>
            <p>
              Embedded YouTube videos in the Reels tab set their own cookies under youtube.com — these
              are controlled by YouTube, not by us. The XMTP messaging network and your wallet provider
              also keep their own local data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">4. Clearing your data</h2>
            <p>
              You can clear FlameBase&apos;s local storage at any time from your browser&apos;s site
              settings. This will reset your language, your activity-seen snapshot, and your hidden-post
              list. It does not affect anything on the blockchain.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
