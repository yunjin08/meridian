import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { preflight, ok, badRequest, methodNotAllowed, internalError, badGateway } from './utils/http.ts'
import { requireAuth } from './utils/auth.ts'
import type { DashboardContext, ChatRequest, ChatApiResponse, AppliedTool, ChatToolName } from '../../src/types/chat.ts'

// ---------------------------------------------------------------------------
// Tool definitions — Claude can call these to manage alerts and portfolio
// ---------------------------------------------------------------------------

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_alert',
    description: `Create a new alert for any asset in the dashboard (crypto or stock).
Alerts fire browser notifications when the condition is met.
Use the exact symbol from the dashboard — e.g. BTCUSDT for Bitcoin, ETHUSDT for Ethereum, AAPL for Apple stock.
For price conditions, use USD (stocks) or USDT (crypto).`,
    input_schema: {
      type: 'object' as const,
      properties: {
        label: {
          type: 'string',
          description: 'Short human-readable name, e.g. "BTC dip alert" or "AAPL above 200"',
        },
        symbol: {
          type: 'string',
          description: 'Asset symbol, e.g. BTCUSDT, ETHUSDT, AAPL, O',
        },
        condition: {
          type: 'object' as const,
          description: 'Alert trigger condition',
          properties: {
            type: {
              type: 'string',
              enum: [
                'price_above',
                'price_below',
                'price_crosses',
                'rsi_above',
                'rsi_below',
                'macd_crossover',
                'macd_crossunder',
              ],
            },
            threshold: {
              type: 'number',
              description: 'Required for price_* and rsi_* conditions. For rsi: 0–100.',
            },
          },
          required: ['type'],
        },
        autoReset: {
          type: 'boolean',
          description: 'For price_crosses only: re-arm after 5-min cooldown. Defaults to false.',
        },
      },
      required: ['label', 'symbol', 'condition'],
    },
  },
  {
    name: 'remove_alert',
    description: 'Permanently delete an alert by its ID (shown in the alerts list in the dashboard context).',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID of the alert to delete' },
      },
      required: ['id'],
    },
  },
  {
    name: 'toggle_alert',
    description: 'Pause an active alert or resume a paused alert by its ID.',
    input_schema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string', description: 'UUID of the alert to toggle' },
      },
      required: ['id'],
    },
  },
  {
    name: 'add_symbol',
    description: 'Add a stock or REIT ticker to the portfolio watchlist so it appears in the Stocks/REITs tab.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ticker: { type: 'string', description: 'Stock ticker, e.g. AAPL, MSFT, O' },
        assetClass: {
          type: 'string',
          enum: ['stock', 'reit'],
          description: 'Whether this is a regular stock or a REIT',
        },
      },
      required: ['ticker', 'assetClass'],
    },
  },
  {
    name: 'remove_symbol',
    description: 'Remove a stock or REIT ticker from the portfolio watchlist.',
    input_schema: {
      type: 'object' as const,
      properties: {
        ticker: { type: 'string', description: 'Stock ticker to remove, e.g. AAPL' },
      },
      required: ['ticker'],
    },
  },
]

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(ctx: DashboardContext): string {
  const fmt = (n: number, d = 2) =>
    n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  const fmtPrice = (n: number | null) => (n != null ? `$${fmt(n)}` : 'N/A')
  const fmtPct = (n: number | null) =>
    n != null ? `${n >= 0 ? '+' : ''}${fmt(n)}%` : 'N/A'

  let prompt = `You are a concise investing assistant embedded in a personal multi-asset dashboard.
You can answer questions about live data AND manage alerts and the portfolio watchlist using tools.
Be brief and factual — one or two sentences for informational answers.
Do not give financial advice. When you create, remove, or toggle an alert, confirm what you did.

=== LIVE DASHBOARD DATA ===

ACTIVE CHART SYMBOL: ${ctx.activeSymbol}
PRICE (${ctx.activeSymbol}):
- Current: ${fmtPrice(ctx.price.price)}
- 24h Change: ${fmtPct(ctx.price.changePercent)}
- 24h High: ${fmtPrice(ctx.price.high24h)} | Low: ${fmtPrice(ctx.price.low24h)}
- WebSocket: ${ctx.price.connectionStatus}`

  // Crypto holdings
  if (ctx.cryptoHoldings.length > 0) {
    prompt += `\n\nCRYPTO HOLDINGS (${ctx.cryptoHoldings.length} assets, total ≈ ${fmtPrice(ctx.totalCryptoUsdt)}):`
    for (const h of ctx.cryptoHoldings) {
      const priceStr = h.price != null ? fmtPrice(h.price) : 'N/A'
      const pctStr = fmtPct(h.changePercent)
      const valStr = h.usdtValue != null ? fmtPrice(h.usdtValue) : 'N/A'
      prompt += `\n- ${h.asset} (${h.symbol}): ${h.free.toFixed(8)} free | price ${priceStr} (${pctStr}) | value ${valStr}`
    }
  } else {
    prompt += `\n\nCRYPTO HOLDINGS: Not yet loaded`
  }

  // Stock / REIT holdings
  const stocks = ctx.stockHoldings.filter((h) => h.assetClass === 'stock')
  const reits = ctx.stockHoldings.filter((h) => h.assetClass === 'reit')

  if (stocks.length > 0) {
    prompt += `\n\nSTOCK HOLDINGS:`
    for (const h of stocks) {
      const q = h.quote
      if (q) {
        prompt += `\n- ${h.ticker}: ${fmtPrice(q.price)} (${fmtPct(q.changePercent)})`
      } else {
        prompt += `\n- ${h.ticker}: no price data`
      }
    }
  }

  if (reits.length > 0) {
    prompt += `\n\nREIT HOLDINGS:`
    for (const h of reits) {
      const q = h.quote
      if (q) {
        prompt += `\n- ${h.ticker}: ${fmtPrice(q.price)} (${fmtPct(q.changePercent)})`
      } else {
        prompt += `\n- ${h.ticker}: no price data`
      }
    }
  }

  // Chart
  prompt += `\n\nCHART (${ctx.chart.timeframe} timeframe, symbol: ${ctx.activeSymbol}):`
  if (ctx.chart.lastCandle != null) {
    const c = ctx.chart.lastCandle
    prompt += `\n- Last candle: O ${fmtPrice(c.open)} | H ${fmtPrice(c.high)} | L ${fmtPrice(c.low)} | C ${fmtPrice(c.close)}`
    prompt += `\n- Volume: ${fmt(c.volume, 4)}`
  } else {
    prompt += `\n- No candle data loaded`
  }

  if (ctx.chart.rsi != null) {
    const label = ctx.chart.rsi > 70 ? 'overbought' : ctx.chart.rsi < 30 ? 'oversold' : 'neutral'
    prompt += `\n- RSI(14): ${fmt(ctx.chart.rsi)} — ${label}`
  }
  if (ctx.chart.macd != null) {
    const m = ctx.chart.macd
    const label = m.histogram > 0 ? 'bullish momentum' : 'bearish momentum'
    prompt += `\n- MACD: line ${fmt(m.line)} | signal ${fmt(m.signal)} | histogram ${fmt(m.histogram)} (${label})`
  }
  if (ctx.chart.bb != null) {
    const b = ctx.chart.bb
    prompt += `\n- Bollinger Bands: upper ${fmtPrice(b.upper)} | middle ${fmtPrice(b.middle)} | lower ${fmtPrice(b.lower)}`
  }

  // Alerts
  if (ctx.alerts.length === 0) {
    prompt += `\n\nALERTS: None configured`
  } else {
    prompt += `\n\nALERTS (${ctx.alerts.length} total — use IDs to remove/toggle):`
    for (const a of ctx.alerts) {
      const status = a.triggered
        ? `TRIGGERED at ${new Date(a.triggeredAt ?? 0).toLocaleTimeString()}`
        : a.active
          ? 'active'
          : 'paused'
      prompt += `\n- ID ${a.id} | "${a.label}" [${a.symbol}]: ${a.condition} — ${status}`
    }
  }

  return prompt
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse
  if (event.httpMethod !== 'POST') return methodNotAllowed()

  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) {
    console.error('[chat] ANTHROPIC_API_KEY is not set')
    return internalError('AI assistant is not configured')
  }

  let body: ChatRequest
  try {
    body = JSON.parse(event.body ?? '{}') as ChatRequest
  } catch {
    return badRequest('Invalid JSON body')
  }

  const { messages, context } = body
  if (!Array.isArray(messages) || !context) {
    return badRequest('messages and context are required')
  }

  const client = new Anthropic({ apiKey })
  const systemPrompt = buildSystemPrompt(context)

  // Keep last 20 turns to avoid context bloat
  const trimmed = messages.slice(-20)
  let msgs: Anthropic.MessageParam[] = trimmed.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  const appliedTools: AppliedTool[] = []

  try {
    // Run up to 3 iterations to handle tool_use → tool_result → final text
    for (let iteration = 0; iteration < 3; iteration++) {
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages: msgs,
      })

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
        const reply = textBlock?.text ?? ''
        const result: ChatApiResponse = { reply, appliedTools }
        return ok(result)
      }

      if (response.stop_reason === 'tool_use') {
        const toolBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        )

        const toolResults: Anthropic.ToolResultBlockParam[] = toolBlocks.map((block) => {
          appliedTools.push({
            name: block.name as ChatToolName,
            input: block.input,
          })
          return {
            type: 'tool_result' as const,
            tool_use_id: block.id,
            content: `Applied: ${block.name}`,
          }
        })

        // Append assistant turn + tool results and loop again
        msgs = [
          ...msgs,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ]
        continue
      }

      // max_tokens or other stop — return whatever we have
      break
    }

    // Exhausted iterations — return a confirmation if tools ran
    const fallbackReply =
      appliedTools.length > 0
        ? `Done — ${appliedTools.map((t) => t.name).join(', ')} applied.`
        : 'Could not complete the request.'
    return ok({ reply: fallbackReply, appliedTools } satisfies ChatApiResponse)
  } catch (err) {
    console.error('[chat] Anthropic API error:', err)
    return badGateway('Failed to reach AI service')
  }
}
