// What's New feed shown to every visitor in the right sidebar. Newest first.
// `tab` navigates in-app (via goToTab) when clicked; `href` opens an
// external link instead — an entry has exactly one of the two.
export type ChangelogEntry = {
  id: string
  emoji: string
  title: string
  date: string // YYYY-MM-DD
} & ({ tab: 'feed' | 'post' | 'activity' | 'messages' | 'profile' | 'ai' | 'reels' | 'tools' | 'launch' } | { href: string })

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: 'profile-links',
    emoji: '🔗',
    title: 'Every profile now has its own shareable link',
    date: '2026-09-05',
    tab: 'profile',
  },
  {
    id: 'talent-score',
    emoji: '🏆',
    title: 'Real onchain Talent Protocol Builder Score on your profile',
    date: '2026-09-05',
    tab: 'profile',
  },
  {
    id: 'x402-agent',
    emoji: '🤖',
    title: 'AI agent now trades, tips, and posts on your behalf via x402',
    date: '2026-08-20',
    tab: 'ai',
  },
  {
    id: 'upload-fix',
    emoji: '📸',
    title: 'Media uploads now support files up to 100MB',
    date: '2026-08-15',
    tab: 'post',
  },
]
