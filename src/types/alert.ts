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
  triggeredAt: number | null         // Unix ms, set server-side by the cron when it fires
  createdAt: number                  // Unix ms
  autoReset: boolean                 // re-arms after a cooldown (for crossing alerts)
}

/** The fields the client sends to create an alert; the server assigns the rest. */
export interface AlertInput {
  label: string
  symbol: string
  condition: AlertCondition
  autoReset: boolean
}

/** Partial update: an omitted field keeps its current server-side value. Symbol is not editable — remove and re-add for that. */
export interface AlertEditFields {
  label?: string
  condition?: AlertCondition
  autoReset?: boolean
}
