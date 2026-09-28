// Coinbase Tokenized Stocks on Base — real shares (held 1:1 by a regulated
// custodian) issued on the B20 standard, live since 2026-08-24.
// Canonical list: https://base.org/stocks, cross-referenced against
// basescan.org/tokens/label/tokenized-stocks.
//
// Why this file exists: the B20 DEX (components/Launchpad.tsx) lists EVERY
// token from the B20 factory with no curation. That was harmless until real
// tokenized stocks shipped — now a search for "NVDA" returns a pile of
// impersonators ($NVDA with a $3.9K FDV, "NVIDIA CAT", "FROG NVDA"…) that a
// user could easily mistake for the genuine Coinbase-issued share.

// Lowercased contract address -> ticker. Sourced from Basescan's own
// "tokenized-stocks" label page (basescan.org/tokens/label/tokenized-stocks),
// which links each entry to coinbase.com/tokenize. Excludes "Catch NVIDIA"
// (cNVDA) from that same page — its site is catch.exchange, not Coinbase, so
// it isn't one of these despite sharing the 0xb200… address prefix.
export const OFFICIAL_TOKENIZED_STOCKS: Record<string, string> = {
  '0xb20000000000000000000078ee7ce2fe4908108c': 'NVDAc',
  '0xb2000000000000000000008bc8786b856e61707c': 'METAc',
  '0xb2000000000000000000002d0ba3164cc74f58b7': 'GOOGLc',
  '0xb200000000000000000000d9192b6b456483c2e8': 'AMZNc',
  '0xb200000000000000000000c2e324d24d7eecd1fb': 'AAPLc',
  '0xb2000000000000000000004884b426556b92883d': 'MSTRc',
  '0xb2000000000000000000001e800a7f5189430cd0': 'TSLAc',
  '0xb2000000000000000000007b9fcbd005511acbd5': 'SPCXc',
  '0xb200000000000000000000ab99cfa739e253872b': 'MSFTc',
  '0xb200000000000000000000397293cb8cda9a10c5': 'SNDKc',
  '0xb20000000000000000000019f6e7c675b73c2e4d': 'CRCLc',
  '0xb2000000000000000000004aff16039ba04bdfbc': 'INTCc',
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
