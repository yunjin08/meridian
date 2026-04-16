export type AssetClass = 'crypto' | 'stock' | 'reit'

export interface CryptoHolding {
  asset: string        // e.g. "ETH"
  symbol: string       // e.g. "ETHUSDT" (Binance pair)
  free: number
  locked: number
  usdtValue: number | null
}

export interface StockHolding {
  ticker: string
  assetClass: 'stock' | 'reit'
  shares?: number
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
