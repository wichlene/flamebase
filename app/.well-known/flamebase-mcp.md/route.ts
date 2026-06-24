import { readFile } from 'fs/promises'
import { join } from 'path'

export const dynamic = 'force-static'

// Serve the Base MCP skill spec at a stable, fetchable URL so AI agents (and
// Base's plugin catalog) can read how to drive FlameBase actions on-chain.
export async function GET() {
  const md = await readFile(join(process.cwd(), 'base-plugin', 'flamebase-skill.md'), 'utf8')
  return new Response(md, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
