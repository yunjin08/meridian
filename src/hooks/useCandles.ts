import { useEffect, useRef } from 'react'
import { useChartStore } from '@/store/chartStore'
import { API_BASE, SYMBOL, CANDLE_LIMIT, TIMEFRAME_DEBOUNCE_MS, CANDLE_REFRESH_INTERVAL_MS } from '@/constants'
import type { CandlesResponse } from '@/types/candle'

async function fetchCandles(interval: string): Promise<CandlesResponse> {
  const url = `${API_BASE}/candles?symbol=${SYMBOL}&interval=${interval}&limit=${CANDLE_LIMIT}`
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

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function load(interval: string) {
    setLoading(true)
    fetchCandles(interval)
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

  // Debounce timeframe changes, then set up background refresh
  useEffect(() => {
    // Clear any existing debounce + refresh interval
    if (debounceRef.current !== null) clearTimeout(debounceRef.current)
    if (intervalRef.current !== null) clearInterval(intervalRef.current)

    // Debounce the initial load to handle rapid timeframe switches
    debounceRef.current = setTimeout(() => {
      load(activeInterval)

      // Background refresh every 60s
      intervalRef.current = setInterval(() => {
        // Only refresh if tab is visible
        if (!document.hidden) {
          load(activeInterval)
        }
      }, CANDLE_REFRESH_INTERVAL_MS)
    }, TIMEFRAME_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current)
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [activeInterval]) // eslint-disable-line react-hooks/exhaustive-deps
}
