import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service — FlameBase',
  description: 'The rules for using FlameBase.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-[#0A0B0D]">
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/" className="text-sm text-[#0052FF] hover:underline">← Back to FlameBase</Link>
        <h1 className="text-3xl md:text-4xl font-black mt-6 mb-2">Terms of Service</h1>
        <p className="text-[#8A919E] text-sm mb-10">Last updated: May 2026</p>

        <div className="space-y-8 text-[#3D424D] leading-relaxed">
          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">1. Acceptance</h2>
            <p>
              By connecting a wallet and using FlameBase you agree to these terms. If you do not agree,
              do not use the app.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">2. What FlameBase is</h2>
            <p>
              FlameBase is a non-custodial interface to smart contracts deployed on the Base blockchain.
              We do not hold your keys, your funds, or your content. Every action that costs gas is
              signed and broadcast by you.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">3. Your responsibilities</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You are responsible for the security of your wallet and seed phrase.</li>
              <li>You are responsible for everything you publish — posts, comments, profile content, deployed tokens / NFTs / DAO proposals.</li>
              <li>You must not publish content that is illegal, hateful, harassing, sexually explicit involving minors, or that infringes anyone&apos;s rights.</li>
              <li>You must not impersonate others, run automated spam, or attempt to exploit the contracts.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">4. On-chain finality</h2>
            <p>
              Transactions on Base cannot be reversed. Gas fees are non-refundable. Tips you send are
              final. Read every transaction before signing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">5. No financial advice</h2>
            <p>
              Nothing in the app — including tokens you can mint, NFTs you can deploy, or DAO proposals —
              is financial advice. Crypto is risky. You may lose everything you put in. Do your own
              research.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">6. Moderation</h2>
            <p>
              The blockchain itself cannot be moderated, but we may hide content in the FlameBase
              interface that violates these terms or applicable law. The on-chain record remains.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">7. Disclaimer</h2>
            <p>
              The app is provided “as is”, with no warranties of any kind. We are not liable for losses
              from smart-contract bugs, third-party services, network failures, or your own mistakes.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-black text-[#0A0B0D] mb-3">8. Changes</h2>
            <p>
              These terms may be updated. Continued use of the app after changes means you accept the
              new terms.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
