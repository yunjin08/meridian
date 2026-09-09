// Shapes crossing the /api/macro boundary and the chat read tools.
// Function code imports these as types only, so they stay alias-free.

export interface MacroSeriesPoint {
  id: string
  label: string
  value: number | null
  previous: number | null
  /** ISO date of the latest observation, or null when the series failed. */
  date: string | null
  unit: string
}

export interface MacroSnapshot {
  series: MacroSeriesPoint[]
  cpiYoY: MacroSeriesPoint
  fetchedAt: number
}

export interface FearGreedReading {
  value: number
  label: string
  previous: number | null
}

export interface FundingReading {
  markPrice: number
  /** Last 8h funding rate as a percentage, e.g. 0.01 for 0.01%. */
  lastFundingRatePct: number
  nextFundingTime: number
  openInterest: number | null
}

export interface CryptoMarketSnapshot {
  symbol: string
  totalMarketCapUsd: number | null
  marketCapChange24hPct: number | null
  btcDominancePct: number | null
  ethDominancePct: number | null
  fearGreed: FearGreedReading | null
  funding: FundingReading | null
  fetchedAt: number
}

export interface MacroApiResponse {
  /** Null when FRED_API_KEY is not configured. */
  macro: MacroSnapshot | null
  crypto: CryptoMarketSnapshot
}
