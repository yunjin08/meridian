import { formatPercent } from '@/lib/formatters'
import type { PortfolioSummary } from '@/lib/portfolioSummary'

interface AllocationBarProps {
  summary: PortfolioSummary
}

const SEGMENTS = [
  { key: 'crypto', label: 'Crypto', color: 'bg-btc-orange' },
  { key: 'stock',  label: 'Stocks', color: 'bg-bull-green' },
  { key: 'reit',   label: 'REITs',  color: 'bg-blue-400' },
] as const

export function AllocationBar({ summary }: AllocationBarProps) {
  const total = summary.total
  const segments = SEGMENTS.map((s) => ({
    ...s,
    pct: total > 0 ? (summary.classes[s.key].value / total) * 100 : 0,
  }))

  return (
    <section className="bg-panel-bg border border-panel-border rounded-lg p-4 h-full">
      <div className="text-xs text-text-muted font-mono mb-3">Allocation</div>
      <div className="h-2.5 rounded-full overflow-hidden bg-terminal-bg flex">
        {segments.map((s) => (
          <div
            key={s.key}
            className={`${s.color} h-full`}
            style={{ width: `${s.pct.toFixed(2)}%` }}
            title={`${s.label} ${formatPercent(s.pct, false)}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.color}`} />
            <span className="text-text-muted">{s.label}</span>
            <span className="text-text-primary">{formatPercent(s.pct, false)}</span>
          </div>
        ))}
      </div>
      {total === 0 && (
        <p className="mt-3 text-[11px] text-text-muted">
          Nothing priced yet. Crypto loads from Binance and stocks from Trading 212 once their API keys are set.
        </p>
      )}
      {summary.isMixedCurrency && (
        <p className="mt-3 text-[11px] text-text-muted">Shares mix USDT and {summary.classes.stock.currency} at face value.</p>
      )}
    </section>
  )
}
