import { SkeletonBlock } from '@/components/ui/SkeletonBlock'
import { formatMoney, formatPercent, formatTimestamp } from '@/lib/formatters'
import type { PortfolioSummary } from '@/lib/portfolioSummary'

interface PortfolioHeroProps {
  summary: PortfolioSummary
  isLoading: boolean
  error: string | null
}

export function PortfolioHero({ summary, isLoading, error }: PortfolioHeroProps) {
  const showSkeleton = isLoading && summary.asOf === null
  const isPositive = summary.change24hUsd >= 0
  const changeColor = isPositive ? 'text-bull-green' : 'text-bear-red'
  const stockCurrency = summary.classes.stock.currency

  return (
    <section className="bg-panel-bg border border-panel-border rounded-lg p-5 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-btc-orange/60 to-transparent" />
      <div className="text-[11px] uppercase tracking-widest text-text-muted font-mono">Total portfolio value</div>

      {showSkeleton ? (
        <div className="mt-3 space-y-2">
          <SkeletonBlock className="h-10 w-64" />
          <SkeletonBlock className="h-4 w-40" />
        </div>
      ) : (
        <>
          <div className="mt-2 text-4xl md:text-5xl font-mono font-bold text-text-primary tabular-nums">
            {formatMoney(summary.total, summary.totalCurrency)}
          </div>
          <div className="mt-2 flex items-baseline gap-3 font-mono text-sm">
            <span className={changeColor}>
              {isPositive ? '+' : ''}{formatMoney(summary.change24hUsd, summary.totalCurrency)}
            </span>
            {summary.change24hPercent !== null && (
              <span className={`${changeColor} text-xs`}>{formatPercent(summary.change24hPercent)}</span>
            )}
            <span className="text-text-muted text-xs">24h</span>
            {summary.asOf !== null && (
              <span className="ml-auto text-text-muted text-[11px]">as of {formatTimestamp(summary.asOf)}</span>
            )}
          </div>
          {summary.isMixedCurrency && (
            <p className="mt-2 text-[11px] text-text-muted">
              Stocks and REITs are in {stockCurrency} (Trading 212 account currency); crypto is in USDT. The total mixes both.
            </p>
          )}
        </>
      )}

      {error !== null && (
        <p className="mt-3 text-[11px] text-text-muted font-mono">Some data failed to load: {error}</p>
      )}
    </section>
  )
}
