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
