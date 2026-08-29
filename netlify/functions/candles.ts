import type { Handler } from '@netlify/functions'
import { binancePublicFetch, BinanceError } from './utils/binance-client.ts'
import { calculateIndicators } from './utils/indicators.ts'
import { preflight, ok, badRequest, badGateway, internalError, unauthorized } from './utils/http.ts'
import { isAuthorized, isPublicMarketRequest } from './utils/auth.ts'
import type { BinanceKlineArray, BinanceKlineResponse } from '../../src/types/binance.ts'
import type { Candle, CandlesResponse } from '../../src/types/candle.ts'

const VALID_INTERVALS = new Set(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'])
const MAX_LIMIT = 1000
// Anonymous landing-page traffic gets enough history for the indicators but
// not the full window, so a public visitor costs less Binance weight than the owner.
export const PUBLIC_CANDLE_LIMIT = 200

function parseKline(raw: BinanceKlineArray): Candle {
  return {
    time: Math.floor(raw[0] / 1000), // ms → seconds (TradingView expects seconds)
    open: Number.parseFloat(raw[1]),
    high: Number.parseFloat(raw[2]),
    low: Number.parseFloat(raw[3]),
    close: Number.parseFloat(raw[4]),
    volume: Number.parseFloat(raw[5]),
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const authorized = isAuthorized(event)
  if (!authorized && !isPublicMarketRequest(event)) return unauthorized('unauthorized')

  const params = event.queryStringParameters ?? {}
  const symbol = (params['symbol'] ?? 'BTCUSDT').toUpperCase()
  const interval = params['interval'] ?? '1h'
  const maxLimit = authorized ? MAX_LIMIT : PUBLIC_CANDLE_LIMIT
  const limit = Math.min(Math.max(Number.parseInt(params['limit'] ?? '500', 10), 50), maxLimit)

  if (!VALID_INTERVALS.has(interval)) return badRequest('Invalid interval')

  try {
    const rawKlines = await binancePublicFetch<BinanceKlineResponse>('/api/v3/klines', {
      symbol,
      interval,
      limit,
    })

    if (!Array.isArray(rawKlines) || rawKlines.length === 0) {
      return badGateway('Empty kline response from Binance')
    }

    // lightweight-charts requires strictly ascending `time`. Some intervals can
    // occasionally arrive out-of-order, so normalize by kline open time first.
    const sortedRawKlines = [...rawKlines].sort((a, b) => a[0] - b[0])
    const candles = sortedRawKlines.map(parseKline)
    const indicators = calculateIndicators(candles)

    const response: CandlesResponse = { candles, indicators, interval, fetchedAt: Date.now() }
    return ok(response)
  } catch (err) {
    if (err instanceof BinanceError) {
      return badGateway('binance_error', { code: err.code, msg: err.message })
    }
    console.error('[candles] unexpected error:', err)
    return internalError('internal_error')
  }
}
