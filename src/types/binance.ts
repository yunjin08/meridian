// Raw Binance kline array — tuple type avoids `any` under noUncheckedIndexedAccess.
// Format: [openTime, open, high, low, close, volume, closeTime, quoteVol, trades, takerBuyBase, takerBuyQuote, ignore]
export type BinanceKlineArray = [
  number,  // 0: open time (ms)
  string,  // 1: open price
  string,  // 2: high price
  string,  // 3: low price
  string,  // 4: close price
  string,  // 5: volume
  number,  // 6: close time (ms)
  string,  // 7: quote asset volume
  number,  // 8: number of trades
  string,  // 9: taker buy base asset volume
  string,  // 10: taker buy quote asset volume
  string,  // 11: unused
]

export type BinanceKlineResponse = BinanceKlineArray[]

export interface BinanceAccountAsset {
  asset: string
  free: string
  locked: string
}

export interface BinanceAccountResponse {
  makerCommission: number
  takerCommission: number
  canTrade: boolean
  balances: BinanceAccountAsset[]
}

export interface BinanceFundingAsset {
  asset: string
  free: string
  locked: string
  freeze?: string
  withdrawing?: string
}

export interface BinanceTicker24h {
  symbol: string
  priceChange: string
  priceChangePercent: string
  lastPrice: string
  highPrice: string
  lowPrice: string
  volume: string
  quoteVolume: string
}

export interface BinanceSpotPrice {
  symbol: string
  price: string
}

export interface BinanceMyTrade {
  symbol: string
  id: number
  orderId: number
  price: string
  qty: string
  quoteQty: string
  commission: string
  commissionAsset: string
  time: number
  isBuyer: boolean
  isMaker: boolean
}

export interface BinanceError {
  code: number
  msg: string
}
