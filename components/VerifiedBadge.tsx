'use client'

// Base-blue check badge. Shared between the feed/profile (where it marks a
// Coinbase Verified *account*) and the B20 DEX (where it marks an official
// Coinbase tokenized *stock*) — hence the overridable title.
export default function VerifiedBadge({
  size = 'sm',
  title = 'Coinbase Verified Account',
}: { size?: 'sm' | 'lg'; title?: string }) {
  const cls = size === 'lg' ? 'w-6 h-6' : 'w-4 h-4'
  return (
    <span
      title={title}
      className={`inline-flex items-center justify-center ${cls} rounded-full bg-[#0052FF] flex-shrink-0`}
    >
      <svg viewBox="0 0 12 12" fill="none" className="w-2.5 h-2.5">
        <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}
