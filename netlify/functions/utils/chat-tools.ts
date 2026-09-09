import type Anthropic from '@anthropic-ai/sdk'
import { BinanceError } from './binance-client.ts'
import { EmptyKlinesError, fetchCandlesWithIndicators, VALID_INTERVALS } from './klines.ts'
import { fetchCryptoMarket, fetchMacroSnapshot, MissingFredKeyError } from './market-data.ts'
import type { ChatLookup, ChatReadToolName, DashboardContext } from '../../../src/types/chat.ts'
import type { CryptoMarketSnapshot, MacroSeriesPoint, MacroSnapshot } from '../../../src/types/market.ts'
import type { CandlesResponse } from '../../../src/types/candle.ts'

// ---------------------------------------------------------------------------
// Write tools: recorded by the function, applied by the browser
// ---------------------------------------------------------------------------

const WRITE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'add_alert',
    description: `Create a new alert for any asset in the dashboard (crypto or stock).
Alerts fire browser notifications when the condition is met.
Use the exact symbol from the dashboard, e.g. BTCUSDT for Bitcoin, ETHUSDT for Ethereum, AAPL for Apple stock.
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
              description: 'Required for price_* and rsi_* conditions. For rsi: 0 to 100.',
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
// Read tools: executed here, result text goes back to the model
// ---------------------------------------------------------------------------

const READ_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_macro_snapshot',
    description: `Fetch the latest US macro figures from FRED: Fed funds rate, CPI inflation year on year,
unemployment, 2y and 10y Treasury yields, the 10y-2y spread, and the broad dollar index.
Call this whenever the user asks about interest rates, inflation, the Fed, yields, the dollar,
recession signals, or the macro backdrop. Never state these numbers from memory.
Returns each figure with its latest value, previous value and observation date.`,
    input_schema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'get_crypto_market',
    description: `Fetch live crypto market-wide stats: total market cap and its 24h change, BTC and ETH dominance,
the Fear and Greed index, and perpetual futures funding rate plus open interest for one symbol.
Call this when the user asks about market sentiment, fear or greed, dominance, funding, leverage,
liquidation risk, or "how is the crypto market doing". Defaults to the active chart symbol.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: {
          type: 'string',
          description: 'Perpetual symbol for funding data, e.g. BTCUSDT or ETHUSDT. Omit to use the active chart symbol.',
        },
      },
    },
  },
  {
    name: 'get_candles',
    description: `Fetch recent candles with RSI, MACD and Bollinger Bands for any Binance spot symbol and timeframe.
Call this when the user asks about a symbol or timeframe that is not the active chart, asks how something
"looks" on a given timeframe, or wants a level (Bollinger band, recent high or low) to set an alert against.
Returns a compact summary: window high and low, change over the window, latest indicator values, last closes.`,
    input_schema: {
      type: 'object' as const,
      properties: {
        symbol: { type: 'string', description: 'Binance spot symbol, e.g. BTCUSDT, ETHUSDT, SOLUSDT' },
        interval: {
          type: 'string',
          enum: [...VALID_INTERVALS],
          description: 'Candle timeframe',
        },
        limit: {
          type: 'number',
          description: 'Number of candles, 50 to 200. Default 100.',
        },
      },
      required: ['symbol', 'interval'],
    },
  },
]

export const CHAT_TOOLS: Anthropic.Tool[] = [...WRITE_TOOLS, ...READ_TOOLS]

export const READ_TOOL_NAMES: ReadonlySet<string> = new Set<ChatReadToolName>([
  'get_macro_snapshot',
  'get_crypto_market',
  'get_candles',
])

export function isReadTool(name: string): name is ChatReadToolName {
  return READ_TOOL_NAMES.has(name)
}

// ---------------------------------------------------------------------------
// Formatting: compact text built from parsed fields, never the raw upstream body
// ---------------------------------------------------------------------------

const num = (v: number | null | undefined, digits = 2): string =>
  v == null || Number.isNaN(v) ? 'n/a' : v.toFixed(digits)

// Sub-dollar pairs (PEPE, SHIB) need more precision or every level reads $0.00.
const moneyDigits = (v: number): number => (Math.abs(v) >= 1 ? 2 : Math.abs(v) >= 0.01 ? 4 : 8)

const money = (v: number | null | undefined): string =>
  v == null
    ? 'n/a'
    : `$${v.toLocaleString('en-US', { minimumFractionDigits: moneyDigits(v), maximumFractionDigits: moneyDigits(v) })}`

function formatSeriesPoint(p: MacroSeriesPoint): string {
  if (p.value == null) return `- ${p.label}: unavailable`
  const prev = p.previous == null ? '' : ` (previous ${num(p.previous)}${p.unit === 'index' ? '' : p.unit})`
  return `- ${p.label}: ${num(p.value)}${p.unit === 'index' ? '' : p.unit}${prev}, as of ${p.date ?? 'n/a'}`
}

export function formatMacroSnapshot(m: MacroSnapshot): string {
  const lines = [formatSeriesPoint(m.cpiYoY), ...m.series.map(formatSeriesPoint)]
  return `US macro snapshot (FRED, fetched ${new Date(m.fetchedAt).toISOString()}):\n${lines.join('\n')}`
}

export function formatCryptoMarket(c: CryptoMarketSnapshot): string {
  const cap = c.totalMarketCapUsd == null ? 'n/a' : `$${(c.totalMarketCapUsd / 1e12).toFixed(2)}T`
  const lines = [
    `- Total crypto market cap: ${cap} (${c.marketCapChange24hPct == null ? 'n/a' : `${c.marketCapChange24hPct >= 0 ? '+' : ''}${num(c.marketCapChange24hPct)}% 24h`})`,
    `- Dominance: BTC ${num(c.btcDominancePct, 1)}%, ETH ${num(c.ethDominancePct, 1)}%`,
    c.fearGreed
      ? `- Fear & Greed: ${c.fearGreed.value} (${c.fearGreed.label})${c.fearGreed.previous == null ? '' : `, yesterday ${c.fearGreed.previous}`}`
      : '- Fear & Greed: unavailable',
    c.funding
      ? `- ${c.symbol} perp: mark ${money(c.funding.markPrice)}, last funding ${num(c.funding.lastFundingRatePct, 4)}% per funding interval, open interest ${c.funding.openInterest == null ? 'n/a' : `${c.funding.openInterest.toLocaleString('en-US', { maximumFractionDigits: 0 })} (base asset units)`}`
      : `- ${c.symbol} perp funding: unavailable (no perpetual for this symbol or Binance futures unreachable)`,
  ]
  return `Crypto market (fetched ${new Date(c.fetchedAt).toISOString()}):\n${lines.join('\n')}`
}

const last = (arr: number[]): number | null => {
  for (let i = arr.length - 1; i >= 0; i--) {
    const v = arr[i]
    if (v != null && !Number.isNaN(v)) return v
  }
  return null
}

export function formatCandlesSummary(symbol: string, data: CandlesResponse): string {
  const { candles, indicators } = data
  const first = candles[0]
  const latest = candles[candles.length - 1]
  if (!first || !latest) return `No candles returned for ${symbol} ${data.interval}.`

  let high = -Infinity
  let low = Infinity
  for (const c of candles) {
    if (c.high > high) high = c.high
    if (c.low < low) low = c.low
  }
  const change = ((latest.close / first.open) - 1) * 100
  const rsi = last(indicators.rsi)
  const macdLine = last(indicators.macd.macdLine)
  const macdSignal = last(indicators.macd.signalLine)
  const macdHist = last(indicators.macd.histogram)
  const bbUpper = last(indicators.bollingerBands.upper)
  const bbMiddle = last(indicators.bollingerBands.middle)
  const bbLower = last(indicators.bollingerBands.lower)
  const closes = candles.slice(-10).map((c) => money(c.close)).join(', ')

  return [
    `${symbol} ${data.interval}, ${candles.length} candles, window ${new Date(first.time * 1000).toISOString()} to ${new Date(latest.time * 1000).toISOString()}:`,
    `- Last close ${money(latest.close)}; window high ${money(high)}, low ${money(low)}; change over window ${change >= 0 ? '+' : ''}${num(change)}%`,
    `- RSI(14) ${num(rsi)}${rsi == null ? '' : rsi > 70 ? ' (overbought)' : rsi < 30 ? ' (oversold)' : ' (neutral)'}`,
    `- MACD line ${num(macdLine)}, signal ${num(macdSignal)}, histogram ${num(macdHist)}${macdHist == null ? '' : macdHist > 0 ? ' (bullish momentum)' : ' (bearish momentum)'}`,
    `- Bollinger upper ${money(bbUpper)}, middle ${money(bbMiddle)}, lower ${money(bbLower)}`,
    `- Last 10 closes: ${closes}`,
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export interface ReadToolOutcome {
  /** Text handed back to the model as the tool_result. */
  content: string
  lookup: ChatLookup
}

interface CandlesInput {
  symbol?: unknown
  interval?: unknown
  limit?: unknown
}

const CANDLE_LIMIT_MIN = 50
const CANDLE_LIMIT_MAX = 200
const CANDLE_LIMIT_DEFAULT = 100

/**
 * Errors are returned as text, not thrown: the model needs something it can
 * act on ("not configured", "rejected symbol") and the turn must continue.
 */
export async function executeReadTool(
  name: ChatReadToolName,
  input: unknown,
  ctx: DashboardContext
): Promise<ReadToolOutcome> {
  switch (name) {
    case 'get_macro_snapshot': {
      const lookup: ChatLookup = { name, summary: 'US macro snapshot' }
      try {
        return { content: formatMacroSnapshot(await fetchMacroSnapshot()), lookup }
      } catch (err) {
        if (err instanceof MissingFredKeyError) {
          return {
            content: 'Macro data is not configured on this dashboard (FRED_API_KEY is missing). Tell the user macro figures are unavailable; do not guess them.',
            lookup,
          }
        }
        console.error('[chat-tools] macro snapshot failed:', err)
        return { content: 'FRED could not be reached right now. Tell the user macro figures are temporarily unavailable.', lookup }
      }
    }
    case 'get_crypto_market': {
      const raw = (input as { symbol?: unknown } | null)?.symbol
      const symbol = typeof raw === 'string' && raw.trim() ? raw.trim().toUpperCase() : ctx.activeSymbol
      const lookup: ChatLookup = { name, summary: `crypto market, ${symbol} funding` }
      try {
        return { content: formatCryptoMarket(await fetchCryptoMarket(symbol)), lookup }
      } catch (err) {
        console.error('[chat-tools] crypto market failed:', err)
        return { content: 'Crypto market data could not be fetched right now. Tell the user it is temporarily unavailable.', lookup }
      }
    }
    case 'get_candles': {
      const i = (input ?? {}) as CandlesInput
      const symbol = typeof i.symbol === 'string' ? i.symbol.trim().toUpperCase() : ''
      const interval = typeof i.interval === 'string' ? i.interval : ''
      const limitRaw = typeof i.limit === 'number' && Number.isFinite(i.limit) ? Math.round(i.limit) : CANDLE_LIMIT_DEFAULT
      const limit = Math.min(Math.max(limitRaw, CANDLE_LIMIT_MIN), CANDLE_LIMIT_MAX)
      const lookup: ChatLookup = { name, summary: `${symbol || '?'} ${interval || '?'}, ${limit} candles` }

      if (!symbol) return { content: 'get_candles needs a symbol such as BTCUSDT.', lookup }
      if (!VALID_INTERVALS.has(interval)) {
        return { content: `Interval "${interval}" is not supported. Use one of: ${[...VALID_INTERVALS].join(', ')}.`, lookup }
      }
      try {
        const data = await fetchCandlesWithIndicators(symbol, interval, limit)
        return { content: formatCandlesSummary(symbol, data), lookup }
      } catch (err) {
        if (err instanceof BinanceError) {
          return { content: `Binance rejected ${symbol}: ${err.message.replace(/\.$/, '')}. Check the symbol is a Binance spot pair like ETHUSDT.`, lookup }
        }
        if (err instanceof EmptyKlinesError) return { content: `Binance returned no candles for ${symbol} ${interval}.`, lookup }
        console.error('[chat-tools] get_candles failed:', err)
        return { content: `Candles for ${symbol} could not be fetched right now.`, lookup }
      }
    }
  }
}
