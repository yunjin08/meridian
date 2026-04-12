import type { Handler } from '@netlify/functions'
import { binancePublicFetch, BinanceError } from './_binance-client.ts'
import { calculateIndicators } from './_indicators.ts'
import type { BinanceKlineArray, BinanceKlineResponse } from '../../src/types/binance.ts'
import type { Candle, CandlesResponse } from '../../src/types/candle.ts'

const VALID_INTERVALS = new Set(['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d'])

function parseKline(raw: BinanceKlineArray): Candle {
  return {
    time: Math.floor(raw[0] / 1000),  // ms → seconds (TradingView expects seconds)
    open: parseFloat(raw[1]),
    high: parseFloat(raw[2]),
    low: parseFloat(raw[3]),
    close: parseFloat(raw[4]),
    volume: parseFloat(raw[5]),
  }
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

  const params = event.queryStringParameters ?? {}
  const symbol = (params['symbol'] ?? 'BTCUSDT').toUpperCase()
  const interval = params['interval'] ?? '1h'
  const limit = Math.min(Math.max(parseInt(params['limit'] ?? '500', 10), 50), 1000)

  if (!VALID_INTERVALS.has(interval)) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Invalid interval' }),
    }
  }

  try {
    const rawKlines = await binancePublicFetch<BinanceKlineResponse>('/api/v3/klines', {
      symbol,
      interval,
      limit,
    })

    if (!Array.isArray(rawKlines) || rawKlines.length === 0) {
      return {
        statusCode: 502,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'Empty kline response from Binance' }),
      }
    }

    const candles = rawKlines.map(parseKline)
    const indicators = calculateIndicators(candles)

    const response: CandlesResponse = {
      candles,
      indicators,
      interval,
      fetchedAt: Date.now(),
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify(response),
    }
  } catch (err) {
    if (err instanceof BinanceError) {
      return {
        statusCode: 502,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'binance_error', code: err.code, msg: err.message }),
      }
    }
    console.error('[candles] unexpected error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'internal_error' }),
    }
  }
}
