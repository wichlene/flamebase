// Server-side agent core: calls Groq with tool/function-calling so the AI can
// decide to EXECUTE on-chain actions (not just chat). The actual execution
// happens client-side with the user's wallet (see lib/agentExec.ts) after the
// user confirms — the model only proposes the action.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
// Groq deprecated llama-3.3-70b-versatile (2026-06-17); openai/gpt-oss-120b is
// the recommended replacement and supports tool/function calling.
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

const SYSTEM_PROMPT = `You are FlameBase Agent — an on-chain AI assistant on the Base network.
You can actually perform actions through the user's connected wallet by calling tools.

General rules:
- Always reply in the same language the user just wrote in — detect it from their LATEST message (Turkish, English, Hindi, Spanish, whatever) and match it, even if earlier turns were in a different language. This applies to plain-text replies and to the short note you attach alongside a tool call.
- Only call a tool if the user's LATEST message clearly asks for that specific action right now. Never call a tool just because one was called earlier in the conversation — every action needs to be freshly requested, with its own details restated in the current message (e.g. a send needs the address restated; don't reuse an address from a previous turn).
- If the latest message doesn't match any tool below (e.g. it's a question, small talk, or an action FlameBase doesn't support like following), do NOT call a tool — just reply in plain text.
- postId is optional on post-related tools — omit it if the user means "the/a post" without specifying which one; it will resolve to the most recent post. If they reference a specific post, include its numeric ID.
- Never invent addresses, amounts, or post IDs. Never claim an action already happened — the wallet confirms and executes; you only propose, and the result is reported back to the user after.

Tools and when to use them:
- send_token: user asks to send/transfer/pay ETH or USDC to a 0x address given in this same message.
- like_post: user asks to like a post.
- tip_post: user asks to tip/send money to a post's author, with an amount.
- comment_post: user asks to comment/reply on a post, with the comment text.
- create_post: user asks to post/share something on FlameBase, with the content. If the user's message contains an "[attached media ipfs:<hash>]" marker, pass the <hash> value as ipfsHash verbatim and NEVER include the marker text itself in content.
- create_profile: user asks to set up/create their profile with a username.
- check_in: user asks to do their daily check-in.
- tap_counter: user asks to tap/increment the global counter.
- log_entry: user asks to log/save a text entry.
- send_greeting: user asks to send/save a greeting.
- deploy_token: user asks to deploy/create their own token, with name, symbol and supply.
- create_proposal: user asks to create a DAO proposal, with a title (and optional description).
- vote_proposal: user asks to vote for/against a DAO proposal, with the proposal's numeric ID and their stance.
- swap_token: user asks to swap/convert/exchange ETH for USDC or USDC for ETH, with an amount.`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'send_token',
      description: 'Send ETH or an ERC-20 token (USDC) on Base to a recipient address. Use whenever the user asks to send, transfer, or pay funds to an address given in this message.',
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
  {
    type: 'function',
    function: {
      name: 'like_post',
      description: 'Like a post on FlameBase.',
      parameters: {
        type: 'object',
        properties: {
          postId: { type: ['string', 'null'], description: 'Numeric post ID. Use null for "the/a post" with no specific ID — resolves to the latest post.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tip_post',
      description: "Tip ETH to a post's author on FlameBase.",
      parameters: {
        type: 'object',
        properties: {
          postId: { type: ['string', 'null'], description: 'Numeric post ID. Use null to mean the latest post.' },
          amount: { type: 'string', description: 'Human-readable ETH amount to tip, e.g. "0.001"' },
        },
        required: ['amount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'comment_post',
      description: 'Comment on a post on FlameBase.',
      parameters: {
        type: 'object',
        properties: {
          postId: { type: ['string', 'null'], description: 'Numeric post ID. Use null to mean the latest post.' },
          text: { type: 'string', description: 'Comment text' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_post',
      description: 'Create/publish a new post on FlameBase. Supports an optional attached image/video via ipfsHash.',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Post content/text (without any [attached media …] marker)' },
          ipfsHash: { type: ['string', 'null'], description: 'The <hash> from the "[attached media ipfs:<hash>]" marker in the user message, verbatim. Null when the message has no such marker.' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_profile',
      description: 'Create/set up the user profile on FlameBase with a username.',
      parameters: {
        type: 'object',
        properties: {
          username: { type: 'string', description: 'Desired username' },
        },
        required: ['username'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_in',
      description: 'Perform the daily check-in on FlameBase Tools.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tap_counter',
      description: 'Tap/increment the global counter on FlameBase Tools.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_entry',
      description: 'Save a log text entry on FlameBase Tools.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string', description: 'Text to log' } },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_greeting',
      description: 'Save a greeting on FlameBase Tools.',
      parameters: {
        type: 'object',
        properties: { greeting: { type: 'string', description: 'Greeting text' } },
        required: ['greeting'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deploy_token',
      description: "Deploy the user's own ERC-20 token via the FlameBase Token Factory.",
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Token name' },
          symbol: { type: 'string', description: 'Token symbol/ticker' },
          supply: { type: 'string', description: 'Total supply, e.g. "1000000"' },
        },
        required: ['name', 'symbol', 'supply'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_proposal',
      description: 'Create a DAO governance proposal on FlameBase.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Proposal title' },
          description: { type: ['string', 'null'], description: 'Proposal description (use null if none given)' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'vote_proposal',
      description: 'Vote for or against a DAO proposal on FlameBase.',
      parameters: {
        type: 'object',
        properties: {
          proposalId: { type: 'string', description: 'Numeric proposal ID' },
          support: { type: 'boolean', description: 'true to vote for, false to vote against' },
        },
        required: ['proposalId', 'support'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'swap_token',
      description: 'Swap ETH for USDC or USDC for ETH on Base via Uniswap V3.',
      parameters: {
        type: 'object',
        properties: {
          fromToken: { type: 'string', enum: ['ETH', 'USDC'], description: 'Token to swap from' },
          toToken: { type: 'string', enum: ['ETH', 'USDC'], description: 'Token to swap to' },
          amount: { type: 'string', description: 'Human-readable amount of fromToken to swap, e.g. "0.01"' },
        },
        required: ['fromToken', 'toToken', 'amount'],
      },
    },
  },
]

const TOOL_NAMES = new Set(TOOLS.map(t => t.function.name))

export type AgentReply =
  | { type: 'text'; content: string }
  | { type: 'action'; tool: string; args: Record<string, unknown>; note?: string }
  | { type: 'error'; content: string }

export async function runAgent(
  messages: { role: string; content: string }[],
  opts: { maxTokens?: number } = {},
): Promise<AgentReply> {
  if (!process.env.GROQ_API_KEY) return { type: 'error', content: 'GROQ_API_KEY not configured' }

  // Bound the upstream call so a slow/hung model returns a clean error instead
  // of silently exhausting the serverless function timeout (which surfaces to
  // the client as a non-JSON 5xx).
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 25000)
  let res: Response
  try {
    res = await fetch(GROQ_URL, {
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
      signal: controller.signal,
    })
  } catch (e: unknown) {
    const aborted = e instanceof Error && e.name === 'AbortError'
    return { type: 'error', content: aborted ? 'The AI took too long to respond. Please try again.' : 'Could not reach the AI service.' }
  } finally {
    clearTimeout(timeout)
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) return { type: 'error', content: data?.error?.message || `AI error (${res.status})` }
  if (!data) return { type: 'error', content: 'The AI returned an unreadable response.' }

  const msg = data.choices?.[0]?.message
  const call = msg?.tool_calls?.[0]
  if (call?.function?.name && TOOL_NAMES.has(call.function.name)) {
    let args: Record<string, unknown> = {}
    try { args = JSON.parse(call.function.arguments || '{}') } catch {}

    // Defensive guard against small-model tool-repetition: a send_token call is
    // only trustworthy if its recipient address is actually present in the
    // user's latest message, not leaked/reused from an earlier turn (this is
    // what caused the model to re-fire a stale send_token for an unrelated
    // "like a post" request).
    if (call.function.name === 'send_token') {
      const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || ''
      const to = typeof args.to === 'string' ? args.to : ''
      if (!to || !lastUser.toLowerCase().includes(to.toLowerCase())) {
        return {
          type: 'text',
          content: msg?.content || "I can only send ETH or USDC if you give me the recipient address in your message — or ask me something else!",
        }
      }
    }

    return { type: 'action', tool: call.function.name, args, note: msg?.content || undefined }
  }
  return { type: 'text', content: msg?.content || '' }
}
