export type TradeSide = 'BUY' | 'SELL'

export interface CryptoTrade {
  id: number
  orderId: number
  symbol: string
  side: TradeSide
  price: number
  qty: number
  quoteQty: number
  commission: number
  commissionAsset: string
  time: number
  isMaker: boolean
}

export interface TradesResponse {
  symbol: string
  trades: CryptoTrade[]
  fetchedAt: number
}
