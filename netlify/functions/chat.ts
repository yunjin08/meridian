import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import type { DashboardContext, ChatRequest } from '../../src/types/chat.ts'

function buildSystemPrompt(ctx: DashboardContext): string {
  const fmtNum = (n: number, decimals = 2) =>
    n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  const fmtPrice = (n: number | null) => (n != null ? `$${fmtNum(n)}` : 'N/A')
  const fmtPct = (n: number | null) =>
    n != null ? `${n >= 0 ? '+' : ''}${fmtNum(n)}%` : 'N/A'

  let prompt = `You are a concise trading assistant embedded in a personal BTC/USDT dashboard.
Answer questions about the live data shown below. Be brief and factual — one or two sentences.
Do not give financial advice. If asked something not covered by this data, say so.

=== LIVE DASHBOARD DATA ===

PRICE (BTC/USDT):
- Current: ${fmtPrice(ctx.price.price)}
- 24h Change: ${fmtPct(ctx.price.changePercent)}
- 24h High: ${fmtPrice(ctx.price.high24h)} | Low: ${fmtPrice(ctx.price.low24h)}
- Volume 24h: ${ctx.price.volume24h != null ? fmtNum(ctx.price.volume24h) + ' BTC' : 'N/A'}
- WebSocket: ${ctx.price.connectionStatus}`

  if (ctx.balance.btc != null || ctx.balance.usdt != null) {
    const total =
      ctx.balance.btcInUsdt != null && ctx.balance.usdt != null
        ? fmtPrice(ctx.balance.btcInUsdt + ctx.balance.usdt)
        : 'N/A'
    prompt += `

ACCOUNT BALANCE:
- BTC: ${ctx.balance.btc != null ? ctx.balance.btc.toFixed(8) : 'N/A'} BTC (≈ ${fmtPrice(ctx.balance.btcInUsdt)})
- USDT: ${fmtPrice(ctx.balance.usdt)}
- Total value: ${total}`
  } else {
    prompt += `

ACCOUNT BALANCE: Not yet loaded`
  }

  prompt += `

CHART (${ctx.chart.timeframe} timeframe):`

  if (ctx.chart.lastCandle != null) {
    const c = ctx.chart.lastCandle
    prompt += `
- Last candle: O ${fmtPrice(c.open)} | H ${fmtPrice(c.high)} | L ${fmtPrice(c.low)} | C ${fmtPrice(c.close)}
- Volume: ${fmtNum(c.volume, 4)} BTC`
  } else {
    prompt += `\n- No candle data loaded`
  }

  if (ctx.chart.rsi != null) {
    const label = ctx.chart.rsi > 70 ? 'overbought' : ctx.chart.rsi < 30 ? 'oversold' : 'neutral'
    prompt += `\n- RSI(14): ${fmtNum(ctx.chart.rsi)} — ${label}`
  }

  if (ctx.chart.macd != null) {
    const m = ctx.chart.macd
    const label = m.histogram > 0 ? 'bullish momentum' : 'bearish momentum'
    prompt += `\n- MACD: line ${fmtNum(m.line)} | signal ${fmtNum(m.signal)} | histogram ${fmtNum(m.histogram)} (${label})`
  }

  if (ctx.chart.bb != null) {
    const b = ctx.chart.bb
    prompt += `\n- Bollinger Bands: upper ${fmtPrice(b.upper)} | middle ${fmtPrice(b.middle)} | lower ${fmtPrice(b.lower)}`
  }

  if (ctx.alerts.length === 0) {
    prompt += `\n\nALERTS: None configured`
  } else {
    prompt += `\n\nALERTS (${ctx.alerts.length} total):`
    for (const a of ctx.alerts) {
      const status = a.triggered
        ? `TRIGGERED at ${new Date(a.triggeredAt ?? 0).toLocaleTimeString()}`
        : a.active
          ? 'active'
          : 'paused'
      prompt += `\n- "${a.label}": ${a.condition} — ${status}`
    }
  }

  return prompt
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) {
    console.error('[chat] ANTHROPIC_API_KEY is not set')
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'AI assistant is not configured' }),
    }
  }

  let body: ChatRequest
  try {
    body = JSON.parse(event.body ?? '{}') as ChatRequest
  } catch {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    }
  }

  const { messages, context } = body
  if (!Array.isArray(messages) || !context) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'messages and context are required' }),
    }
  }

  const client = new Anthropic({ apiKey })

  // Keep last 20 turns to avoid context bloat
  const trimmedMessages = messages.slice(-20)

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: buildSystemPrompt(context),
      messages: trimmedMessages,
    })

    const first = response.content[0]
    if (!first || first.type !== 'text') {
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Unexpected response from AI' }),
      }
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({ reply: first.text }),
    }
  } catch (err) {
    console.error('[chat] Anthropic API error:', err)
    return {
      statusCode: 502,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Failed to reach AI service' }),
    }
  }
}
