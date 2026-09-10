import { useEffect } from 'react'
import { useStockPositionsStore } from '@/store/stockPositionsStore'
import { usePortfolioStore } from '@/store/portfolioStore'
import { API_BASE, STOCK_POSITIONS_POLL_INTERVAL_MS } from '@/constants'
import type { StockPositionsResponse } from '@/types/portfolio'

async function fetchPositions(): Promise<StockPositionsResponse> {
  const res = await fetch(`${API_BASE}/stock-positions`, { credentials: 'include' })
  if (!res.ok) {
    const body = await res.json() as { error?: string; msg?: string }
    throw new Error(body.msg ?? body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<StockPositionsResponse>
}

// Trading 212 allows one account-summary call per five seconds across every
// tab on the account. A page load that lands inside that window fails, and
// waiting a full poll interval left the stocks unpriced for 30 seconds.
const RETRY_AFTER_FAILURE_MS = 6_000

export function useStockPositions() {
  const setPositions = useStockPositionsStore((s) => s.setPositions)
  const setLoading = useStockPositionsStore((s) => s.setLoading)
  const setError = useStockPositionsStore((s) => s.setError)

  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    function load() {
      setLoading(true)
      fetchPositions()
        .then((data) => {
          if (cancelled) return
          setPositions(data)
          // Holdings list drives quotes, charts and the asset selector, so it
          // must reflect what Trading 212 says is actually held.
          usePortfolioStore.getState().syncFromPositions(data.positions)
        })
        .catch((err: unknown) => {
          if (cancelled) return
          const msg = err instanceof Error ? err.message : 'Failed to load Trading 212 positions'
          console.error('[useStockPositions] fetch failed:', err)
          setError(msg)
          // Only retry early while nothing has ever loaded; once data exists
          // the store keeps it and the regular poll is soon enough.
          if (useStockPositionsStore.getState().fetchedAt === null && retryTimer === null) {
            retryTimer = setTimeout(() => {
              retryTimer = null
              if (!document.hidden) load()
            }, RETRY_AFTER_FAILURE_MS)
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }

    load()

    const interval = setInterval(() => {
      if (!document.hidden) load()
    }, STOCK_POSITIONS_POLL_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (!document.hidden) load()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      cancelled = true
      clearInterval(interval)
      if (retryTimer !== null) clearTimeout(retryTimer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
