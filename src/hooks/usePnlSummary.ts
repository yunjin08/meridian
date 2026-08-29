import { useMemo } from 'react'
import { summarisePnl, type PnlSummary } from '@/lib/pnlSummary'
import { useCryptoPnlStore } from '@/store/cryptoPnlStore'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useStockPositionsStore } from '@/store/stockPositionsStore'

export function usePnlSummary(): PnlSummary {
  const cryptoPnl = useCryptoPnlStore((s) => s.data)
  const positions = useStockPositionsStore((s) => s.positions)
  const account = useStockPositionsStore((s) => s.account)
  const stocks = usePortfolioStore((s) => s.stocks)

  return useMemo(
    () => summarisePnl({ cryptoPnl, positions, account, stocks }),
    [cryptoPnl, positions, account, stocks],
  )
}
