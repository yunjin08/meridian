// Types for the AI Chart Analysis feature.
// The backend forces Claude to emit this exact shape via a single required tool,
// so the frontend can render it without defensive parsing.

export type Trend = 'bullish' | 'bearish' | 'neutral'
export type Momentum = 'strong' | 'moderate' | 'weak'
export type Confidence = 'low' | 'medium' | 'high'

export interface AnalysisResult {
  trend: Trend
  momentum: Momentum
  /** 2-3 sentence plain-English read of the current chart. */
  summary: string
  /** 2-4 concrete observations, e.g. indicator agreement or divergence. */
  signals: string[]
  /** Nearest support price, or null if not identifiable from the data. */
  support: number | null
  /** Nearest resistance price, or null if not identifiable from the data. */
  resistance: number | null
  confidence: Confidence
}

/** Compact indicator snapshot sent to the model (any field may be null). */
export interface AnalysisIndicators {
  rsi: number | null
  macd: { line: number; signal: number; histogram: number } | null
  bb: { upper: number; middle: number; lower: number } | null
}

export interface AnalyzeRequest {
  symbol: string
  timeframe: string
  price: {
    current: number | null
    changePercent: number | null
    high24h: number | null
    low24h: number | null
  }
  indicators: AnalysisIndicators
  /** Downsampled recent closes (oldest -> newest) for trend/level reasoning. */
  closes: number[]
  /** Highest high / lowest low across the recent window. */
  recentHigh: number | null
  recentLow: number | null
}

export interface AnalyzeApiResponse {
  analysis: AnalysisResult
  model: string
  generatedAt: number
}
