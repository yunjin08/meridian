// Pure alert-condition logic for the server-side cron (netlify/functions/alerts-cron.ts).
// Alias-free (no `@/` imports) because Netlify bundles the cron with esbuild and no
// path mapping — see CLAUDE.md rule 10. `describeCondition` is the one export the
// frontend also uses, for rendering and for the poll-driven notification body.

import { formatPrice, formatNumber, lastValue } from './formatters.ts'
import type { Alert } from '../types/alert.ts'
import type { IndicatorData } from '../types/candle.ts'

export interface EvalResult {
  triggered: boolean
  detail: string
}

const NOT_TRIGGERED: EvalResult = { triggered: false, detail: '' }

/**
 * Evaluate a price-based condition. `prevPrice` is the last price this evaluator
 * saw for the alert (the previous WS tick for the client, the previous cron run
 * for the server); it is only needed for `price_crosses`.
 */
export function evaluatePriceAlert(alert: Alert, price: number, prevPrice: number | null): EvalResult {
  const { condition } = alert
  if (condition.type === 'price_above') {
    return {
      triggered: price > condition.threshold,
      detail: `${alert.symbol} price ${formatPrice(price)} > ${formatPrice(condition.threshold)}`,
    }
  }
  if (condition.type === 'price_below') {
    return {
      triggered: price < condition.threshold,
      detail: `${alert.symbol} price ${formatPrice(price)} < ${formatPrice(condition.threshold)}`,
    }
  }
  if (condition.type === 'price_crosses') {
    if (prevPrice === null) return NOT_TRIGGERED
    const crossed =
      (prevPrice < condition.threshold && price >= condition.threshold) ||
      (prevPrice > condition.threshold && price <= condition.threshold)
    return {
      triggered: crossed,
      detail: `${alert.symbol} crossed ${formatPrice(condition.threshold)} (now ${formatPrice(price)})`,
    }
  }
  return NOT_TRIGGERED
}

export function evaluateIndicatorAlert(alert: Alert, indicators: IndicatorData): EvalResult {
  const { condition } = alert
  if (condition.type === 'rsi_above' || condition.type === 'rsi_below') {
    const rsi = lastValue(indicators.rsi)
    if (rsi === null) return NOT_TRIGGERED
    if (condition.type === 'rsi_above') {
      return {
        triggered: rsi > condition.threshold,
        detail: `${alert.symbol} RSI ${formatNumber(rsi, 1)} > ${condition.threshold}`,
      }
    }
    return {
      triggered: rsi < condition.threshold,
      detail: `${alert.symbol} RSI ${formatNumber(rsi, 1)} < ${condition.threshold}`,
    }
  }
  if (condition.type === 'macd_crossover' || condition.type === 'macd_crossunder') {
    const macd = lastValue(indicators.macd.macdLine)
    const signal = lastValue(indicators.macd.signalLine)
    if (macd === null || signal === null) return NOT_TRIGGERED
    if (condition.type === 'macd_crossover') {
      return {
        triggered: macd > signal,
        detail: `${alert.symbol} MACD crossover (${formatNumber(macd, 2)} > ${formatNumber(signal, 2)})`,
      }
    }
    return {
      triggered: macd < signal,
      detail: `${alert.symbol} MACD crossunder (${formatNumber(macd, 2)} < ${formatNumber(signal, 2)})`,
    }
  }
  return NOT_TRIGGERED
}

export function isPriceCondition(alert: Alert): boolean {
  const t = alert.condition.type
  return t === 'price_above' || t === 'price_below' || t === 'price_crosses'
}

export function isIndicatorCondition(alert: Alert): boolean {
  return !isPriceCondition(alert)
}

/** Human-readable condition, with no live value (evaluation is server-only now). */
export function describeCondition(alert: Alert): string {
  const { condition } = alert
  switch (condition.type) {
    case 'price_above':    return `Price > $${condition.threshold.toLocaleString()}`
    case 'price_below':    return `Price < $${condition.threshold.toLocaleString()}`
    case 'price_crosses':  return `Price crosses $${condition.threshold.toLocaleString()}`
    case 'rsi_above':      return `RSI > ${condition.threshold}`
    case 'rsi_below':      return `RSI < ${condition.threshold}`
    case 'macd_crossover': return 'MACD crossover ↑'
    case 'macd_crossunder':return 'MACD crossunder ↓'
  }
}
