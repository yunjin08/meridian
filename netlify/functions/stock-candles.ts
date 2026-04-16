import type { Handler } from '@netlify/functions'
import { finnhubFetch, FinnhubError } from './utils/finnhub-client.ts'
import { calculateIndicators } from './utils/indicators.ts'
import { preflight, ok, badRequest, badGateway, internalError } from './utils/http.ts'
import { requireAuth } from './utils/auth.ts'
import type { FinnhubCandle } from '../../src/types/finnhub.ts'
import type { Candle, CandlesResponse } from '../../src/types/candle.ts'

// Map dashboard timeframes to Finnhub resolutions.
// Note: Finnhub has no native 4h — we use 60 (1h) for 4h requests.
const RESOLUTION_MAP: Record<string, string> = {
  '1m':  '1',
  '15m': '15',
  '1h':  '60',
  '4h':  '60',   // no native 4h; 1h data is used instead
  '1d':  'D',
}

function parseFinnhubCandles(raw: FinnhubCandle): Candle[] {
  if (raw.s !== 'ok') return []
  const candles: Candle[] = []
  for (let i = 0; i < raw.t.length; i++) {
    const time = raw.t[i]
    const open = raw.o[i]
    const high = raw.h[i]
    const low  = raw.l[i]
    const close = raw.c[i]
    const volume = raw.v[i]
    if (
      time === undefined ||
      open === undefined ||
      high === undefined ||
      low === undefined ||
      close === undefined ||
      volume === undefined
    ) continue
    candles.push({ time, open, high, low, close, volume })
  }
  return candles
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  const params = event.queryStringParameters ?? {}
  const ticker = (params['ticker'] ?? '').toUpperCase()
  const interval = params['interval'] ?? '1h'

  if (!ticker) return badRequest('ticker parameter is required')

  const resolution = RESOLUTION_MAP[interval]
  if (resolution === undefined) return badRequest('Invalid interval')

  // Fetch ~500 candles worth of history
  const now = Math.floor(Date.now() / 1000)
  const secondsPerCandle: Record<string, number> = {
    '1':  60,
    '15': 900,
    '60': 3600,
    'D':  86400,
  }
  const secsPerCandle = secondsPerCandle[resolution] ?? 3600
  const from = now - secsPerCandle * 500

  try {
    const raw = await finnhubFetch<FinnhubCandle>('/stock/candle', {
      symbol: ticker,
      resolution,
      from,
      to: now,
    })

    if (raw.s !== 'ok') {
      return badGateway('no_data', { msg: `No candle data for ${ticker}` })
    }

    const candles = parseFinnhubCandles(raw)
    if (candles.length === 0) {
      return badGateway('no_data', { msg: `Empty candle data for ${ticker}` })
    }

    // Sort ascending (Finnhub should already be sorted, but enforce it)
    candles.sort((a, b) => a.time - b.time)

    const indicators = calculateIndicators(candles)
    const response: CandlesResponse = {
      candles,
      indicators,
      interval,
      fetchedAt: Date.now(),
    }
    return ok(response)
  } catch (err) {
    if (err instanceof FinnhubError) {
      return badGateway('finnhub_error', { msg: err.message })
    }
    console.error('[stock-candles] unexpected error:', err)
    return internalError('internal_error')
  }
}
