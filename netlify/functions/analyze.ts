import type { Handler } from '@netlify/functions'
import Anthropic from '@anthropic-ai/sdk'
import { preflight, ok, badRequest, methodNotAllowed, internalError, badGateway } from './utils/http.ts'
import { requireAuth } from './utils/auth.ts'
import type { AnalyzeRequest, AnalyzeApiResponse, AnalysisResult } from '../../src/types/analysis.ts'

const MODEL = 'claude-haiku-4-5-20251001'

// Single required tool. Forcing tool_choice guarantees the model returns this
// exact structure instead of prose we would have to parse.
const REPORT_TOOL: Anthropic.Tool = {
  name: 'report_analysis',
  description: 'Report a structured technical read of the current chart. Call exactly once.',
  input_schema: {
    type: 'object' as const,
    properties: {
      trend: {
        type: 'string',
        enum: ['bullish', 'bearish', 'neutral'],
        description: 'Overall directional bias from price action and indicators.',
      },
      momentum: {
        type: 'string',
        enum: ['strong', 'moderate', 'weak'],
        description: 'Strength of the current move.',
      },
      summary: {
        type: 'string',
        description: '2-3 sentences, plain English, factual. Describe what the chart is doing now.',
      },
      signals: {
        type: 'array',
        items: { type: 'string' },
        description: '2-4 concrete observations, e.g. RSI/MACD agreement or divergence, price vs Bollinger Bands.',
      },
      support: {
        type: ['number', 'null'],
        description: 'Nearest support price from the recent window, or null if none is clear.',
      },
      resistance: {
        type: ['number', 'null'],
        description: 'Nearest resistance price from the recent window, or null if none is clear.',
      },
      confidence: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'How strongly the available data supports this read.',
      },
    },
    required: ['trend', 'momentum', 'summary', 'signals', 'support', 'resistance', 'confidence'],
  },
}

function buildPrompt(req: AnalyzeRequest): string {
  const n = (v: number | null, d = 2) => (v != null ? v.toFixed(d) : 'N/A')

  let p = `Analyze this ${req.timeframe} chart for ${req.symbol}. You are a technical-analysis assistant.
Read only the data provided. Do not invent values. Do not give financial advice or price predictions.
Base support/resistance on the recent price window. Then call report_analysis exactly once.

PRICE
- Current: ${n(req.price.current)}
- 24h change: ${req.price.changePercent != null ? `${req.price.changePercent.toFixed(2)}%` : 'N/A'}
- 24h high / low: ${n(req.price.high24h)} / ${n(req.price.low24h)}
- Recent window high / low: ${n(req.recentHigh)} / ${n(req.recentLow)}

INDICATORS`

  if (req.indicators.rsi != null) {
    const state = req.indicators.rsi > 70 ? 'overbought' : req.indicators.rsi < 30 ? 'oversold' : 'neutral'
    p += `\n- RSI(14): ${req.indicators.rsi.toFixed(1)} (${state})`
  } else {
    p += `\n- RSI(14): N/A`
  }

  if (req.indicators.macd != null) {
    const m = req.indicators.macd
    const bias = m.histogram >= 0 ? 'bullish histogram' : 'bearish histogram'
    p += `\n- MACD(12,26,9): line ${m.line.toFixed(2)}, signal ${m.signal.toFixed(2)}, histogram ${m.histogram.toFixed(2)} (${bias})`
  } else {
    p += `\n- MACD: N/A`
  }

  if (req.indicators.bb != null) {
    const b = req.indicators.bb
    p += `\n- Bollinger Bands(20,2): upper ${b.upper.toFixed(2)}, middle ${b.middle.toFixed(2)}, lower ${b.lower.toFixed(2)}`
  } else {
    p += `\n- Bollinger Bands: N/A`
  }

  if (req.closes.length > 0) {
    p += `\n\nRECENT CLOSES (oldest -> newest, ${req.closes.length} points):\n${req.closes.map((c) => c.toFixed(2)).join(', ')}`
  }

  return p
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse
  if (event.httpMethod !== 'POST') return methodNotAllowed()

  const apiKey = process.env['ANTHROPIC_API_KEY']
  if (!apiKey) {
    console.error('[analyze] ANTHROPIC_API_KEY is not set')
    return internalError('AI analysis is not configured')
  }

  let body: AnalyzeRequest
  try {
    body = JSON.parse(event.body ?? '{}') as AnalyzeRequest
  } catch {
    return badRequest('Invalid JSON body')
  }

  if (!body.symbol || !body.timeframe || !Array.isArray(body.closes)) {
    return badRequest('symbol, timeframe and closes are required')
  }

  const client = new Anthropic({ apiKey })

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools: [REPORT_TOOL],
      tool_choice: { type: 'tool', name: 'report_analysis' },
      messages: [{ role: 'user', content: buildPrompt(body) }],
    })

    const toolBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'report_analysis'
    )

    if (!toolBlock) {
      console.error('[analyze] model did not return the report_analysis tool call')
      return badGateway('AI analysis returned no result')
    }

    const result: AnalyzeApiResponse = {
      analysis: toolBlock.input as AnalysisResult,
      model: MODEL,
      generatedAt: Date.now(),
    }
    return ok(result)
  } catch (err) {
    console.error('[analyze] Anthropic API error:', err)
    return badGateway('Failed to reach AI service')
  }
}
