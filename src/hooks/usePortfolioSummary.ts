import { useMemo } from 'react'
import { useBalanceStore } from '@/store/balanceStore'
import { useCryptoHoldingsStore } from '@/store/cryptoHoldingsStore'
import { usePriceStore } from '@/store/priceStore'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useStockPositionsStore } from '@/store/stockPositionsStore'
import { useStockQuoteStore } from '@/store/stockQuoteStore'
import { summarisePortfolio, type PortfolioSummary } from '@/lib/portfolioSummary'

export function usePortfolioSummary(): PortfolioSummary {
  const balance = useBalanceStore((s) => s.balance)
  const cryptoHoldings = useCryptoHoldingsStore((s) => s.holdings)
  const prices = usePriceStore((s) => s.prices)
  const stocks = usePortfolioStore((s) => s.stocks)
  const quotes = useStockQuoteStore((s) => s.quotes)
  const positions = useStockPositionsStore((s) => s.positions)
  const account = useStockPositionsStore((s) => s.account)
  const positionsFetchedAt = useStockPositionsStore((s) => s.fetchedAt)

  return useMemo(
    () => summarisePortfolio({ balance, cryptoHoldings, prices, stocks, quotes, positions, account, positionsFetchedAt }),
    [balance, cryptoHoldings, prices, stocks, quotes, positions, account, positionsFetchedAt],
  )
}
