import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { preflight, ok, badRequest, methodNotAllowed, internalError, badGateway } from './utils/http.ts'
import { requireAuth } from './utils/auth.ts'
import { CHAT_TOOLS, executeReadTool, isReadTool } from './utils/chat-tools.ts'
import type { DashboardContext, ChatRequest, ChatApiResponse, AppliedTool, ChatLookup, ChatToolName } from '../../src/types/chat.ts'

const MODEL = 'claude-haiku-4-5-20251001'
// A real question can need a lookup and then a write (read the 4h Bollinger
// band, then set an alert on it), so the loop allows one more round than before.
const MAX_ITERATIONS = 5

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
Be brief and factual: one or two sentences for informational answers.
Do not give financial advice. When you create, remove, or toggle an alert, confirm what you did.

You also have lookup tools. Use get_macro_snapshot for interest rates, inflation, the Fed, yields,
the dollar or the macro backdrop; get_crypto_market for sentiment, fear and greed, dominance, funding
or leverage; get_candles for any symbol or timeframe that is not the active chart. Never state such
figures from memory: your training data is stale. If a lookup reports data as unavailable, say so
plainly instead of guessing. Cite the observation date when you quote a macro figure. If a question
needs data none of these tools provide (e.g. gold, equities indices, news), say you cannot look it up.

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

  const acct = ctx.stockAccount
  const money = (n: number) => `${fmt(n)} ${acct?.currency ?? 'USD'}`
  if (acct) {
    prompt += `\n\nTRADING 212 ACCOUNT (${acct.currency}): total ${money(acct.totalValue)}, invested ${money(acct.invested)} (cost ${money(acct.investedCost)}), cash ${money(acct.cashAvailable)}, unrealized P&L ${acct.unrealizedPnl >= 0 ? '+' : ''}${money(acct.unrealizedPnl)}, realized P&L ${acct.realizedPnl >= 0 ? '+' : ''}${money(acct.realizedPnl)}`
  }

  const describeHolding = (h: (typeof ctx.stockHoldings)[number]): string => {
    const q = h.quote
    const p = h.position
    const parts: string[] = []
    if (q) parts.push(`${fmtPrice(q.price)} (${fmtPct(q.changePercent)})`)
    else if (p) parts.push(`${fmt(p.currentPrice)} ${p.currency} (Trading 212 last price)`)
    else parts.push('no price data')
    if (p) {
      parts.push(`${p.quantity} shares @ avg ${fmt(p.avgPrice)} ${p.currency}, value ${money(p.currentValue)}, P&L ${p.unrealizedPnl >= 0 ? '+' : ''}${money(p.unrealizedPnl)}`)
    } else if (h.shares) {
      parts.push(`${h.shares} shares (manual)`)
    } else {
      parts.push('watchlist only')
    }
    return `\n- ${h.ticker}: ${parts.join('; ')}`
  }

  if (stocks.length > 0) {
    prompt += `\n\nSTOCK HOLDINGS:`
    for (const h of stocks) prompt += describeHolding(h)
  }

  if (reits.length > 0) {
    prompt += `\n\nREIT HOLDINGS:`
    for (const h of reits) prompt += describeHolding(h)
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
  const lookups: ChatLookup[] = []

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        tools: CHAT_TOOLS,
        messages: msgs,
      })

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
        const reply = textBlock?.text ?? ''
        const result: ChatApiResponse = { reply, appliedTools, lookups }
        return ok(result)
      }

      if (response.stop_reason === 'tool_use') {
        const toolBlocks = response.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
        )

        // Read tools run here and feed real data back; write tools are only
        // recorded because the browser owns the stores they mutate. Independent
        // lookups in one turn run in parallel.
        const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
          toolBlocks.map(async (block) => {
            if (isReadTool(block.name)) {
              const outcome = await executeReadTool(block.name, block.input, context)
              return { type: 'tool_result' as const, tool_use_id: block.id, content: outcome.content, lookup: outcome.lookup }
            }
            appliedTools.push({ name: block.name as ChatToolName, input: block.input })
            return { type: 'tool_result' as const, tool_use_id: block.id, content: `Applied: ${block.name}` }
          })
        ).then((results) =>
          // Record lookups in the model's call order, not completion order.
          results.map(({ lookup, ...result }) => {
            if (lookup) lookups.push(lookup)
            return result
          })
        )

        msgs = [
          ...msgs,
          { role: 'assistant', content: response.content },
          { role: 'user', content: toolResults },
        ]
        continue
      }

      // max_tokens or other stop: return whatever we have
      break
    }

    // Exhausted iterations: return a confirmation if tools ran
    const fallbackReply =
      appliedTools.length > 0
        ? `Done: ${appliedTools.map((t) => t.name).join(', ')} applied.`
        : 'Could not complete the request.'
    return ok({ reply: fallbackReply, appliedTools, lookups } satisfies ChatApiResponse)
  } catch (err) {
    console.error('[chat] Anthropic API error:', err)
    return badGateway('Failed to reach AI service')
  }
}
