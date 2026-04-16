import { useCryptoHoldingsStore } from '@/store/cryptoHoldingsStore'
import { useBalanceStore } from '@/store/balanceStore'
import { formatPrice } from '@/lib/formatters'
import { CryptoHoldingRow } from './CryptoHoldingRow'
import { CryptoTradeDetails } from './CryptoTradeDetails'

export function CryptoHoldingsList() {
  const holdings = useCryptoHoldingsStore((s) => s.holdings)
  const balance = useBalanceStore((s) => s.balance)
  const isLoading = useBalanceStore((s) => s.isLoading)
  const error = useBalanceStore((s) => s.error)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-text-muted font-mono">Holdings</span>
        {balance !== null && (
          <span className="text-xs font-mono text-text-muted">
            Total ≈ {formatPrice(balance.totalUsdtValue)}
          </span>
        )}
      </div>

      {isLoading && holdings.length === 0 && (
        <div className="animate-pulse space-y-1">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-panel-border rounded" />
          ))}
        </div>
      )}

      {error !== null && holdings.length === 0 && (
        <div className="text-bear-red text-xs px-2 py-1">{error}</div>
      )}

      {holdings.length > 0 && (
        <div className="space-y-1">
          {holdings.map((h) => (
            <CryptoHoldingRow key={h.asset} holding={h} />
          ))}
          <CryptoTradeDetails />
        </div>
      )}

      {holdings.length === 0 && !isLoading && error === null && (
        <div className="text-text-muted/50 text-xs text-center py-4">
          No holdings found
        </div>
      )}
    </div>
  )
}
