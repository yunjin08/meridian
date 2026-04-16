import { useEffect, useRef } from 'react'
import { useChartStore } from '@/store/chartStore'
import { useNavigationStore } from '@/store/navigationStore'
import { isStockTicker } from '@/store/portfolioStore'
import { API_BASE, CANDLE_LIMIT, TIMEFRAME_DEBOUNCE_MS, CANDLE_REFRESH_INTERVAL_MS } from '@/constants'
import type { CandlesResponse } from '@/types/candle'

async function fetchCandlesForSymbol(symbol: string, interval: string): Promise<CandlesResponse> {
  const url = isStockTicker(symbol)
    ? `${API_BASE}/stock-candles?ticker=${symbol}&interval=${interval}`
    : `${API_BASE}/candles?symbol=${symbol}&interval=${interval}&limit=${CANDLE_LIMIT}`

  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json() as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<CandlesResponse>
}

export function useCandles() {
  const activeInterval = useChartStore((s) => s.activeInterval)
  const setCandles = useChartStore((s) => s.setCandles)
  const setIndicators = useChartStore((s) => s.setIndicators)
  const setLoading = useChartStore((s) => s.setLoading)
  const setFetchedAt = useChartStore((s) => s.setFetchedAt)
  const activeSymbol = useNavigationStore((s) => s.activeSymbol)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function load(symbol: string, interval: string) {
    setLoading(true)
    fetchCandlesForSymbol(symbol, interval)
      .then((data) => {
        setCandles(data.candles)
        setIndicators(data.indicators)
        setFetchedAt(data.fetchedAt)
      })
      .catch((err: unknown) => {
        console.error('[useCandles] fetch failed:', err)
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    if (intervalRef.current !== null) clearInterval(intervalRef.current)

    debounceRef.current = setTimeout(() => {
      load(activeSymbol, activeInterval)

      intervalRef.current = setInterval(() => {
        if (!document.hidden) {
          load(activeSymbol, activeInterval)
        }
      }, CANDLE_REFRESH_INTERVAL_MS)
    }, TIMEFRAME_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current)
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [activeSymbol, activeInterval]) // eslint-disable-line react-hooks/exhaustive-deps
}
