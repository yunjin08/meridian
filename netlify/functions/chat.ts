import type { Config, HandlerEvent, HandlerResponse } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { preflight, ok, badRequest, methodNotAllowed, internalError, badGateway, corsHeaders } from './utils/http.ts'
import { requireAuth } from './utils/auth.ts'
import { toHandlerEvent, toResponse } from './utils/v2.ts'
import { CHAT_TOOLS, executeReadTool, isReadTool } from './utils/chat-tools.ts'
import type { DashboardContext, ChatRequest, ChatApiResponse, AppliedTool, ChatLookup, ChatStreamEvent, ChatToolName } from '../../src/types/chat.ts'

const MODEL = 'claude-haiku-4-5-20251001'
// A real question can need a lookup and then a write (read the 4h Bollinger
// band, then set an alert on it), so the loop allows one more round than before.
const MAX_ITERATIONS = 5
// A per-holding breakdown of a dozen positions runs past 1024 tokens. When the
// cap is hit anyway, the text written so far is the reply, not a failure.
const MAX_OUTPUT_TOKENS = 2048
const CUT_SHORT_NOTE = '\n\n(Reply cut short at the length limit. Ask me to continue for the rest.)'

// ---------------------------------------------------------------------------
// System prompt builder
// ---------------------------------------------------------------------------

// Instructions never change between requests; the dashboard snapshot changes on
// every one. Splitting them lets the stable half be cached. Haiku 4.5 only
// caches prefixes of 4096+ tokens, so today this is a no-cost preparation; the
// run log's cacheRead field shows when it starts to pay.
const STATIC_INSTRUCTIONS = `You are a concise investing assistant embedded in a personal multi-asset dashboard.
You can answer questions about live data AND manage alerts and the portfolio watchlist using tools.
Be brief and factual: one or two sentences for informational answers.
Do not give financial advice. When you create, remove, or toggle an alert, confirm what you did.

You also have lookup tools. Use get_macro_snapshot for interest rates, inflation, the Fed, yields,
the dollar or the macro backdrop; get_crypto_market for sentiment, fear and greed, dominance, funding
or leverage; get_candles for any symbol or timeframe that is not the active chart. Never state such
figures from memory: your training data is stale. If a lookup reports data as unavailable, say so
plainly instead of guessing. Cite the observation date when you quote a macro figure. If a question
needs data none of these tools provide (e.g. gold, commodities, news headlines), say you cannot look it up.
Use get_stock_quote for any stock or ETF price you do not already have, including SPY/QQQ/DIA for the market.

You know this user's whole portfolio and profit and loss (below). Speak to their position, not in
generalities: when they ask about the market, say what it means for what they hold; when they are losing
money, say so plainly and name where the loss sits; when they ask whether to buy, lay out the data and
their current exposure and leave the decision to them. Never invent a P&L figure; every number you quote
about their portfolio must come from the data below or from a tool result.
If the history contains a system note that a previous request failed, treat that request as not done.`

export function buildSystemBlocks(ctx: DashboardContext): Anthropic.TextBlockParam[] {
  return [
    { type: 'text', text: STATIC_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: buildDashboardData(ctx) },
  ]
}

function buildDashboardData(ctx: DashboardContext): string {
  const fmt = (n: number, d = 2) =>
    n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  const fmtPrice = (n: number | null) => (n != null ? `$${fmt(n)}` : 'N/A')
  const fmtPct = (n: number | null) =>
    n != null ? `${n >= 0 ? '+' : ''}${fmt(n)}%` : 'N/A'

  let prompt = `=== LIVE DASHBOARD DATA ===

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

  // Whole-portfolio view, same numbers as the Overview tab
  const p = ctx.portfolio
  if (p) {
    const mixed = p.isMixedCurrency ? ' (mixed currencies, crypto in USDT and equities in account currency)' : ''
    prompt += `\n\nPORTFOLIO (as on the Overview tab): total ${fmt(p.total)} ${p.totalCurrency}${mixed}, 24h ${p.change24hUsd >= 0 ? '+' : ''}${fmt(p.change24hUsd)} (${fmtPct(p.change24hPercent)})`
    for (const c of p.classes) {
      if (c.holdingCount === 0 && c.value === 0) continue
      const share = p.total > 0 ? ` = ${fmt((c.value / p.total) * 100, 1)}% of total` : ''
      prompt += `\n- ${c.assetClass}: ${fmt(c.value)} ${c.currency}${share}, ${c.holdingCount} holdings, 24h ${fmtPct(c.change24hPercent)}`
    }
  }

  const pnl = ctx.pnl
  if (pnl) {
    const sign = (n: number) => `${n >= 0 ? '+' : ''}${fmt(n)}`
    prompt += `\n\nPROFIT AND LOSS (all time, vs. what the user put in): ${pnl.total == null ? 'not loaded' : `${sign(pnl.total)} ${pnl.totalCurrency}`}`
    const c = pnl.crypto
    if (c) {
      prompt += `\n- Crypto: net ${sign(c.net)} USDT (${fmtPct(c.netPercent)}) on ${fmt(c.netSpent)} still invested, worth ${fmt(c.currentValue)} now. ${c.daysAboveWater} days above water, ${c.daysBelowWater} below${c.lastCrossedOn ? `, last crossed ${c.lastCrossedOn}` : ''}.`
      for (const a of c.assets) {
        prompt += `\n  - ${a.asset}: net ${a.net == null ? 'unknown' : sign(a.net)} (${fmtPct(a.netPercent)}), ${fmt(a.netSpent)} in, ${a.currentValue == null ? 'unpriced' : `${fmt(a.currentValue)} now`}`
      }
      for (const w of c.warnings) prompt += `\n  - Note: ${w}`
    }
    const e = pnl.equities
    if (e) {
      prompt += `\n- Stocks/REITs (Trading 212, ${e.currency}): unrealized ${sign(e.unrealized)}, realized ${sign(e.realized)}, net ${sign(e.net)}`
      for (const pos of e.positions) {
        prompt += `\n  - ${pos.ticker} (${pos.assetClass}): ${sign(pos.unrealized)} (${fmtPct(pos.unrealizedPercent)}), cost ${fmt(pos.totalCost)}, worth ${fmt(pos.currentValue)}`
      }
    }
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

// ---------------------------------------------------------------------------
// The turn: one loop shared by the JSON and the streaming responses
// ---------------------------------------------------------------------------

interface TurnHooks {
  onDelta?: (text: string) => void
  onLookup?: (lookup: ChatLookup) => void
  onApplied?: (tool: AppliedTool) => void
  onStatus?: (text: string) => void
}

const STATUS_BY_TOOL: Record<string, string> = {
  get_macro_snapshot: 'Looking up the macro snapshot',
  get_crypto_market: 'Looking up crypto market data',
  get_candles: 'Reading candles',
  get_stock_quote: 'Fetching live quotes',
}

async function runTurn(
  client: Anthropic,
  context: DashboardContext,
  history: ChatRequest['messages'],
  hooks: TurnHooks
): Promise<ChatApiResponse> {
  const system = buildSystemBlocks(context)
  const startedAt = Date.now()
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  const toolNames: string[] = []
  const appliedTools: AppliedTool[] = []
  const lookups: ChatLookup[] = []
  let iterations = 0
  // Everything the model said this turn, across rounds. What the client
  // streamed and what the final reply says must be the same text.
  const said: string[] = []

  // Keep last 20 turns to avoid context bloat
  let msgs: Anthropic.MessageParam[] = history.slice(-20).map((m) => ({ role: m.role, content: m.content }))

  // One line per run so cost and behaviour are explainable from the function
  // log: which tools ran, how many rounds, tokens in and out, cache hits.
  const logRun = (outcome: string) =>
    console.log(
      JSON.stringify({
        event: 'chat_run', outcome, model: MODEL, iterations, tools: toolNames,
        lookups: lookups.length, applied: appliedTools.length, ...usage, durationMs: Date.now() - startedAt,
      })
    )

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      // Streaming every round means the user sees text the moment the model
      // starts writing, including any preface before a tool call.
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system,
        tools: CHAT_TOOLS,
        messages: msgs,
      })
      if (hooks.onDelta) {
        let firstDelta = true
        stream.on('text', (delta) => {
          // A preface before a tool call and the answer after it are separate
          // paragraphs; the model never emits the break between rounds itself.
          if (firstDelta && said.length > 0) hooks.onDelta?.('\n\n')
          firstDelta = false
          hooks.onDelta?.(delta)
        })
      }
      const response = await stream.finalMessage()
      const roundText = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()
      if (roundText) said.push(roundText)

      iterations++
      usage.input += response.usage.input_tokens
      usage.output += response.usage.output_tokens
      usage.cacheRead += response.usage.cache_read_input_tokens ?? 0
      usage.cacheWrite += response.usage.cache_creation_input_tokens ?? 0

      if (response.stop_reason === 'end_turn') {
        logRun('end_turn')
        return { reply: said.join('\n\n'), appliedTools, lookups }
      }

      if (response.stop_reason === 'tool_use') {
        const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
        toolNames.push(...toolBlocks.map((b) => b.name))
        for (const block of toolBlocks) {
          if (isReadTool(block.name)) hooks.onStatus?.(STATUS_BY_TOOL[block.name] ?? 'Looking that up')
        }

        // Read tools run here and feed real data back; write tools are only
        // recorded because the browser owns the stores they mutate. Independent
        // lookups in one turn run in parallel.
        const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
          toolBlocks.map(async (block) => {
            if (isReadTool(block.name)) {
              const outcome = await executeReadTool(block.name, block.input, context)
              return { type: 'tool_result' as const, tool_use_id: block.id, content: outcome.content, lookup: outcome.lookup }
            }
            const applied: AppliedTool = { name: block.name as ChatToolName, input: block.input }
            appliedTools.push(applied)
            hooks.onApplied?.(applied)
            return { type: 'tool_result' as const, tool_use_id: block.id, content: `Applied: ${block.name}` }
          })
        ).then((results) =>
          // Record lookups in the model's call order, not completion order.
          results.map(({ lookup, ...result }) => {
            if (lookup) {
              lookups.push(lookup)
              hooks.onLookup?.(lookup)
            }
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

      if (response.stop_reason === 'max_tokens' && said.length > 0) {
        hooks.onDelta?.(CUT_SHORT_NOTE)
        logRun('max_tokens')
        return { reply: said.join('\n\n') + CUT_SHORT_NOTE, appliedTools, lookups }
      }

      // Any other stop: return whatever we have
      break
    }

    // Exhausted iterations: return a confirmation if tools ran
    const fallbackReply =
      appliedTools.length > 0
        ? `Done: ${appliedTools.map((t) => t.name).join(', ')} applied.`
        : 'Could not complete the request.'
    logRun('iteration_cap')
    return { reply: fallbackReply, appliedTools, lookups }
  } catch (err) {
    logRun('error')
    throw err
  }
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

type Prepared =
  | { ok: true; client: Anthropic; body: ChatRequest }
  | { ok: false; response: HandlerResponse }

function prepare(event: HandlerEvent): Prepared {
  if (event.httpMethod === 'OPTIONS') return { ok: false, response: preflight() }
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return { ok: false, response: unauthorizedResponse }
  if (event.httpMethod !== 'POST') return { ok: false, response: methodNotAllowed() }

  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) {
    console.error('[chat] ANTHROPIC_API_KEY is not set')
    return { ok: false, response: internalError('AI assistant is not configured') }
  }

  let body: ChatRequest
  try {
    body = JSON.parse(event.body ?? '{}') as ChatRequest
  } catch {
    return { ok: false, response: badRequest('Invalid JSON body') }
  }
  if (!Array.isArray(body.messages) || !body.context) {
    return { ok: false, response: badRequest('messages and context are required') }
  }
  return { ok: true, client: new Anthropic({ apiKey }), body }
}

function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err)
}

/** Buffered JSON reply. Used by tests and by clients that do not ask for a stream. */
export async function handleEvent(event: HandlerEvent): Promise<HandlerResponse> {
  const prepared = prepare(event)
  if (!prepared.ok) return prepared.response
  try {
    const result = await runTurn(prepared.client, prepared.body.context, prepared.body.messages, {})
    return ok(result)
  } catch (err) {
    console.error('[chat] Anthropic API error:', err)
    return badGateway('Failed to reach AI service', { msg: describeError(err) })
  }
}

const NDJSON = 'application/x-ndjson'

function streamTurn(prepared: Extract<Prepared, { ok: true }>): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatStreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'))
      try {
        const result = await runTurn(prepared.client, prepared.body.context, prepared.body.messages, {
          onDelta: (text) => send({ type: 'delta', text }),
          onStatus: (text) => send({ type: 'status', text }),
          onLookup: (lookup) => send({ type: 'lookup', lookup }),
          onApplied: (tool) => send({ type: 'applied', tool }),
        })
        send({ type: 'done', result })
      } catch (err) {
        console.error('[chat] stream failed:', err)
        send({ type: 'error', error: `Failed to reach AI service: ${describeError(err)}` })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: { ...corsHeaders(), 'Content-Type': NDJSON, 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  })
}

// Functions 2.0 entry point: the AI Gateway only injects ANTHROPIC_API_KEY and
// ANTHROPIC_BASE_URL into this runtime, never into a classic handler export.
// A client that accepts NDJSON gets the turn streamed; everyone else gets JSON.
export default async (req: Request): Promise<Response> => {
  try {
    const event = await toHandlerEvent(req)
    if ((event.headers['accept'] ?? '').includes(NDJSON)) {
      const prepared = prepare(event)
      if (!prepared.ok) return toResponse(prepared.response)
      return streamTurn(prepared)
    }
    return toResponse(await handleEvent(event))
  } catch (err) {
    console.error('[chat] unhandled error:', err)
    return toResponse(internalError(`unhandled: ${describeError(err)}`))
  }
}

export const config: Config = { path: '/api/chat' }
