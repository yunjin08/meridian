import { useState, useCallback } from 'react'
import { usePriceStore } from '@/store/priceStore'
import { useChartStore } from '@/store/chartStore'
import { useNavigationStore } from '@/store/navigationStore'
import { lastValue } from '@/lib/formatters'
import type { AnalyzeRequest, AnalyzeApiResponse } from '@/types/analysis'

// How many recent closes to send. Enough for the model to judge trend and
// levels without bloating the request.
const WINDOW = 40

function buildRequest(): AnalyzeRequest {
  const activeSymbol = useNavigationStore.getState().activeSymbol
  const priceState = usePriceStore.getState()
  const chart = useChartStore.getState()
  const activePrice = priceState.prices[activeSymbol]
  const indicators = chart.indicators

  const recent = chart.candles.slice(-WINDOW)
  const closes = recent.map((c) => c.close)
  const recentHigh = recent.length > 0 ? Math.max(...recent.map((c) => c.high)) : null
  const recentLow = recent.length > 0 ? Math.min(...recent.map((c) => c.low)) : null

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
    symbol: activeSymbol,
    timeframe: chart.activeInterval,
    price: {
      current: activePrice?.price ?? null,
      changePercent: activePrice?.changePercent ?? null,
      high24h: activePrice?.high24h ?? null,
      low24h: activePrice?.low24h ?? null,
    },
    indicators: {
      rsi: indicators ? lastValue(indicators.rsi) : null,
      macd,
      bb,
    },
    closes,
    recentHigh,
    recentLow,
  }
}

export function useAnalysis() {
  const [result, setResult] = useState<AnalyzeApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const analyze = useCallback(async () => {
    if (useChartStore.getState().candles.length === 0) {
      setError('Chart data is still loading — try again in a moment')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(buildRequest()),
      })

      const data = (await res.json()) as AnalyzeApiResponse | { error?: string }

      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Analysis failed')
        return
      }

      setResult(data as AnalyzeApiResponse)
    } catch {
      setError('Network error — check your connection')
    } finally {
      setIsLoading(false)
    }
  }, [])

  return { result, isLoading, error, analyze }
}
