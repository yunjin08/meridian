export interface Candle {
  time: number  // Unix seconds (TradingView expects seconds, not ms)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface MacdData {
  macdLine: number[]
  signalLine: number[]
  histogram: number[]
}

export interface BollingerBandsData {
  upper: number[]
  middle: number[]  // SMA
  lower: number[]
}

export interface IndicatorData {
  rsi: number[]             // NaN-padded at start where insufficient history
  macd: MacdData
  bollingerBands: BollingerBandsData
}

export interface CandlesResponse {
  candles: Candle[]
  indicators: IndicatorData
  interval: string
  fetchedAt: number
}
