import { OVERVIEW_TAX_IN_PROGRESS } from '@/constants'

/**
 * The Overview tab as a visitor sees it: every label real, every value hidden.
 * Figures render only after the owner signs in, so nothing here is sample data.
 */
function Hidden({ width }: { width: string }) {
  return (
    <span
      className={`inline-block h-4 ${width} rounded-sm bg-[repeating-linear-gradient(135deg,#30363d_0_4px,transparent_4px_8px)]`}
      aria-label="hidden until sign-in"
    />
  )
}

const CLASSES: { label: string; tone: string }[] = [
  { label: 'Crypto', tone: 'bg-btc-orange/70' },
  { label: 'Stocks', tone: 'bg-bull-green/70' },
  { label: 'REITs', tone: 'bg-text-muted/60' },
]

const ROWS = ['Invested', 'Current value', 'Unrealized P&L', 'Realized P&L']

export function OverviewPreview() {
  return (
    <div data-anim="card" className="hero-anim rounded-lg border border-panel-border bg-panel-bg p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-sm font-semibold text-text-primary">Overview</span>
        <span className="rounded-md border border-panel-border px-2 py-0.5 font-mono text-[11px] text-text-muted">
          owner data, hidden here
        </span>
      </div>

      <div className="mt-4">
        <div className="text-xs text-text-muted">Total portfolio value</div>
        <div className="mt-1 flex items-center gap-3">
          <Hidden width="w-40" />
          <Hidden width="w-14" />
        </div>
      </div>

      <div className="mt-5">
        <div className="flex h-1.5 overflow-hidden rounded-full">
          {CLASSES.map((c, i) => (
            <span
              key={c.label}
              data-anim={`alloc-${i}`}
              className={`flex-1 origin-left ${c.tone}`}
              style={{ transform: 'scaleX(0)' }}
            />
          ))}
        </div>
        <div className="mt-2 flex gap-4 font-mono text-[11px] text-text-muted">
          {CLASSES.map((c) => (
            <span key={c.label} className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${c.tone}`} aria-hidden="true" />
              {c.label}
            </span>
          ))}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-panel-border pt-4 font-mono text-xs">
        {ROWS.map((row, i) => (
          <div key={row} data-anim={`row-${i}`} className="hero-anim flex items-center justify-between gap-3">
            <dt className="text-text-muted">{row}</dt>
            <dd><Hidden width="w-16" /></dd>
          </div>
        ))}
      </dl>

      <div data-anim="deadline" className="hero-anim mt-4 flex items-center justify-between gap-3 rounded-md border border-btc-orange/30 bg-btc-orange/[0.06] px-3 py-2 font-mono text-xs">
        <span className="text-text-muted">
          Next BIR deadline, 1701Q
          {OVERVIEW_TAX_IN_PROGRESS && <span className="ml-2 text-btc-orange">in progress</span>}
        </span>
        <Hidden width="w-20" />
      </div>
    </div>
  )
}
