import { useEffect, useMemo } from 'react'
import { getItem, setItem } from '@/lib/localStorage'
import { sendNotification } from '@/lib/notifications'
import { nextActionablePeriod, summarisePeriods, todayIso } from '@/lib/tax'
import { planNotification } from '@/lib/taxNotifications'
import { useTaxStore } from '@/store/taxStore'
import type { TaxPeriodSummary } from '@/types/tax'

function actionablePeriod(
  entries: ReturnType<typeof useTaxStore.getState>['entries'],
  filings: ReturnType<typeof useTaxStore.getState>['filings'],
  today: string,
): TaxPeriodSummary | null {
  const currentYear = Number(today.slice(0, 4))
  const current = summarisePeriods(entries, filings, currentYear, today)

  // Last year's annual return stays open until it is filed, even past April.
  const previous = summarisePeriods(entries, filings, currentYear - 1, today)
  const previousAnnual = previous.find((s) => s.period === 'ANNUAL')
  const candidates = previousAnnual !== undefined && previousAnnual.status !== 'filed'
    ? [previousAnnual, ...current]
    : current

  return nextActionablePeriod(candidates)
}

/** The period that needs attention now (overdue first, then due within 30 days), or null. */
export function useTaxDeadlines(): TaxPeriodSummary | null {
  const entries = useTaxStore((s) => s.entries)
  const filings = useTaxStore((s) => s.filings)
  const hasLoaded = useTaxStore((s) => s.hasLoaded)
  const today = todayIso()

  return useMemo(
    () => (hasLoaded ? actionablePeriod(entries, filings, today) : null),
    [entries, filings, hasLoaded, today],
  )
}

/** Fires at most one browser notification per threshold per period, tracked in localStorage. */
export function useTaxDeadlineNotifier(): void {
  const period = useTaxDeadlines()

  useEffect(() => {
    if (period === null) return
    // Only record a threshold as announced when the notice could actually be shown,
    // otherwise enabling permission later would silently skip it.
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const plan = planNotification(period, todayIso(), (key) => getItem<boolean>(key) === true)
    if (plan === null) return
    sendNotification(plan.title, plan.body, `tax-${period.taxYear}-${period.period}`)
    for (const key of plan.keysToMark) setItem(key, true)
  }, [period])
}
