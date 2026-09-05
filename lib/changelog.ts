// What's New feed shown to every visitor in the right sidebar. Newest first.
// Only genuinely user-facing features belong here — plumbing changes (routing,
// infra, refactors) aren't "news" even if they shipped the same day.
// `titleKey` looks up the actual text in lib/i18n.ts's T[lang] so this
// renders in whichever language the visitor has selected.
// `tab` navigates in-app (via goToTab) when clicked; `href` opens an
// external link instead — an entry has exactly one of the two.
export type ChangelogEntry = {
  id: string
  emoji: string
  titleKey: string
  date: string // YYYY-MM-DD
} & ({ tab: 'feed' | 'post' | 'activity' | 'messages' | 'profile' | 'ai' | 'reels' | 'tools' | 'launch' } | { href: string })

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: 'talent-score',
    emoji: '🏆',
    titleKey: 'changelogTalentScore',
    date: '2026-09-05',
    tab: 'profile',
  },
  {
    id: 'x402-agent',
    emoji: '🤖',
    titleKey: 'changelogX402Agent',
    date: '2026-08-20',
    tab: 'ai',
  },
  {
    id: 'upload-fix',
    emoji: '📸',
    titleKey: 'changelogUploadFix',
    date: '2026-08-15',
    tab: 'post',
  },
]
