import { RSI, MACD, BollingerBands } from 'technicalindicators'
import type { Candle, IndicatorData } from '../../../src/types/candle.ts'

/**
 * NaN-pad an array so it aligns with a target length.
 * Indicators produce shorter arrays than input — padding the start with NaN
 * keeps indices aligned with the candles array.
 */
function padStart(arr: number[], targetLength: number): number[] {
  const padding = targetLength - arr.length
  return padding > 0 ? [...Array<number>(padding).fill(NaN), ...arr] : arr
}

export function calculateIndicators(candles: Candle[]): IndicatorData {
  const closes = candles.map((c) => c.close)
  const highs = candles.map((c) => c.high)
  const lows = candles.map((c) => c.low)
  const n = closes.length

  // RSI(14)
  const rsiRaw = RSI.calculate({ period: 14, values: closes })
  const rsi = padStart(rsiRaw, n)

  // MACD(12, 26, 9)
  const macdRaw = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  })
  const macdPad = n - macdRaw.length
  const padding = Array<number>(macdPad).fill(NaN)

  const macdLine = [...padding, ...macdRaw.map((m) => m.MACD ?? NaN)]
  const signalLine = [...padding, ...macdRaw.map((m) => m.signal ?? NaN)]
  const histogram = [...padding, ...macdRaw.map((m) => m.histogram ?? NaN)]

  // Bollinger Bands(20, 2)
  const bbRaw = BollingerBands.calculate({ period: 20, stdDev: 2, values: closes })
  const bbPad = n - bbRaw.length
  const bbPadding = Array<number>(bbPad).fill(NaN)

  return {
    rsi,
    macd: { macdLine, signalLine, histogram },
    bollingerBands: {
      upper: [...bbPadding, ...bbRaw.map((b) => b.upper)],
      middle: [...bbPadding, ...bbRaw.map((b) => b.middle)],
      lower: [...bbPadding, ...bbRaw.map((b) => b.lower)],
    },
  }

  void highs
  void lows
}
