import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { StockHolding, StockPosition } from '@/types/portfolio'

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
  syncFromPositions: (positions: StockPosition[]) => void
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

      // Trading 212 is the source of truth for what is held. Manually added
      // tickers stay as a watchlist; the user's stock/REIT classification is
      // kept because the API has no notion of a REIT.
      syncFromPositions: (positions) =>
        set((s) => {
          const held = new Map(positions.map((p) => [p.ticker, p]))
          const kept: StockHolding[] = []
          for (const h of s.stocks) {
            const p = held.get(h.ticker)
            if (p !== undefined) {
              kept.push({ ...h, shares: p.quantity, source: 'trading212' })
              held.delete(h.ticker)
            } else if (h.source !== 'trading212') {
              kept.push(h)
            }
          }
          for (const p of held.values()) {
            kept.push({ ticker: p.ticker, assetClass: 'stock', shares: p.quantity, source: 'trading212' })
          }
          return { stocks: kept }
        }),
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
