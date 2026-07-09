import { NextResponse } from 'next/server'

// Server-side proxy to the KyberSwap aggregator (free, no key). It routes a
// swap across ALL Base DEXs — Aerodrome, Uniswap V2/V3/V4, etc. — so the B20
// DEX can buy/sell any token that has liquidity anywhere on Base, not just
// Uniswap V3 WETH pools. We proxy it (rather than calling from the browser) to
// avoid CORS and keep a stable client-id.

const API = 'https://aggregator-api.kyberswap.com/base/api/v1'
const H = { 'x-client-id': 'flamebase' }
const NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'

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

    // 1) get the best route across all Base DEXs
    const routeRes = await fetch(`${API}/routes?tokenIn=${tokenIn}&tokenOut=${tokenOut}&amountIn=${amountIn}&gasInclude=true`, { headers: H })
    const route = await routeRes.json()
    const summary = route?.data?.routeSummary
    if (!summary) return NextResponse.json({ error: route?.message || 'No route for this token' }, { status: 404 })

    // 2) build the executable transaction
    const buildRes = await fetch(`${API}/route/build`, {
      method: 'POST',
      headers: { ...H, 'content-type': 'application/json' },
      body: JSON.stringify({ routeSummary: summary, sender, recipient, slippageTolerance: slippage }),
    })
    const build = await buildRes.json()
    const b = build?.data
    if (!b?.data || !b?.routerAddress) return NextResponse.json({ error: build?.message || 'Could not build swap' }, { status: 502 })

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
