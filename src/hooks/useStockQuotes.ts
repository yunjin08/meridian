import { useEffect } from 'react'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useStockQuoteStore } from '@/store/stockQuoteStore'
import { API_BASE, STOCK_QUOTE_POLL_INTERVAL_MS } from '@/constants'
import type { StockQuote } from '@/types/portfolio'

async function fetchQuotes(tickers: string[]): Promise<StockQuote[]> {
  if (tickers.length === 0) return []
  const res = await fetch(`${API_BASE}/stock-quotes?tickers=${tickers.join(',')}`)
  if (!res.ok) {
    const body = await res.json() as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<StockQuote[]>
}

export function useStockQuotes() {
  const setQuotes = useStockQuoteStore((s) => s.setQuotes)
  const setLoading = useStockQuoteStore((s) => s.setLoading)
  const setError = useStockQuoteStore((s) => s.setError)
  const stocks = usePortfolioStore((s) => s.stocks)

  function load() {
    const tickers = stocks.map((s) => s.ticker)
    if (tickers.length === 0) return

    setLoading(true)
    fetchQuotes(tickers)
      .then((quotes) => {
        setQuotes(quotes)
        setError(null)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load stock quotes'
        console.error('[useStockQuotes] fetch failed:', err)
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
    }, STOCK_QUOTE_POLL_INTERVAL_MS)

    const handleVisibilityChange = () => {
      if (!document.hidden) load()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [stocks]) // eslint-disable-line react-hooks/exhaustive-deps
}
