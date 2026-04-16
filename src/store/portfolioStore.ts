import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StockHolding } from '@/types/portfolio'

// Seed from env var on first load.
// Format: VITE_STOCK_PORTFOLIO=AAPL:stock,MSFT:stock,O:reit,VICI:reit
function seedFromEnv(): StockHolding[] {
  const raw = import.meta.env['VITE_STOCK_PORTFOLIO'] as string | undefined
  if (!raw) return []
  return raw
    .split(',')
    .map((entry) => {
      const parts = entry.trim().split(':')
      const ticker = parts[0]
      const cls = parts[1]
      if (!ticker) return null
      return {
        ticker: ticker.toUpperCase(),
        assetClass: (cls === 'reit' ? 'reit' : 'stock') as 'stock' | 'reit',
      }
    })
    .filter((h): h is StockHolding => h !== null)
}

interface PortfolioState {
  stocks: StockHolding[]
  addStock: (holding: StockHolding) => void
  removeStock: (ticker: string) => void
  setStocks: (holdings: StockHolding[]) => void
}

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set) => ({
      stocks: seedFromEnv(),

      addStock: (holding) =>
        set((s) => ({
          stocks: s.stocks.some((h) => h.ticker === holding.ticker)
            ? s.stocks
            : [...s.stocks, holding],
        })),

      removeStock: (ticker) =>
        set((s) => ({ stocks: s.stocks.filter((h) => h.ticker !== ticker) })),

      setStocks: (stocks) => set({ stocks }),
    }),
    {
      name: 'dashboard-portfolio',
      onRehydrateStorage: () => (state) => {
        // If localStorage was empty (first deploy), seed from env var
        if (state && state.stocks.length === 0) {
          state.setStocks(seedFromEnv())
        }
      },
    }
  )
)

// Convenience selector: is a given ticker a stock or REIT?
export function isStockTicker(ticker: string): boolean {
  return usePortfolioStore.getState().stocks.some((h) => h.ticker === ticker)
}
