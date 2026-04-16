export type AlertConditionType =
  | 'price_above'
  | 'price_below'
  | 'price_crosses'    // bidirectional cross — triggers in either direction
  | 'rsi_above'
  | 'rsi_below'
  | 'macd_crossover'   // MACD line crosses signal line upward
  | 'macd_crossunder'  // MACD line crosses signal line downward

export interface PriceCondition {
  type: 'price_above' | 'price_below' | 'price_crosses'
  threshold: number
}

export interface RsiCondition {
  type: 'rsi_above' | 'rsi_below'
  threshold: number
}

export interface MacdCondition {
  type: 'macd_crossover' | 'macd_crossunder'
}

export type AlertCondition = PriceCondition | RsiCondition | MacdCondition

export interface Alert {
  id: string
  label: string
  symbol: string                     // asset symbol this alert is for, e.g. "BTCUSDT", "AAPL"
  condition: AlertCondition
  active: boolean
  triggered: boolean
  triggeredAt: number | null
  createdAt: number
  lastEvaluatedPrice: number | null  // tracks previous price for cross detection
  autoReset: boolean                 // re-arms after 5-minute cooldown (for crossing alerts)
  autoResetAt: number | null         // timestamp when auto-reset fires
}
