import { useStockQuoteStore } from '@/store/stockQuoteStore'
import { useNavigationStore } from '@/store/navigationStore'
import { formatPrice, formatPercent } from '@/lib/formatters'
import type { StockHolding } from '@/types/portfolio'

interface StockRowProps {
  holding: StockHolding
}

export function StockRow({ holding }: StockRowProps) {
  const quote = useStockQuoteStore((s) => s.quotes[holding.ticker])
  const activeSymbol = useNavigationStore((s) => s.activeSymbol)
  const setActiveSymbol = useNavigationStore((s) => s.setActiveSymbol)

  const isActive = activeSymbol === holding.ticker
  const isPositive = (quote?.changePercent ?? 0) >= 0

  return (
    <button
      onClick={() => setActiveSymbol(holding.ticker)}
      className={[
        'w-full flex items-center justify-between px-3 py-2 rounded text-xs transition-colors text-left cursor-pointer',
        isActive
          ? 'bg-btc-orange/10 border border-btc-orange/30'
          : 'bg-terminal-bg border border-transparent hover:border-panel-border',
      ].join(' ')}
    >
      <div className="flex flex-col min-w-0">
        <span className="font-mono font-semibold text-text-primary">{holding.ticker}</span>
        {holding.shares !== undefined && (
          <span className="font-mono text-text-muted text-[10px]">{holding.shares} shares</span>
        )}
      </div>

      <div className="flex flex-col items-end ml-2 shrink-0">
        {quote !== undefined ? (
          <>
            <span className="font-mono text-text-primary">{formatPrice(quote.price)}</span>
            <span className={`font-mono text-[10px] ${isPositive ? 'text-bull-green' : 'text-bear-red'}`}>
              {formatPercent(quote.changePercent)}
            </span>
            {holding.shares !== undefined && (
              <span className="font-mono text-[10px] text-text-muted">
                ≈ {formatPrice(quote.price * holding.shares)}
              </span>
            )}
          </>
        ) : (
          <span className="font-mono text-text-muted text-[10px]">no data</span>
        )}
      </div>
    </button>
  )
}
