import { useEffect } from 'react'
import { usePriceStore } from '@/store/priceStore'
import { useChartStore } from '@/store/chartStore'
import { useAlertStore } from '@/store/alertStore'
import { useNavigationStore } from '@/store/navigationStore'
import { sendNotification } from '@/lib/notifications'
import { evaluateIndicatorAlert, evaluatePriceAlert } from '@/lib/alertEvaluation'
import { ALERT_AUTO_RESET_COOLDOWN_MS } from '@/constants'

export function useAlertEvaluator() {
  useEffect(() => {
    // Subscribe to ALL price changes — evaluate each alert against its symbol's price
    const unsubPrice = usePriceStore.subscribe((state) => {
      const { prices } = state
      const { alerts, clientLastPrice, markTriggered, updateLastEvaluatedPrice, resetAlert } =
        useAlertStore.getState()

      for (const alert of alerts) {
        // Handle auto-reset cooldown for price_crosses alerts
        if (
          alert.triggered &&
          alert.autoReset &&
          alert.triggeredAt !== null &&
          Date.now() - alert.triggeredAt > ALERT_AUTO_RESET_COOLDOWN_MS
        ) {
          void resetAlert(alert.id)
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
          const prevPrice = clientLastPrice[alert.id] ?? null
          const { triggered, detail } = evaluatePriceAlert(alert, price, prevPrice)
          if (triggered) {
            markTriggered(alert.id, detail)
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
            markTriggered(alert.id, detail)
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
