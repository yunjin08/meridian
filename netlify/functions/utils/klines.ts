import { binancePublicFetch } from './binance-client.ts'
import { calculateIndicators } from './indicators.ts'
import type { BinanceKlineArray, BinanceKlineResponse } from '../../../src/types/binance.ts'
import type { Candle, CandlesResponse } from '../../../src/types/candle.ts'

export const VALID_INTERVALS: ReadonlySet<string> = new Set([
  '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d',
])

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

export class EmptyKlinesError extends Error {
  constructor() {
    super('Empty kline response from Binance')
    this.name = 'EmptyKlinesError'
  }
}

/**
 * The candles endpoint and the chat's get_candles tool share this so a symbol
 * reads the same whether it is on screen or asked about in the chat.
 */
export async function fetchCandlesWithIndicators(
  symbol: string,
  interval: string,
  limit: number
): Promise<CandlesResponse> {
  const rawKlines = await binancePublicFetch<BinanceKlineResponse>('/api/v3/klines', {
    symbol,
    interval,
    limit,
  })

  if (!Array.isArray(rawKlines) || rawKlines.length === 0) throw new EmptyKlinesError()

  // lightweight-charts requires strictly ascending `time`. Some intervals can
  // occasionally arrive out-of-order, so normalize by kline open time first.
  const sortedRawKlines = [...rawKlines].sort((a, b) => a[0] - b[0])
  const candles = sortedRawKlines.map(parseKline)
  const indicators = calculateIndicators(candles)

  return { candles, indicators, interval, fetchedAt: Date.now() }
}
