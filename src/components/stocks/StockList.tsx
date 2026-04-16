import { usePortfolioStore } from '@/store/portfolioStore'
import { useStockQuoteStore } from '@/store/stockQuoteStore'
import { StockRow } from './StockRow'
import type { AssetClass } from '@/types/portfolio'

interface StockListProps {
  filter: 'stock' | 'reit'
}

const LABEL: Record<AssetClass, string> = {
  crypto: 'Crypto',
  stock: 'Stocks',
  reit: 'REITs',
}

export function StockList({ filter }: StockListProps) {
  const stocks = usePortfolioStore((s) => s.stocks)
  const isLoading = useStockQuoteStore((s) => s.isLoading)
  const error = useStockQuoteStore((s) => s.error)

  const filtered = stocks.filter((h) => h.assetClass === filter)

  return (
    <div className="flex flex-col gap-1">
      <div className="text-xs text-text-muted font-mono mb-1">{LABEL[filter]}</div>

      {isLoading && filtered.length > 0 && (
        <div className="text-text-muted/50 text-[10px] mb-1 animate-pulse">updating…</div>
      )}

      {error !== null && (
        <div className="text-bear-red text-xs mb-1">{error}</div>
      )}

      {filtered.length === 0 ? (
        <div className="text-text-muted/50 text-xs text-center py-4">
          No {LABEL[filter].toLowerCase()} — ask the assistant to add one.
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((h) => (
            <StockRow key={h.ticker} holding={h} />
          ))}
        </div>
      )}
    </div>
  )
}
