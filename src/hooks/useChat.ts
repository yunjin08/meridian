import { useState, useCallback } from 'react'
import { usePriceStore } from '@/store/priceStore'
import { useBalanceStore } from '@/store/balanceStore'
import { useChartStore } from '@/store/chartStore'
import { useAlertStore } from '@/store/alertStore'
import { useCryptoHoldingsStore } from '@/store/cryptoHoldingsStore'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useStockQuoteStore } from '@/store/stockQuoteStore'
import { useStockPositionsStore } from '@/store/stockPositionsStore'
import { useNavigationStore } from '@/store/navigationStore'
import { lastValue } from '@/lib/formatters'
import { summarisePortfolio } from '@/lib/portfolioSummary'
import { summarisePnl } from '@/lib/pnlSummary'
import { findDuplicateAlert } from '@/lib/alertDedupe'
import { useCryptoPnlStore } from '@/store/cryptoPnlStore'
import type { AlertCondition } from '@/types/alert'
import type { ChatMessage, DashboardContext, ChatApiResponse, AppliedTool, ChatPnlContext, ChatPortfolioContext } from '@/types/chat'

// Enough rows for the model to name the biggest winners and losers without
// pushing every dust holding into the prompt.
const PNL_ROW_LIMIT = 8

function buildPortfolioContext(): ChatPortfolioContext | null {
  const balance = useBalanceStore.getState().balance
  const cryptoHoldings = useCryptoHoldingsStore.getState().holdings
  const prices = usePriceStore.getState().prices
  const stocks = usePortfolioStore.getState().stocks
  const quotes = useStockQuoteStore.getState().quotes
  const { positions, account, fetchedAt } = useStockPositionsStore.getState()
  if (!balance && cryptoHoldings.length === 0 && stocks.length === 0) return null

  const summary = summarisePortfolio({
    balance, cryptoHoldings, prices, stocks, quotes, positions, account, positionsFetchedAt: fetchedAt,
  })
  return {
    total: summary.total,
    totalCurrency: summary.totalCurrency,
    isMixedCurrency: summary.isMixedCurrency,
    change24hUsd: summary.change24hUsd,
    change24hPercent: summary.change24hPercent,
    classes: (['crypto', 'stock', 'reit'] as const).map((assetClass) => {
      const c = summary.classes[assetClass]
      return { assetClass, value: c.value, currency: c.currency, change24hPercent: c.change24hPercent, holdingCount: c.holdingCount }
    }),
  }
}

function buildPnlContext(): ChatPnlContext | null {
  const cryptoPnl = useCryptoPnlStore.getState().data
  const { positions, account } = useStockPositionsStore.getState()
  const stocks = usePortfolioStore.getState().stocks
  const pnl = summarisePnl({ cryptoPnl, positions, account, stocks })
  if (pnl.total === null) return null

  return {
    total: pnl.total,
    totalCurrency: pnl.totalCurrency,
    crypto: pnl.crypto
      ? {
          net: pnl.crypto.net,
          netSpent: pnl.crypto.netSpent,
          currentValue: pnl.crypto.currentValue,
          netPercent: pnl.crypto.netPercent,
          daysAboveWater: pnl.crypto.history.daysAboveWater,
          daysBelowWater: pnl.crypto.history.daysBelowWater,
          lastCrossedOn: pnl.crypto.history.lastCrossedOn,
          warnings: pnl.crypto.warnings,
          assets: pnl.crypto.assets.slice(0, PNL_ROW_LIMIT).map((a) => ({
            asset: a.asset, netSpent: a.netSpent, currentValue: a.currentValue, net: a.net, netPercent: a.netPercent,
          })),
        }
      : null,
    equities: pnl.equities
      ? {
          currency: pnl.equities.currency,
          unrealized: pnl.equities.unrealized,
          realized: pnl.equities.realized,
          net: pnl.equities.net,
          positions: [...pnl.equities.stocks.positions, ...pnl.equities.reits.positions]
            .sort((a, b) => Math.abs(b.unrealized) - Math.abs(a.unrealized))
            .slice(0, PNL_ROW_LIMIT)
            .map((p) => ({
              ticker: p.ticker, assetClass: p.assetClass, currentValue: p.currentValue, totalCost: p.totalCost,
              unrealized: p.unrealized, unrealizedPercent: p.unrealizedPercent,
            })),
        }
      : null,
  }
}

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
  const stockPositions = useStockPositionsStore.getState()
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
      position: stockPositions.positions[h.ticker] ?? null,
    })),
    stockAccount: stockPositions.account,
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
    portfolio: buildPortfolioContext(),
    pnl: buildPnlContext(),
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
        // A retried turn can call add_alert twice for one request.
        if (findDuplicateAlert(alertStore.alerts, input.symbol, condition)) break
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

  // A failed turn stays in the history as a marker. Without it the model sees
  // an unanswered request on the next turn and has claimed to have done the work.
  const recordFailure = useCallback((detail: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: 'assistant', content: detail, timestamp: Date.now(), failed: true },
    ])
  }, [])

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
        content: m.failed ? `[System note: the previous request failed (${m.content}). No tools ran and nothing was changed.]` : m.content,
      }))

      setMessages((prev) => [...prev, userMessage])
      setIsLoading(true)
      setError(null)

      const context = buildContext()

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ messages: history, context }),
        })

        const data = (await res.json()) as ChatApiResponse

        if (!res.ok) {
          const body = data as unknown as { error?: string; msg?: string }
          const detail = body.msg ? `${body.error ?? 'Request failed'}: ${body.msg}` : (body.error ?? 'Request failed')
          setError(detail)
          recordFailure(detail)
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
          ...(data.lookups.length > 0 ? { lookups: data.lookups } : {}),
        }

        setMessages((prev) => [...prev, assistantMessage])
      } catch {
        setError('Network error, check your connection')
        recordFailure('network error')
      } finally {
        setIsLoading(false)
      }
    },
    [messages, recordFailure]
  )

  const clearHistory = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

  return { messages, isLoading, error, sendMessage, clearHistory }
}
