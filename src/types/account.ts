export interface AccountBalance {
  btc: number
  usdt: number
  btcInUsdt: number   // btc * currentPrice (approximate)
  fetchedAt: number   // Unix ms timestamp
}
