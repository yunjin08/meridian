import { create } from 'zustand'
import type { Candle, IndicatorData } from '@/types/candle'
import type { Timeframe } from '@/constants'
import { DEFAULT_TIMEFRAME } from '@/constants'

interface ChartState {
  activeInterval: Timeframe
  candles: Candle[]
  indicators: IndicatorData | null
  isLoading: boolean
  fetchedAt: number | null

  setActiveInterval: (interval: Timeframe) => void
  setCandles: (candles: Candle[]) => void
  setIndicators: (indicators: IndicatorData) => void
  setLoading: (loading: boolean) => void
  setFetchedAt: (ts: number) => void
  appendCandle: (candle: Candle) => void
  updateLastCandle: (candle: Candle) => void
}

export const useChartStore = create<ChartState>()((set) => ({
  activeInterval: DEFAULT_TIMEFRAME,
  candles: [],
  indicators: null,
  isLoading: false,
  fetchedAt: null,

  setActiveInterval: (activeInterval) => set({ activeInterval }),
  setCandles: (candles) => set({ candles }),
  setIndicators: (indicators) => set({ indicators }),
  setLoading: (isLoading) => set({ isLoading }),
  setFetchedAt: (fetchedAt) => set({ fetchedAt }),

  appendCandle: (candle) =>
    set((state) => ({ candles: [...state.candles, candle] })),

  updateLastCandle: (candle) =>
    set((state) => {
      if (state.candles.length === 0) return state
      const updated = [...state.candles]
      updated[updated.length - 1] = candle
      return { candles: updated }
    }),
}))
