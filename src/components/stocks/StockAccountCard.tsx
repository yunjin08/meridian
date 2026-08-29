import { useStockPositionsStore } from '@/store/stockPositionsStore'
import { formatMoney, formatPercent } from '@/lib/formatters'

function Row({ label, value, tone }: Readonly<{ label: string; value: string; tone?: 'bull' | 'bear' }>) {
  const color = tone === 'bull' ? 'text-bull-green' : tone === 'bear' ? 'text-bear-red' : 'text-text-primary'
  return (
    <div className="flex justify-between text-[10px] font-mono">
      <span className="text-text-muted">{label}</span>
      <span className={color}>{value}</span>
    </div>
  )
}

export function StockAccountCard() {
  const account = useStockPositionsStore((s) => s.account)
  const isLoading = useStockPositionsStore((s) => s.isLoading)
  const error = useStockPositionsStore((s) => s.error)

  if (account === null) {
    return (
      <div className="flex flex-col gap-1">
        <div className="text-xs text-text-muted font-mono mb-1">Trading 212</div>
        {error !== null ? (
          <div className="text-bear-red text-xs">{error}</div>
        ) : isLoading ? (
          <div className="animate-pulse space-y-1">
            <div className="h-6 bg-panel-border rounded" />
            <div className="h-3 bg-panel-border rounded w-2/3" />
          </div>
        ) : (
          <div className="text-text-muted/50 text-xs">
            Add <code className="font-mono">TRADING212_API_KEY</code> and{' '}
            <code className="font-mono">TRADING212_API_SECRET</code> to load positions
          </div>
        )}
      </div>
    )
  }

  const pnlPct = account.investedCost > 0 ? (account.unrealizedPnl / account.investedCost) * 100 : 0
  const pnlTone = account.unrealizedPnl >= 0 ? 'bull' : 'bear'
  const sign = account.unrealizedPnl >= 0 ? '+' : ''
  const cur = account.currency

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-text-muted font-mono">Trading 212</span>
        {error !== null && <span className="text-bear-red text-[10px]" title={error}>stale</span>}
      </div>
      <div className="font-mono font-bold text-lg text-text-primary leading-tight">
        {formatMoney(account.totalValue, cur)}
      </div>
      <div className={`font-mono text-[10px] mb-1 ${pnlTone === 'bull' ? 'text-bull-green' : 'text-bear-red'}`}>
        {sign}{formatMoney(account.unrealizedPnl, cur)} ({formatPercent(pnlPct)}) unrealized
      </div>
      <Row label="Invested" value={formatMoney(account.invested, cur)} />
      <Row label="Cost basis" value={formatMoney(account.investedCost, cur)} />
      <Row label="Cash" value={formatMoney(account.cashAvailable, cur)} />
      {account.cashReserved > 0 && (
        <Row label="Reserved" value={formatMoney(account.cashReserved, cur)} />
      )}
      {account.cashInPies > 0 && (
        <Row label="In pies" value={formatMoney(account.cashInPies, cur)} />
      )}
      <Row
        label="Realized P&L"
        value={`${account.realizedPnl >= 0 ? '+' : ''}${formatMoney(account.realizedPnl, cur)}`}
        tone={account.realizedPnl >= 0 ? 'bull' : 'bear'}
      />
    </div>
  )
}
