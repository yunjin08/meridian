import { EnableNotificationsButton } from '@/components/tax/EnableNotificationsButton'
import { useTaxDeadlines } from '@/hooks/useTaxDeadlines'
import { formatIsoDate, formatPhp } from '@/lib/formatters'
import { daysUntil, todayIso } from '@/lib/tax'
import { useNavigationStore } from '@/store/navigationStore'

export function TaxDeadlineBanner() {
  const period = useTaxDeadlines()
  const setActiveTab = useNavigationStore((s) => s.setActiveTab)

  if (period === null) return null

  const remaining = daysUntil(period.deadline, todayIso())
  const isOverdue = remaining < 0
  const isUrgent = !isOverdue && remaining <= 7
  const tone = isOverdue
    ? 'border-bear-red/60 bg-bear-red/10 text-bear-red'
    : isUrgent
      ? 'border-btc-orange/60 bg-btc-orange/10 text-btc-orange'
      : 'border-panel-border bg-panel-bg text-text-primary'
  const periodLabel = period.period === 'ANNUAL' ? `${period.taxYear} annual return` : `${period.period} ${period.taxYear}`

  let headline: string
  if (isOverdue) headline = `BIR ${period.form} overdue by ${-remaining} day${remaining === -1 ? '' : 's'}`
  else if (remaining === 0) headline = `BIR ${period.form} due today`
  else headline = `BIR ${period.form} due in ${remaining} day${remaining === 1 ? '' : 's'}`

  return (
    <div role="status" className={`border rounded-lg px-4 py-3 flex flex-wrap items-center gap-3 ${tone}`}>
      <span className="font-mono text-sm font-semibold">{headline}</span>
      <span className="font-mono text-xs text-text-muted">
        {periodLabel} · {formatPhp(period.taxDuePhp)} due · deadline {formatIsoDate(period.deadline)}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <EnableNotificationsButton />
        <button
          type="button"
          onClick={() => setActiveTab('tax')}
          className="px-2.5 py-1 rounded border border-current font-mono text-xs hover:bg-panel-border/40"
        >
          Open Tax
        </button>
      </div>
    </div>
  )
}
