import { TAX_NOTIFY_THRESHOLDS_DAYS } from '@/constants'
import { daysUntil } from '@/lib/tax'
import { formatIsoDate, formatPhp } from '@/lib/formatters'
import type { TaxPeriodSummary } from '@/types/tax'

export interface NotificationPlan {
  title: string
  body: string
  keysToMark: string[]
}

export function notificationKey(summary: TaxPeriodSummary, marker: number | 'overdue'): string {
  return `tax-notified:${summary.taxYear}:${summary.period}:${marker}`
}

function periodLabel(summary: TaxPeriodSummary): string {
  return summary.period === 'ANNUAL' ? `${summary.taxYear} annual return` : `${summary.period} ${summary.taxYear}`
}

function body(summary: TaxPeriodSummary): string {
  return `${periodLabel(summary)}: ${formatPhp(summary.taxDuePhp)} due, deadline ${formatIsoDate(summary.deadline)}`
}

/**
 * Decide whether to show a browser notification for this period today.
 * Returns null when the period needs no notice or every applicable
 * threshold has already been announced (tracked by the caller via keys).
 */
export function planNotification(
  summary: TaxPeriodSummary,
  today: string,
  isMarked: (key: string) => boolean,
): NotificationPlan | null {
  if (summary.status === 'filed' || summary.status === 'upcoming') return null

  const remaining = daysUntil(summary.deadline, today)

  if (remaining < 0) {
    const key = notificationKey(summary, 'overdue')
    if (isMarked(key)) return null
    return {
      title: `BIR ${summary.form} overdue by ${-remaining} day${remaining === -1 ? '' : 's'}`,
      body: body(summary),
      keysToMark: [key],
    }
  }

  const applicable = TAX_NOTIFY_THRESHOLDS_DAYS.filter((t) => remaining <= t)
  const unmarked = applicable.filter((t) => !isMarked(notificationKey(summary, t)))
  if (unmarked.length === 0) return null

  let title: string
  if (remaining === 0) title = `BIR ${summary.form} due today`
  else if (remaining === 1) title = `BIR ${summary.form} due tomorrow`
  else title = `BIR ${summary.form} due in ${remaining} days`

  return {
    title,
    body: body(summary),
    keysToMark: applicable.map((t) => notificationKey(summary, t)),
  }
}
