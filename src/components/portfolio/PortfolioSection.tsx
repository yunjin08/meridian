import { useCryptoHoldingsStore } from '@/store/cryptoHoldingsStore'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useStockQuoteStore } from '@/store/stockQuoteStore'
import { useBalanceStore } from '@/store/balanceStore'
import { useStockPositionsStore } from '@/store/stockPositionsStore'
import { formatMoney, formatPrice, formatPercent } from '@/lib/formatters'
import type { StockHolding } from '@/types/portfolio'

interface AllocationBarProps {
  label: string
  value: number
  total: number
  color: string
  currency: string
}

function AllocationBar({ label, value, total, color, currency }: AllocationBarProps) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono">
        <span className="text-text-muted">{label}</span>
        <span className="text-text-primary">
          {formatMoney(value, currency)} <span className="text-text-muted">({formatPercent(pct, false)})</span>
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
  const positions = useStockPositionsStore((s) => s.positions)
  const stockAccount = useStockPositionsStore((s) => s.account)

  const cryptoTotal = balance?.totalUsdtValue ?? 0

  // Trading 212 reports value in the account currency; quote x shares is the
  // fallback for watchlist tickers with a manual share count.
  function holdingValue(h: StockHolding): number {
    const p = positions[h.ticker]
    if (p !== undefined) return p.currentValue
    const q = stockQuotes[h.ticker]
    if (!q || !h.shares) return 0
    return q.price * h.shares
  }

  const stocksTotal = stocks.filter((h) => h.assetClass === 'stock').reduce((sum, h) => sum + holdingValue(h), 0)
  const reitsTotal = stocks.filter((h) => h.assetClass === 'reit').reduce((sum, h) => sum + holdingValue(h), 0)
  const stockCurrency = stockAccount?.currency ?? 'USD'
  const mixedCurrency = stockAccount !== null && stockCurrency !== 'USD' && cryptoTotal > 0
  // With no crypto the total is purely in the Trading 212 currency; otherwise
  // it is a USD/USDT-labelled mix and the note below says so.
  const totalCurrency = cryptoTotal === 0 ? stockCurrency : 'USD'

  const grandTotal = cryptoTotal + stocksTotal + reitsTotal

  // Count non-USDT crypto assets
  const nonUsdtHoldings = cryptoHoldings.filter((h) => h.asset !== 'USDT')

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Total value */}
      <div className="bg-panel-bg border border-panel-border rounded-lg p-4">
        <div className="text-xs text-text-muted font-mono mb-2">Total Portfolio Value</div>
        <div className="text-3xl font-mono font-bold text-text-primary">
          {formatMoney(grandTotal, totalCurrency)}
        </div>
        {grandTotal === 0 && (
          <p className="text-text-muted text-xs mt-2">
            Crypto loads from Binance and stocks from Trading 212 automatically once their API keys are set.
          </p>
        )}
        {mixedCurrency && (
          <p className="text-text-muted/60 text-xs mt-2">
            Stock and REIT values are in {stockCurrency} (Trading 212 account currency); crypto is in USDT. The total mixes both.
          </p>
        )}
      </div>

      {/* Allocation */}
      <div className="bg-panel-bg border border-panel-border rounded-lg p-4 space-y-3">
        <div className="text-xs text-text-muted font-mono mb-3">Allocation</div>
        <AllocationBar label="Crypto" value={cryptoTotal} total={grandTotal} color="bg-btc-orange" currency="USD" />
        <AllocationBar label="Stocks" value={stocksTotal} total={grandTotal} color="bg-bull-green" currency={stockCurrency} />
        <AllocationBar label="REITs"  value={reitsTotal}  total={grandTotal} color="bg-blue-400" currency={stockCurrency} />
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

      {/* Trading 212 summary */}
      {stockAccount !== null && (
        <div className="bg-panel-bg border border-panel-border rounded-lg p-4">
          <div className="text-xs text-text-muted font-mono mb-3">
            Trading 212 ({Object.keys(positions).length} positions)
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-text-muted">Account value</span>
              <span className="text-text-primary">{formatMoney(stockAccount.totalValue, stockCurrency)}</span>
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span className="text-text-muted">Cash available</span>
              <span className="text-text-primary">{formatMoney(stockAccount.cashAvailable, stockCurrency)}</span>
            </div>
            <div className="flex justify-between text-xs font-mono">
              <span className="text-text-muted">Unrealized P&L</span>
              <span className={stockAccount.unrealizedPnl >= 0 ? 'text-bull-green' : 'text-bear-red'}>
                {stockAccount.unrealizedPnl >= 0 ? '+' : ''}{formatMoney(stockAccount.unrealizedPnl, stockCurrency)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Watchlist note when nothing has a share count */}
      {stockAccount === null && stocks.length > 0 && stocks.every((h) => !h.shares) && (
        <p className="text-text-muted/60 text-xs px-1">
          Set TRADING212_API_KEY and TRADING212_API_SECRET to load real positions, or tell the assistant your share counts.
        </p>
      )}
    </div>
  )
}
