import { useState, useCallback } from 'react'
import { usePriceStore } from '@/store/priceStore'
import { useBalanceStore } from '@/store/balanceStore'
import { useChartStore } from '@/store/chartStore'
import { useAlertStore } from '@/store/alertStore'
import { useCryptoHoldingsStore } from '@/store/cryptoHoldingsStore'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useStockQuoteStore } from '@/store/stockQuoteStore'
import { useNavigationStore } from '@/store/navigationStore'
import { lastValue } from '@/lib/formatters'
import type { AlertCondition } from '@/types/alert'
import type { ChatMessage, DashboardContext, ChatApiResponse, AppliedTool } from '@/types/chat'

function formatCondition(condition: AlertCondition): string {
  switch (condition.type) {
    case 'price_above':   return `price above $${condition.threshold.toLocaleString()}`
    case 'price_below':   return `price below $${condition.threshold.toLocaleString()}`
    case 'price_crosses': return `price crosses $${condition.threshold.toLocaleString()}`
    case 'rsi_above':     return `RSI above ${condition.threshold}`
    case 'rsi_below':     return `RSI below ${condition.threshold}`
    case 'macd_crossover':  return 'MACD crossover (bullish)'
    case 'macd_crossunder': return 'MACD crossunder (bearish)'
  }
}

function buildContext(): DashboardContext {
  const priceState = usePriceStore.getState()
  const balance = useBalanceStore.getState()
  const chart = useChartStore.getState()
  const alertState = useAlertStore.getState()
  const cryptoHoldings = useCryptoHoldingsStore.getState().holdings
  const portfolio = usePortfolioStore.getState().stocks
  const stockQuotes = useStockQuoteStore.getState().quotes
  const activeSymbol = useNavigationStore.getState().activeSymbol

  const activePrice = priceState.prices[activeSymbol]

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
    activeSymbol,
    price: {
      price: activePrice?.price ?? null,
      changePercent: activePrice?.changePercent ?? null,
      high24h: activePrice?.high24h ?? null,
      low24h: activePrice?.low24h ?? null,
      connectionStatus: priceState.connectionStatus,
    },
    cryptoHoldings: cryptoHoldings.map((h) => {
      const p = priceState.prices[h.symbol]
      return {
        asset: h.asset,
        symbol: h.symbol,
        free: h.free,
        usdtValue: h.usdtValue,
        price: p?.price ?? null,
        changePercent: p?.changePercent ?? null,
      }
    }),
    totalCryptoUsdt: balance.balance?.totalUsdtValue ?? null,
    stockHoldings: portfolio.map((h) => ({
      ...h,
      quote: stockQuotes[h.ticker] ?? null,
    })),
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
      symbol: a.symbol,
      condition: formatCondition(a.condition),
      active: a.active,
      triggered: a.triggered,
      triggeredAt: a.triggeredAt,
    })),
  }
}

// Parse and apply tool calls returned by the backend to local stores
function applyToolResults(toolCalls: AppliedTool[]) {
  const alertStore = useAlertStore.getState()
  const portfolioStore = usePortfolioStore.getState()

  for (const tool of toolCalls) {
    switch (tool.name) {
      case 'add_alert': {
        const input = tool.input as {
          label: string
          symbol: string
          condition: { type: string; threshold?: number }
          autoReset?: boolean
        }
        // Convert the raw condition to a proper AlertCondition discriminated union
        let condition: AlertCondition
        const t = input.condition.type
        if (t === 'macd_crossover' || t === 'macd_crossunder') {
          condition = { type: t }
        } else if (t === 'rsi_above' || t === 'rsi_below') {
          condition = { type: t, threshold: input.condition.threshold ?? 50 }
        } else {
          // price_above | price_below | price_crosses
          condition = {
            type: t as 'price_above' | 'price_below' | 'price_crosses',
            threshold: input.condition.threshold ?? 0,
          }
        }
        alertStore.addAlert(input.label, input.symbol.toUpperCase(), condition, input.autoReset ?? false)
        break
      }
      case 'remove_alert': {
        const { id } = tool.input as { id: string }
        alertStore.removeAlert(id)
        break
      }
      case 'toggle_alert': {
        const { id } = tool.input as { id: string }
        alertStore.toggleActive(id)
        break
      }
      case 'add_symbol': {
        const { ticker, assetClass } = tool.input as { ticker: string; assetClass: 'stock' | 'reit' }
        portfolioStore.addStock({ ticker: ticker.toUpperCase(), assetClass })
        break
      }
      case 'remove_symbol': {
        const { ticker } = tool.input as { ticker: string }
        portfolioStore.removeStock(ticker.toUpperCase())
        break
      }
    }
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

        // Apply any tool calls the assistant made (alerts, portfolio changes)
        if (data.appliedTools.length > 0) {
          applyToolResults(data.appliedTools)
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
