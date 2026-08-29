import { create } from 'zustand'
import type { StockAccountSummary, StockPosition, StockPositionsResponse } from '@/types/portfolio'

interface StockPositionsState {
  positions: Record<string, StockPosition>   // keyed by dashboard ticker
  account: StockAccountSummary | null
  fetchedAt: number | null
  isLoading: boolean
  error: string | null
  setPositions: (data: StockPositionsResponse) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useStockPositionsStore = create<StockPositionsState>()((set) => ({
  positions: {},
  account: null,
  fetchedAt: null,
  isLoading: false,
  error: null,
  setPositions: (data) =>
    set({
      positions: Object.fromEntries(data.positions.map((p) => [p.ticker, p])),
      account: data.account,
      fetchedAt: data.fetchedAt,
      error: null,
    }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}))
