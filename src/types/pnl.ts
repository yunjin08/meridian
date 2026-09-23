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

/**
 * One executed stock fill from Trading 212 order history, normalised.
 * `netValue` is already in the account currency (fees and taxes included), so
 * the cost line needs no FX. `fxRate` prices the instrument's native-currency
 * daily closes into the account currency for the value line.
 */
export interface StockFill {
  ticker: string          // dashboard ticker, e.g. "AAPL"
  side: FillSide          // BUY | SELL
  qty: number             // shares in this fill (positive)
  netValue: number        // account-currency cash impact, positive magnitude
  instrumentCurrency: string
  fxRate: number          // instrument currency -> account currency at fill time
  isTrade: boolean        // fill.type === 'TRADE'; false for splits and other corporate actions
  time: number            // ms epoch of the fill
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

/** One day of the whole-portfolio since-inception curve (crypto + stocks). */
export interface PortfolioHistoryPoint {
  date: string                  // YYYY-MM-DD
  spent: number                 // cumulative cost of everything held, sales already deducted
  value: number                 // those holdings repriced at that day's close
}

export interface PortfolioHistory {
  points: PortfolioHistoryPoint[]
  daysAboveWater: number
  daysBelowWater: number
  lastCrossedOn: string | null  // last day the two lines swapped places
}

export interface CryptoPnlResponse {
  assets: CryptoAssetPnl[]
  totals: CryptoPnlTotals
  funding: FiatFunding[]
  history: PortfolioHistory
  warnings: string[]            // partial-data notices, e.g. fiat history unavailable
  fetchedAt: number
}
