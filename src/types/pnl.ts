// Profit and loss shapes shared by the crypto-pnl function and the Overview.

export type FillSide = 'BUY' | 'SELL'

/** One spot fill on a <asset>USDT pair, normalised from Binance myTrades. */
export interface SpotFill {
  side: FillSide
  qty: number             // base asset amount
  quoteQty: number        // USDT amount
  commission: number
  commissionAsset: string
  time: number            // ms epoch
}

export type FiatOrderSource = 'fiat' | 'p2p'

/** One completed fiat-to-crypto trade: a Binance "Buy/Sell Crypto" order or a P2P trade with another user. */
export interface FiatOrder {
  source: FiatOrderSource
  side: FillSide          // BUY: fiat -> crypto, SELL: crypto -> fiat
  fiatCurrency: string    // e.g. "PHP"
  fiatAmount: number      // fiat paid (BUY) or received (SELL), fees included
  cryptoCurrency: string  // e.g. "USDT" or "BTC"
  cryptoAmount: number
  time: number            // ms epoch
}

export interface CryptoAssetPnl {
  asset: string
  heldQty: number
  priceUsdt: number | null
  currentValueUsdt: number | null
  boughtQty: number             // spot buys plus direct fiat buys
  soldQty: number
  spentUsdt: number             // cost of everything bought, fees included
  receivedUsdt: number          // proceeds of everything sold, fees deducted
  avgBuyPriceUsdt: number | null
  netUsdt: number | null        // currentValue + received - spent; null when price unknown
  unknownCostQty: number        // fiat buys with no usable fiat -> USDT rate
  untrackedQty: number          // held beyond what fills and fiat buys explain (transfers, convert)
  ignoredFeeAssets: string[]    // fee currencies (e.g. BNB) that could not be priced into the cost
}

export interface FiatFunding {
  currency: string
  totalIn: number               // fiat spent on all BUY orders (any crypto)
  totalOut: number              // fiat received from all SELL orders
  usdtBought: number            // USDT obtained from BUY orders of USDT
  usdtSold: number
}

export interface CryptoPnlTotals {
  currentValueUsdt: number      // over assets with a price
  spentUsdt: number
  receivedUsdt: number
  netUsdt: number               // over assets with a known net
  hasUnknownCost: boolean
  hasUntracked: boolean
  hasIgnoredFees: boolean
}

export interface CryptoPnlResponse {
  assets: CryptoAssetPnl[]
  totals: CryptoPnlTotals
  funding: FiatFunding[]
  warnings: string[]            // partial-data notices, e.g. fiat history unavailable
  fetchedAt: number
}
