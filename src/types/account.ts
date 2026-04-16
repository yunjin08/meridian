import type { CryptoHolding } from './portfolio.ts'

// Full balance response — all non-dust Binance holdings with USDT values.
export interface AccountBalance {
  holdings: CryptoHolding[]
  totalUsdtValue: number
  fetchedAt: number
}
