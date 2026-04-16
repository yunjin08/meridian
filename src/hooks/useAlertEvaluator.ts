import { useEffect } from 'react'
import { usePriceStore } from '@/store/priceStore'
import { useChartStore } from '@/store/chartStore'
import { useAlertStore } from '@/store/alertStore'
import { useNavigationStore } from '@/store/navigationStore'
import { sendNotification } from '@/lib/notifications'
import { lastValue, formatPrice, formatNumber } from '@/lib/formatters'
import { ALERT_AUTO_RESET_COOLDOWN_MS } from '@/constants'
import type { Alert } from '@/types/alert'
import type { IndicatorData } from '@/types/candle'

function evaluatePriceAlert(alert: Alert, price: number): { triggered: boolean; detail: string } {
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
    const prev = alert.lastEvaluatedPrice
    if (prev === null) return { triggered: false, detail: '' }
    const crossed =
      (prev < condition.threshold && price >= condition.threshold) ||
      (prev > condition.threshold && price <= condition.threshold)
    return {
      triggered: crossed,
      detail: `${alert.symbol} crossed $${condition.threshold.toLocaleString()} (now ${formatPrice(price)})`,
    }
  }
  return { triggered: false, detail: '' }
}

function evaluateIndicatorAlert(
  alert: Alert,
  indicators: IndicatorData
): { triggered: boolean; detail: string } {
  const { condition } = alert
  if (condition.type === 'rsi_above' || condition.type === 'rsi_below') {
    const rsi = lastValue(indicators.rsi)
    if (rsi === null) return { triggered: false, detail: '' }
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
    if (macd === null || signal === null) return { triggered: false, detail: '' }
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
  return { triggered: false, detail: '' }
}

export function useAlertEvaluator() {
  useEffect(() => {
    // Subscribe to ALL price changes — evaluate each alert against its symbol's price
    const unsubPrice = usePriceStore.subscribe((state) => {
      const { prices } = state
      const { alerts, markTriggered, updateLastEvaluatedPrice, resetAlert } =
        useAlertStore.getState()

      for (const alert of alerts) {
        // Handle auto-reset cooldown for price_crosses alerts
        if (
          alert.triggered &&
          alert.autoReset &&
          alert.triggeredAt !== null &&
          Date.now() - alert.triggeredAt > ALERT_AUTO_RESET_COOLDOWN_MS
        ) {
          resetAlert(alert.id)
        }

        const priceData = prices[alert.symbol]
        if (!priceData) continue
        const { price } = priceData

        if (!alert.active || alert.triggered) {
          if (alert.condition.type === 'price_crosses') {
            updateLastEvaluatedPrice(alert.id, price)
          }
          continue
        }

        if (
          alert.condition.type === 'price_above' ||
          alert.condition.type === 'price_below' ||
          alert.condition.type === 'price_crosses'
        ) {
          const { triggered, detail } = evaluatePriceAlert(alert, price)
          if (triggered) {
            markTriggered(alert.id)
            sendNotification(`${alert.symbol} Alert`, detail, alert.id)
          }
          updateLastEvaluatedPrice(alert.id, price)
        }
      }
    })

    // Subscribe to indicator changes — only evaluate for the active chart symbol
    const unsubIndicators = useChartStore.subscribe((state) => {
      const { indicators } = state
      if (indicators === null) return

      const activeSymbol = useNavigationStore.getState().activeSymbol
      const { alerts, markTriggered } = useAlertStore.getState()

      for (const alert of alerts) {
        if (!alert.active || alert.triggered) continue
        // Only evaluate indicator alerts that match the currently charted symbol
        if (alert.symbol !== activeSymbol) continue

        if (
          alert.condition.type === 'rsi_above' ||
          alert.condition.type === 'rsi_below' ||
          alert.condition.type === 'macd_crossover' ||
          alert.condition.type === 'macd_crossunder'
        ) {
          const { triggered, detail } = evaluateIndicatorAlert(alert, indicators)
          if (triggered) {
            markTriggered(alert.id)
            sendNotification(`${alert.symbol} Alert`, detail, alert.id)
          }
        }
      }
    })

    return () => {
      unsubPrice()
      unsubIndicators()
    }
  }, [])
}
