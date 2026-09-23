// Raw Trading 212 Public API shapes (https://docs.trading212.com/api). No `any`.

export interface Trading212Instrument {
  ticker: string      // e.g. "AAPL_US_EQ"
  name: string
  isin: string
  currency: string    // ISO 4217
}

export interface Trading212WalletImpact {
  currency: string
  currentValue: number
  totalCost: number
  unrealizedProfitLoss: number
  fxImpact: number
}

export interface Trading212Position {
  instrument: Trading212Instrument
  quantity: number
  quantityAvailableForTrading: number
  quantityInPies: number
  averagePricePaid: number   // per share, instrument currency
  currentPrice: number       // per share, instrument currency
  createdAt: string          // ISO 8601
  walletImpact: Trading212WalletImpact
}

export interface Trading212Cash {
  availableToTrade: number
  inPies: number
  reservedForOrders: number
}

export interface Trading212Investments {
  currentValue: number
  totalCost: number
  unrealizedProfitLoss: number
  realizedProfitLoss: number
}

export interface Trading212AccountSummary {
  id: number
  currency: string
  totalValue: number
  cash: Trading212Cash
  investments: Trading212Investments
}

// --- Historical orders (GET /equity/history/orders) ---

/** Net cash effect of one fill, in the account's primary currency. */
export interface Trading212FillWalletImpact {
  currency: string              // account (wallet) currency
  fxRate: number                // instrument currency -> account currency at fill time
  netValue: number              // cash that moved, fees and taxes included
  realisedProfitLoss: number
}

/** One execution against an order. `type` distinguishes a real trade from a corporate action. */
export interface Trading212Fill {
  filledAt: string              // ISO 8601
  price: number                 // per share, instrument currency
  quantity: number              // shares filled in this execution
  type: string                  // "TRADE" | "STOCK_SPLIT" | "STOCK_DISTRIBUTION" | ...
  walletImpact: Trading212FillWalletImpact
}

export interface Trading212HistoricalOrderInfo {
  id: number
  ticker: string                // raw T212 ticker, e.g. "AAPL_US_EQ"
  side: 'BUY' | 'SELL'
  currency: string              // instrument currency, ISO 4217
  status: string
  createdAt: string
}

export interface Trading212HistoricalOrder {
  order: Trading212HistoricalOrderInfo
  fill: Trading212Fill
}

export interface Trading212OrderHistoryPage {
  items: Trading212HistoricalOrder[]
  nextPagePath: string | null
}
