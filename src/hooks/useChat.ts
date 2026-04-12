import { useState, useCallback } from 'react'
import { usePriceStore } from '@/store/priceStore'
import { useBalanceStore } from '@/store/balanceStore'
import { useChartStore } from '@/store/chartStore'
import { useAlertStore } from '@/store/alertStore'
import { lastValue } from '@/lib/formatters'
import type { AlertCondition } from '@/types/alert'
import type { ChatMessage, DashboardContext, ChatApiResponse } from '@/types/chat'

function formatCondition(condition: AlertCondition): string {
  switch (condition.type) {
    case 'price_above':
      return `price above $${condition.threshold.toLocaleString()}`
    case 'price_below':
      return `price below $${condition.threshold.toLocaleString()}`
    case 'price_crosses':
      return `price crosses $${condition.threshold.toLocaleString()}`
    case 'rsi_above':
      return `RSI above ${condition.threshold}`
    case 'rsi_below':
      return `RSI below ${condition.threshold}`
    case 'macd_crossover':
      return 'MACD crossover (bullish)'
    case 'macd_crossunder':
      return 'MACD crossunder (bearish)'
  }
}

function buildContext(): DashboardContext {
  const price = usePriceStore.getState()
  const balance = useBalanceStore.getState()
  const chart = useChartStore.getState()
  const alertState = useAlertStore.getState()

  const candles = chart.candles
  const lastCandle = candles.length > 0 ? (candles[candles.length - 1] ?? null) : null
  const indicators = chart.indicators

  const macd = indicators
    ? (() => {
        const line = lastValue(indicators.macd.macdLine)
        const signal = lastValue(indicators.macd.signalLine)
        const histogram = lastValue(indicators.macd.histogram)
        if (line == null || signal == null || histogram == null) return null
        return { line, signal, histogram }
      })()
    : null

  const bb = indicators
    ? (() => {
        const upper = lastValue(indicators.bollingerBands.upper)
        const middle = lastValue(indicators.bollingerBands.middle)
        const lower = lastValue(indicators.bollingerBands.lower)
        if (upper == null || middle == null || lower == null) return null
        return { upper, middle, lower }
      })()
    : null

  return {
    price: {
      price: price.price,
      changePercent: price.changePercent,
      high24h: price.high24h,
      low24h: price.low24h,
      volume24h: price.volume24h,
      connectionStatus: price.connectionStatus,
    },
    balance: {
      btc: balance.balance?.btc ?? null,
      usdt: balance.balance?.usdt ?? null,
      btcInUsdt: balance.balance?.btcInUsdt ?? null,
    },
    chart: {
      timeframe: chart.activeInterval,
      lastCandle,
      rsi: indicators ? lastValue(indicators.rsi) : null,
      macd,
      bb,
    },
    alerts: alertState.alerts.map((a) => ({
      id: a.id,
      label: a.label,
      condition: formatCondition(a.condition),
      active: a.active,
      triggered: a.triggered,
      triggeredAt: a.triggeredAt,
    })),
  }
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendMessage = useCallback(
    async (text: string) => {
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
      }

      // Build history from current messages + new user message before state updates
      const history = [...messages, userMessage].map((m) => ({
        role: m.role,
        content: m.content,
      }))

      setMessages((prev) => [...prev, userMessage])
      setIsLoading(true)
      setError(null)

      const context = buildContext()

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: history, context }),
        })

        const data = (await res.json()) as ChatApiResponse

        if (!res.ok) {
          setError((data as unknown as { error?: string }).error ?? 'Request failed')
          return
        }

        const assistantMessage: ChatMessage = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: data.reply,
          timestamp: Date.now(),
        }

        setMessages((prev) => [...prev, assistantMessage])
      } catch {
        setError('Network error — check your connection')
      } finally {
        setIsLoading(false)
      }
    },
    [messages]
  )

  const clearHistory = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return { messages, isLoading, error, sendMessage, clearHistory }
}
