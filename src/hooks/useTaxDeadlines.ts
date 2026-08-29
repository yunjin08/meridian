import { useEffect, useMemo } from 'react'
import { getItem, setItem } from '@/lib/localStorage'
import { sendNotification } from '@/lib/notifications'
import { actionableDeadline, todayIso } from '@/lib/tax'
import { planNotification } from '@/lib/taxNotifications'
import { useTaxStore } from '@/store/taxStore'
import type { TaxPeriodSummary } from '@/types/tax'

/** The period that needs attention now (overdue first, then due within 30 days), or null. */
export function useTaxDeadlines(): TaxPeriodSummary | null {
  const entries = useTaxStore((s) => s.entries)
  const filings = useTaxStore((s) => s.filings)
  const hasLoaded = useTaxStore((s) => s.hasLoaded)
  const today = todayIso()

  return useMemo(
    () => (hasLoaded ? actionableDeadline(entries, filings, today) : null),
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
