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

export function useStockPositions() {
  const setPositions = useStockPositionsStore((s) => s.setPositions)
  const setLoading = useStockPositionsStore((s) => s.setLoading)
  const setError = useStockPositionsStore((s) => s.setError)

  function load() {
    setLoading(true)
    fetchPositions()
      .then((data) => {
        setPositions(data)
        // Holdings list drives quotes, charts and the asset selector, so it
        // must reflect what Trading 212 says is actually held.
        usePortfolioStore.getState().syncFromPositions(data.positions)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load Trading 212 positions'
        console.error('[useStockPositions] fetch failed:', err)
        setError(msg)
      })
      .finally(() => {
        setLoading(false)
      })
  }

  useEffect(() => {
    load()

    const interval = setInterval(() => {
      if (!document.hidden) load()
    }, STOCK_POSITIONS_POLL_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (!document.hidden) load()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
