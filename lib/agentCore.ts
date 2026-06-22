// Server-side agent core: calls Groq with tool/function-calling so the AI can
// decide to EXECUTE on-chain actions (not just chat). The actual execution
// happens client-side with the user's wallet (see lib/agentExec.ts) after the
// user confirms — the model only proposes the action.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.3-70b-versatile'

const SYSTEM_PROMPT = `You are FlameBase Agent — an on-chain AI assistant on the Base network.
You can actually perform actions through the user's connected wallet by calling tools.
Rules:
- When the user asks to send/transfer funds, call the send_token tool.
- Only act on a real recipient address the user provided (must start with 0x and be 42 chars). If it's missing or invalid, ask for it instead of calling a tool.
- Amounts are human-readable (e.g. "0.01").
- For anything that isn't an executable action, just answer helpfully and concisely.
- Never invent addresses or amounts. Never claim you sent something — the wallet confirms and executes; you only propose.`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'send_token',
      description: 'Send ETH or an ERC-20 token (USDC) on Base to a recipient address. Use whenever the user asks to send, transfer, or pay funds to an address.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient 0x address (42 chars)' },
          amount: { type: 'string', description: 'Human-readable amount, e.g. "0.01"' },
          token: { type: 'string', enum: ['ETH', 'USDC'], description: 'Which asset to send' },
        },
        required: ['to', 'amount', 'token'],
      },
    },
  },
]

export type AgentReply =
  | { type: 'text'; content: string }
  | { type: 'action'; tool: string; args: Record<string, unknown>; note?: string }
  | { type: 'error'; content: string }

export async function runAgent(
  messages: { role: string; content: string }[],
  opts: { maxTokens?: number } = {},
): Promise<AgentReply> {
  if (!process.env.GROQ_API_KEY) return { type: 'error', content: 'GROQ_API_KEY not configured' }

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      tools: TOOLS,
      tool_choice: 'auto',
      max_tokens: opts.maxTokens ?? 800,
      temperature: 0.6,
    }),
  })

  const data = await res.json()
  if (!res.ok) return { type: 'error', content: data?.error?.message || 'AI error' }

  const msg = data.choices?.[0]?.message
  const call = msg?.tool_calls?.[0]
  if (call?.function?.name) {
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(call.function.arguments || '{}') } catch {}
    return { type: 'action', tool: call.function.name, args, note: msg?.content || undefined }
  }
  return { type: 'text', content: msg?.content || '' }
}
