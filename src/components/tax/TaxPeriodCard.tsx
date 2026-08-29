import { useState } from 'react'
import type { FormEvent } from 'react'
import { formatIsoDate, formatPhp } from '@/lib/formatters'
import { daysUntil, isValidIsoDate, todayIso } from '@/lib/tax'
import { useTaxStore } from '@/store/taxStore'
import type { TaxPeriodStatus, TaxPeriodSummary } from '@/types/tax'

interface TaxPeriodCardProps {
  summary: TaxPeriodSummary
}

const STATUS_STYLE: Record<TaxPeriodStatus, { label: string; pill: string; border: string }> = {
  upcoming: { label: 'Upcoming', pill: 'text-text-muted border-panel-border', border: 'border-panel-border' },
  due_soon: { label: 'Due soon', pill: 'text-btc-orange border-btc-orange/50 bg-btc-orange/10', border: 'border-btc-orange/50' },
  overdue:  { label: 'Overdue',  pill: 'text-bear-red border-bear-red/50 bg-bear-red/10', border: 'border-bear-red/60' },
  filed:    { label: 'Filed',    pill: 'text-bull-green border-bull-green/50 bg-bull-green/10', border: 'border-panel-border' },
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between font-mono text-[11px]">
      <span className="text-text-muted">{label}</span>
      <span className={strong ? 'text-text-primary font-semibold' : 'text-text-primary'}>{value}</span>
    </div>
  )
}

function periodTitle(summary: TaxPeriodSummary): string {
  return summary.period === 'ANNUAL' ? `Annual ${summary.taxYear}` : `${summary.period} ${summary.taxYear}`
}

function deadlineLine(summary: TaxPeriodSummary): string {
  const remaining = daysUntil(summary.deadline, todayIso())
  if (summary.status === 'filed') return `Deadline ${formatIsoDate(summary.deadline)}`
  if (remaining < 0) return `${-remaining} day${remaining === -1 ? '' : 's'} overdue`
  if (remaining === 0) return 'Due today'
  return `${remaining} day${remaining === 1 ? '' : 's'} left`
}

export function TaxPeriodCard({ summary }: TaxPeriodCardProps) {
  const markFiled = useTaxStore((s) => s.markFiled)
  const unmarkFiled = useTaxStore((s) => s.unmarkFiled)
  const [isMarking, setIsMarking] = useState(false)
  const [filedOn, setFiledOn] = useState(todayIso())
  const [amountPaid, setAmountPaid] = useState(summary.taxDuePhp.toFixed(2))
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const style = STATUS_STYLE[summary.status]

  async function submitFiling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValidIsoDate(filedOn)) { setError('Enter a valid filing date.'); return }
    const paid = Number(amountPaid)
    if (!Number.isFinite(paid) || paid < 0) { setError('Amount paid must be zero or more.'); return }
    setIsSaving(true)
    setError(null)
    try {
      await markFiled({ taxYear: summary.taxYear, period: summary.period, filedOn, amountPaidPhp: paid })
      setIsMarking(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark as filed')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={`bg-panel-bg border rounded-lg p-4 flex flex-col gap-3 ${style.border}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-sm font-semibold text-text-primary">{periodTitle(summary)}</div>
          <div className="font-mono text-[10px] text-text-muted">
            BIR {summary.form} · {formatIsoDate(summary.periodStart)} to {formatIsoDate(summary.periodEnd)}
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono ${style.pill}`}>{style.label}</span>
      </div>

      <div className="space-y-1">
        <Row label={summary.period === 'ANNUAL' ? 'Gross (year)' : 'Gross (quarter)'} value={formatPhp(summary.grossPhp)} />
        <Row label="Cumulative gross" value={formatPhp(summary.cumulativeGrossPhp)} />
        <Row label="Taxable after ₱250k" value={formatPhp(summary.taxablePhp)} />
        <Row label="Tax due (8%)" value={formatPhp(summary.taxDuePhp)} strong />
      </div>

      <div className="flex items-center justify-between font-mono text-[11px] border-t border-panel-border pt-2">
        <span className="text-text-muted">Deadline {formatIsoDate(summary.deadline)}</span>
        <span className={summary.status === 'overdue' ? 'text-bear-red' : summary.status === 'due_soon' ? 'text-btc-orange' : 'text-text-muted'}>
          {deadlineLine(summary)}
        </span>
      </div>

      {summary.filing !== null ? (
        <div className="flex items-center justify-between font-mono text-[11px]">
          <span className="text-bull-green">
            Filed {formatIsoDate(summary.filing.filedOn)} · paid {formatPhp(summary.filing.amountPaidPhp)}
          </span>
          <button
            type="button"
            onClick={() => {
              unmarkFiled(summary.taxYear, summary.period).catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Failed to unmark')
              })
            }}
            className="text-text-muted hover:text-text-primary underline-offset-2 hover:underline"
          >
            Unmark
          </button>
        </div>
      ) : isMarking ? (
        <form onSubmit={(e) => { void submitFiling(e) }} className="grid grid-cols-2 gap-2">
          <input type="date" value={filedOn} onChange={(e) => setFiledOn(e.target.value)} aria-label="Date filed" className="bg-terminal-bg border border-panel-border rounded px-2 py-1 font-mono text-xs text-text-primary outline-none focus:border-text-muted" required />
          <input type="number" min="0" step="0.01" inputMode="decimal" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} aria-label="Amount paid in PHP" className="bg-terminal-bg border border-panel-border rounded px-2 py-1 font-mono text-xs text-text-primary outline-none focus:border-text-muted" required />
          <button type="submit" disabled={isSaving} className="px-2 py-1 rounded bg-bull-green text-terminal-bg font-mono text-xs font-semibold disabled:opacity-60">
            {isSaving ? 'Saving…' : 'Confirm filed'}
          </button>
          <button type="button" onClick={() => { setIsMarking(false); setError(null) }} className="px-2 py-1 rounded border border-panel-border font-mono text-xs text-text-muted">Cancel</button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsMarking(true)}
          className="self-start px-2.5 py-1 rounded border border-panel-border font-mono text-xs text-text-muted hover:text-text-primary hover:border-text-muted"
        >
          Mark as filed
        </button>
      )}

      {error !== null && <p className="text-[11px] text-bear-red font-mono">{error}</p>}
    </div>
  )
}
