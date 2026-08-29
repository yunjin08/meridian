import { formatMoney, formatPercent } from '@/lib/formatters'
import type { HoldingSummary, SummaryClass } from '@/lib/portfolioSummary'

interface TopHoldingsListProps {
  holdings: HoldingSummary[]
  total: number
}

const CLASS_TAG: Record<SummaryClass, { label: string; className: string }> = {
  crypto: { label: 'CRYPTO', className: 'text-btc-orange border-btc-orange/40' },
  stock:  { label: 'STOCK',  className: 'text-bull-green border-bull-green/40' },
  reit:   { label: 'REIT',   className: 'text-blue-400 border-blue-400/40' },
}

export function TopHoldingsList({ holdings, total }: TopHoldingsListProps) {
  return (
    <section className="bg-panel-bg border border-panel-border rounded-lg p-4 h-full">
      <div className="text-xs text-text-muted font-mono mb-3">Top holdings</div>
      {holdings.length === 0 ? (
        <p className="text-[11px] text-text-muted">No priced holdings yet.</p>
      ) : (
        <ul className="divide-y divide-panel-border/60">
          {holdings.map((h) => {
            const tag = CLASS_TAG[h.assetClass]
            const share = total > 0 ? (h.value / total) * 100 : 0
            return (
              <li key={`${h.assetClass}-${h.symbol}`} className="flex items-center gap-3 py-2 font-mono text-xs">
                <span className={`px-1.5 py-0.5 rounded border text-[9px] tracking-wider ${tag.className}`}>{tag.label}</span>
                <span className="font-semibold text-text-primary">{h.symbol}</span>
                {h.changePercent !== null && (
                  <span className={`text-[11px] ${h.changePercent >= 0 ? 'text-bull-green' : 'text-bear-red'}`}>
                    {formatPercent(h.changePercent)}
                  </span>
                )}
                <span className="ml-auto text-text-primary tabular-nums">{formatMoney(h.value, h.currency)}</span>
                <span className="w-14 text-right text-text-muted tabular-nums">{formatPercent(share, false)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
