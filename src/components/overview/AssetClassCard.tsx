import { SkeletonBlock } from '@/components/ui/SkeletonBlock'
import { useNavigationStore, type DashboardTab } from '@/store/navigationStore'
import { formatMoney, formatPercent } from '@/lib/formatters'
import type { ClassSummary } from '@/lib/portfolioSummary'

interface AssetClassCardProps {
  label: string
  tab: DashboardTab
  summary: ClassSummary
  total: number
  accentClass: string     // e.g. 'bg-btc-orange'
  isLoading: boolean
  detail?: string         // one extra line, e.g. Trading 212 cash and P&L
}

export function AssetClassCard({ label, tab, summary, total, accentClass, isLoading, detail }: AssetClassCardProps) {
  const setActiveTab = useNavigationStore((s) => s.setActiveTab)
  const share = total > 0 ? (summary.value / total) * 100 : 0
  const isPositive = summary.change24hUsd >= 0
  const showSkeleton = isLoading && summary.value === 0 && summary.holdingCount === 0
  const allUnpriced = summary.holdingCount > 0 && summary.unpricedCount === summary.holdingCount

  return (
    <button
      type="button"
      onClick={() => setActiveTab(tab)}
      className="text-left bg-panel-bg border border-panel-border rounded-lg p-4 hover:border-text-muted/60 transition-colors group flex flex-col"
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${accentClass}`} />
        <span className="text-xs text-text-muted font-mono uppercase tracking-wider">{label}</span>
        <span className="ml-auto text-[10px] text-text-muted font-mono">
          {summary.holdingCount} {summary.holdingCount === 1 ? 'holding' : 'holdings'}
        </span>
      </div>

      {showSkeleton ? (
        <div className="mt-3 space-y-2">
          <SkeletonBlock className="h-7 w-32" />
          <SkeletonBlock className="h-3 w-20" />
        </div>
      ) : (
        <>
          <div className="mt-3 text-2xl font-mono font-semibold text-text-primary tabular-nums">
            {allUnpriced
              ? <span className="text-text-muted text-base">Unpriced</span>
              : formatMoney(summary.value, summary.currency)}
          </div>
          <div className="mt-1 flex items-baseline gap-2 font-mono text-xs">
            <span className="text-text-muted">{formatPercent(share, false)} of total</span>
            {summary.change24hPercent !== null && (
              <span className={isPositive ? 'text-bull-green' : 'text-bear-red'}>
                {formatPercent(summary.change24hPercent)} 24h
              </span>
            )}
          </div>
          {allUnpriced && (
            <p className="mt-2 text-[11px] text-text-muted">Connect Trading 212 or add share counts to price these.</p>
          )}
          {!allUnpriced && summary.unpricedCount > 0 && (
            <p className="mt-2 text-[11px] text-text-muted">{summary.unpricedCount} without a position or share count.</p>
          )}
          {detail !== undefined && (
            <p className="mt-2 text-[11px] text-text-muted font-mono">{detail}</p>
          )}
        </>
      )}

      <div className="mt-auto pt-3 text-[11px] font-mono text-text-muted group-hover:text-text-primary transition-colors">
        View {label} →
      </div>
    </button>
  )
}
