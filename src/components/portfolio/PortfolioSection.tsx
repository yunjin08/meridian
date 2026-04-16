import { useCryptoHoldingsStore } from '@/store/cryptoHoldingsStore'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useStockQuoteStore } from '@/store/stockQuoteStore'
import { useBalanceStore } from '@/store/balanceStore'
import { formatPrice, formatPercent } from '@/lib/formatters'

interface AllocationBarProps {
  label: string
  value: number
  total: number
  color: string
}

function AllocationBar({ label, value, total, color }: AllocationBarProps) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono">
        <span className="text-text-muted">{label}</span>
        <span className="text-text-primary">
          {formatPrice(value)} <span className="text-text-muted">({formatPercent(pct, false)})</span>
        </span>
      </div>
      <div className="h-1.5 bg-terminal-bg rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(pct, 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  )
}

export function PortfolioSection() {
  const cryptoHoldings = useCryptoHoldingsStore((s) => s.holdings)
  const balance = useBalanceStore((s) => s.balance)
  const stocks = usePortfolioStore((s) => s.stocks)
  const stockQuotes = useStockQuoteStore((s) => s.quotes)

  const cryptoTotal = balance?.totalUsdtValue ?? 0

  const stocksTotal = stocks
    .filter((h) => h.assetClass === 'stock')
    .reduce((sum, h) => {
      const q = stockQuotes[h.ticker]
      if (!q || !h.shares) return sum
      return sum + q.price * h.shares
    }, 0)

  const reitsTotal = stocks
    .filter((h) => h.assetClass === 'reit')
    .reduce((sum, h) => {
      const q = stockQuotes[h.ticker]
      if (!q || !h.shares) return sum
      return sum + q.price * h.shares
    }, 0)

  const grandTotal = cryptoTotal + stocksTotal + reitsTotal

  // Count non-USDT crypto assets
  const nonUsdtHoldings = cryptoHoldings.filter((h) => h.asset !== 'USDT')

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Total value */}
      <div className="bg-panel-bg border border-panel-border rounded-lg p-4">
        <div className="text-xs text-text-muted font-mono mb-2">Total Portfolio Value</div>
        <div className="text-3xl font-mono font-bold text-text-primary">
          {formatPrice(grandTotal)}
        </div>
        {grandTotal === 0 && (
          <p className="text-text-muted text-xs mt-2">
            Add stock/REIT holdings with shares to see full value. Crypto loaded from Binance automatically.
          </p>
        )}
      </div>

      {/* Allocation */}
      <div className="bg-panel-bg border border-panel-border rounded-lg p-4 space-y-3">
        <div className="text-xs text-text-muted font-mono mb-3">Allocation</div>
        <AllocationBar label="Crypto" value={cryptoTotal} total={grandTotal} color="bg-btc-orange" />
        <AllocationBar label="Stocks" value={stocksTotal} total={grandTotal} color="bg-bull-green" />
        <AllocationBar label="REITs"  value={reitsTotal}  total={grandTotal} color="bg-blue-400" />
      </div>

      {/* Crypto summary */}
      {nonUsdtHoldings.length > 0 && (
        <div className="bg-panel-bg border border-panel-border rounded-lg p-4">
          <div className="text-xs text-text-muted font-mono mb-3">
            Crypto ({nonUsdtHoldings.length} assets)
          </div>
          <div className="space-y-1">
            {nonUsdtHoldings.map((h) => (
              <div key={h.asset} className="flex justify-between text-xs font-mono">
                <span className="text-text-muted">{h.asset}</span>
                <span className="text-text-primary">
                  {h.usdtValue !== null ? formatPrice(h.usdtValue) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stocks/REITs note when shares not set */}
      {stocks.length > 0 && stocks.every((h) => !h.shares) && (
        <p className="text-text-muted/60 text-xs px-1">
          Tell the assistant your share counts (e.g. "I hold 10 shares of AAPL") to see stock values here.
        </p>
      )}
    </div>
  )
}
