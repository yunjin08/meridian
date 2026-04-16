import { create } from 'zustand'
import type { StockQuote } from '@/types/portfolio'

interface StockQuoteState {
  quotes: Record<string, StockQuote>  // keyed by ticker
  isLoading: boolean
  error: string | null
  setQuote: (quote: StockQuote) => void
  setQuotes: (quotes: StockQuote[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useStockQuoteStore = create<StockQuoteState>()((set) => ({
  quotes: {},
  isLoading: false,
  error: null,
  setQuote: (quote) =>
    set((s) => ({ quotes: { ...s.quotes, [quote.ticker]: quote } })),
  setQuotes: (quotes) =>
    set({ quotes: Object.fromEntries(quotes.map((q) => [q.ticker, q])) }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}))
