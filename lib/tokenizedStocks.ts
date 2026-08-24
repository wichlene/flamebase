// Coinbase Tokenized Stocks on Base — real shares (held 1:1 by a regulated
// custodian) issued on the B20 standard, live since 2026-08-24.
// Canonical list of contract addresses: https://base.org/stocks
//
// Why this file exists: the B20 DEX (components/Launchpad.tsx) lists EVERY
// token from the B20 factory with no curation. That was harmless until real
// tokenized stocks shipped — now a search for "NVDA" returns a pile of
// impersonators ($NVDA with a $3.9K FDV, "NVIDIA CAT", "FROG NVDA"…) that a
// user could easily mistake for the genuine Coinbase-issued share.

// Lowercased contract address -> ticker. Populate from base.org/stocks.
export const OFFICIAL_TOKENIZED_STOCKS: Record<string, string> = {
  // '0x…': 'NVDA',
}

// Tickers worth guarding: well-known equities a scam token would impersonate.
// Kept as bare tickers — matching is exact (see classifyToken), so adding a
// ticker here can only ever flag a token literally calling itself that.
export const GUARDED_TICKERS = new Set([
  'AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'GOOG', 'META', 'AMZN', 'NFLX',
  'COIN', 'AMD', 'INTC', 'MSTR', 'PLTR', 'HOOD', 'SPY', 'QQQ', 'BRKB',
  'JPM', 'V', 'MA', 'DIS', 'BABA', 'UBER', 'ABNB', 'SHOP', 'SQ', 'PYPL',
])

export type TokenStatus = 'official' | 'impersonator' | null

// Deliberately NARROW. The expensive mistake here is a false positive —
// slapping a scam warning on a legitimate meme token — so only an EXACT
// symbol match counts. "$NVDACAT" and "$NVDA6900" are obvious memes and stay
// unflagged; a token calling itself precisely "$NVDA" is the real hazard.
export function classifyToken(addr: string, symbol: string): TokenStatus {
  if (OFFICIAL_TOKENIZED_STOCKS[addr.toLowerCase()]) return 'official'
  const norm = (symbol || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (norm && GUARDED_TICKERS.has(norm)) return 'impersonator'
  return null
}
