export type AssetClass = 'crypto' | 'stock' | 'reit'

export interface CryptoHolding {
  asset: string        // e.g. "ETH"
  symbol: string       // e.g. "ETHUSDT" (Binance pair)
  free: number
  locked: number
  usdtValue: number | null
}

export type StockHoldingSource = 'manual' | 'trading212'

export interface StockHolding {
  ticker: string
  assetClass: 'stock' | 'reit'
  shares?: number
  source?: StockHoldingSource   // absent means manual (pre-Trading 212 entries)
}

export interface StockQuote {
  ticker: string
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  fetchedAt: number
}

// One open Trading 212 position, normalised for the dashboard.
export interface StockPosition {
  ticker: string          // dashboard ticker, e.g. "AAPL"
  t212Ticker: string      // raw Trading 212 ticker, e.g. "AAPL_US_EQ"
  name: string
  quantity: number
  avgPrice: number        // per share, instrument currency
  currentPrice: number    // per share, instrument currency
  currency: string        // instrument currency
  currentValue: number    // account currency
  totalCost: number       // account currency
  unrealizedPnl: number   // account currency
  fxImpact: number        // account currency
  openedAt: number        // ms epoch
}

export interface StockAccountSummary {
  currency: string        // account currency
  totalValue: number
  cashAvailable: number
  cashInPies: number
  cashReserved: number
  invested: number        // current value of all positions
  investedCost: number
  unrealizedPnl: number
  realizedPnl: number
}

export interface StockPositionsResponse {
  account: StockAccountSummary
  positions: StockPosition[]
  fetchedAt: number
}
