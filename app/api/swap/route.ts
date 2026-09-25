import { NextResponse } from 'next/server'

// Server-side proxy to the KyberSwap aggregator (free, no key). It routes a
// swap across ALL Base DEXs — Aerodrome, Uniswap V2/V3/V4, etc. — so the B20
// DEX can buy/sell any token that has liquidity anywhere on Base, not just
// Uniswap V3 WETH pools. We proxy it (rather than calling from the browser) to
// avoid CORS and keep a stable client-id.

const API = 'https://aggregator-api.kyberswap.com/base/api/v1'
const H = { 'x-client-id': 'flamebase' }
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

// Platform fee — a cut of every trade, taken via the aggregator's built-in fee
// feature and paid to FEE_RECEIVER. Charged on the ETH leg (currency_in on a
// buy, currency_out on a sell) so it always accrues as ETH.
const FEE_BPS = 100 // 1%
const FEE_RECEIVER = '0xa77A5D4D37d6F39C20C2441295da9fA60Ab9fD69'

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const tokenIn = String(body.tokenIn || '').toLowerCase()
    const tokenOut = String(body.tokenOut || '').toLowerCase()
    const amountIn = String(body.amountIn || '')
    const sender = String(body.sender || '')
    const recipient = String(body.recipient || sender)
    const slippage = Number.isFinite(body.slippageBps) ? Number(body.slippageBps) : 300

    if (!/^0x[0-9a-f]{40}$/.test(tokenIn) || !/^0x[0-9a-f]{40}$/.test(tokenOut) || !/^\d+$/.test(amountIn) || !/^0x[0-9a-fA-F]{40}$/.test(sender)) {
      return NextResponse.json({ error: 'bad params' }, { status: 400 })
    }

    // 1) get the best route across all Base DEXs (with our platform fee on the ETH leg).
    // The affiliate-fee params can themselves make a thin pool unroutable (the
    // fee eats into an already-tight output, and Kyber's routing engine drops
    // the path entirely rather than returning a worse quote) — if the
    // fee-inclusive request comes back empty, retry once with no fee rather
    // than blocking a trade a plain swap could still complete.
    const chargeFeeBy = tokenIn === NATIVE ? 'currency_in' : 'currency_out'
    const feeQs = `&feeAmount=${FEE_BPS}&chargeFeeBy=${chargeFeeBy}&isInBps=true&feeReceiver=${FEE_RECEIVER}`
    const baseQs = `tokenIn=${tokenIn}&tokenOut=${tokenOut}&amountIn=${amountIn}&gasInclude=true`
    let route = await (await fetch(`${API}/routes?${baseQs}${feeQs}`, { headers: H })).json()
    let summary = route?.data?.routeSummary
    let feeApplied = true
    if (!summary) {
      route = await (await fetch(`${API}/routes?${baseQs}`, { headers: H })).json()
      summary = route?.data?.routeSummary
      feeApplied = false
    }
    if (!summary) return NextResponse.json({ error: route?.message || 'route not found' }, { status: 404 })

    // 2) build the executable transaction
    async function build(routeSummary: typeof summary) {
      const res = await fetch(`${API}/route/build`, {
        method: 'POST',
        headers: { ...H, 'content-type': 'application/json' },
        body: JSON.stringify({ routeSummary, sender, recipient, slippageTolerance: slippage }),
      })
      const json = await res.json()
      return json?.data
    }

    let b = await build(summary)
    // Same reasoning as the fee-inclusive routes retry above, one step
    // later: a route that quoted fine WITH the fee can still fail to build
    // once Kyber actually tries to execute it against a thin pool — retrying
    // the build with a no-fee route (already fetched above as a fallback,
    // or fetched fresh here) rather than failing the trade outright.
    if ((!b?.data || !b?.routerAddress) && feeApplied) {
      const noFeeRoute = await (await fetch(`${API}/routes?${baseQs}`, { headers: H })).json()
      const noFeeSummary = noFeeRoute?.data?.routeSummary
      if (noFeeSummary) {
        summary = noFeeSummary
        feeApplied = false
        b = await build(summary)
      }
    }
    if (!b?.data || !b?.routerAddress) return NextResponse.json({ error: 'Not enough liquidity for this trade size' }, { status: 502 })

    return NextResponse.json({
      to: b.routerAddress as string,
      router: b.routerAddress as string,
      data: b.data as string,
      value: tokenIn === NATIVE ? amountIn : '0',
      amountOut: String(summary.amountOut || '0'),
      needsApprove: tokenIn !== NATIVE,
    })
  } catch {
    return NextResponse.json({ error: 'swap service unavailable' }, { status: 500 })
  }
}
