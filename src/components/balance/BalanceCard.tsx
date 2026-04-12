import { useBalanceStore } from '@/store/balanceStore'
import { usePriceStore } from '@/store/priceStore'
import { formatBtc, formatPrice, formatTimestamp } from '@/lib/formatters'

export function BalanceCard() {
  const balance = useBalanceStore((s) => s.balance)
  const isLoading = useBalanceStore((s) => s.isLoading)
  const error = useBalanceStore((s) => s.error)
  const price = usePriceStore((s) => s.price)

  // Recompute btcInUsdt from live price if we have both
  const btcInUsdt =
    balance !== null && price !== null ? balance.btc * price : balance?.btcInUsdt ?? null

  return (
    <div className="bg-panel-bg border border-panel-border rounded-lg p-4 h-full">
      <div className="text-xs text-text-muted mb-3 font-mono">Account Balance</div>

      {isLoading && balance === null && (
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-panel-border rounded w-3/4" />
          <div className="h-4 bg-panel-border rounded w-1/2" />
        </div>
      )}

      {error !== null && balance === null && (
        <div className="text-bear-red text-xs">{error}</div>
      )}

      {balance !== null && (
        <div className="space-y-2">
          <div>
            <div className="text-xs text-text-muted/60 mb-0.5">BTC</div>
            <div className="font-mono text-sm text-text-primary">{formatBtc(balance.btc)}</div>
            {btcInUsdt !== null && (
              <div className="font-mono text-xs text-text-muted">≈ {formatPrice(btcInUsdt)}</div>
            )}
          </div>
          <div>
            <div className="text-xs text-text-muted/60 mb-0.5">USDT</div>
            <div className="font-mono text-sm text-text-primary">{formatPrice(balance.usdt)}</div>
          </div>
          <div className="text-xs text-text-muted/60 pt-1">
            Updated {formatTimestamp(balance.fetchedAt)}
          </div>
        </div>
      )}

      {balance === null && !isLoading && error === null && (
        <div className="text-text-muted text-xs">No balance data</div>
      )}
    </div>
  )
}
