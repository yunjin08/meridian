import { useStockQuoteStore } from '@/store/stockQuoteStore'
import { useStockPositionsStore } from '@/store/stockPositionsStore'
import { useNavigationStore } from '@/store/navigationStore'
import { formatMoney, formatNumber, formatPercent, formatPrice } from '@/lib/formatters'
import type { StockHolding } from '@/types/portfolio'

interface StockRowProps {
  holding: StockHolding
}

export function StockRow({ holding }: StockRowProps) {
  const quote = useStockQuoteStore((s) => s.quotes[holding.ticker])
  const position = useStockPositionsStore((s) => s.positions[holding.ticker])
  const accountCurrency = useStockPositionsStore((s) => s.account?.currency ?? 'USD')
  const activeSymbol = useNavigationStore((s) => s.activeSymbol)
  const setActiveSymbol = useNavigationStore((s) => s.setActiveSymbol)

  const isActive = activeSymbol === holding.ticker
  const isPositive = (quote?.changePercent ?? 0) >= 0

  // Finnhub is the live quote source; Trading 212's last price fills in when
  // Finnhub has no data for this ticker (non-US listings, no API key).
  const price = quote?.price ?? position?.currentPrice ?? null
  const priceCurrency = quote !== undefined ? 'USD' : position?.currency ?? 'USD'
  const shares = position?.quantity ?? holding.shares
  const pnlPositive = (position?.unrealizedPnl ?? 0) >= 0
  const pnlPct = position !== undefined && position.totalCost > 0
    ? (position.unrealizedPnl / position.totalCost) * 100
    : null

  return (
    <button
      onClick={() => setActiveSymbol(holding.ticker)}
      title={position?.name}
      className={[
        'w-full flex items-center justify-between px-3 py-2 rounded text-xs transition-colors text-left cursor-pointer',
        isActive
          ? 'bg-btc-orange/10 border border-btc-orange/30'
          : 'bg-terminal-bg border border-transparent hover:border-panel-border',
      ].join(' ')}
    >
      <div className="flex flex-col min-w-0">
        <span className="font-mono font-semibold text-text-primary">{holding.ticker}</span>
        {shares !== undefined && (
          <span className="font-mono text-text-muted text-[10px] whitespace-nowrap">
            {formatNumber(shares, Number.isInteger(shares) ? 0 : 4)} sh
          </span>
        )}
        {position !== undefined && (
          <span className="font-mono text-text-muted text-[10px] whitespace-nowrap">
            avg {formatMoney(position.avgPrice, position.currency)}
          </span>
        )}
      </div>

      <div className="flex flex-col items-end ml-2 shrink-0">
        {price !== null ? (
          <>
            <span className="font-mono text-text-primary">
              {quote !== undefined ? formatPrice(price) : formatMoney(price, priceCurrency)}
            </span>
            {quote !== undefined && (
              <span className={`font-mono text-[10px] ${isPositive ? 'text-bull-green' : 'text-bear-red'}`}>
                {formatPercent(quote.changePercent)}
              </span>
            )}
            {position !== undefined ? (
              <span className={`font-mono text-[10px] ${pnlPositive ? 'text-bull-green' : 'text-bear-red'}`}>
                {formatMoney(position.currentValue, accountCurrency)}
                {pnlPct !== null && ` (${formatPercent(pnlPct)})`}
              </span>
            ) : shares !== undefined && quote !== undefined && (
              <span className="font-mono text-[10px] text-text-muted">
                ≈ {formatPrice(quote.price * shares)}
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
