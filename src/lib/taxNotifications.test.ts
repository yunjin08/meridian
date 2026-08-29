import { describe, expect, it } from 'vitest'
import { notificationKey, planNotification } from '@/lib/taxNotifications'
import { summarisePeriods } from '@/lib/tax'

function q1(today: string) {
  const [summary] = summarisePeriods([], [], 2026, today) // Q1 2026 deadline 2026-05-15
  if (summary === undefined) throw new Error('no summary')
  return summary
}

describe('planNotification', () => {
  it('announces the smallest matching threshold and marks all larger ones', () => {
    const plan = planNotification(q1('2026-05-10'), '2026-05-10', () => false) // 5 days out
    expect(plan?.title).toBe('BIR 1701Q due in 5 days')
    expect(plan?.keysToMark).toEqual([
      'tax-notified:2026:Q1:30',
      'tax-notified:2026:Q1:14',
      'tax-notified:2026:Q1:7',
    ])
  })

  it('returns null when every matching threshold is already marked', () => {
    const marked = new Set(['tax-notified:2026:Q1:30', 'tax-notified:2026:Q1:14', 'tax-notified:2026:Q1:7'])
    expect(planNotification(q1('2026-05-10'), '2026-05-10', (k) => marked.has(k))).toBeNull()
  })

  it('fires the 1-day threshold on the day before and on the deadline day', () => {
    expect(planNotification(q1('2026-05-14'), '2026-05-14', () => false)?.title).toBe('BIR 1701Q due tomorrow')
    expect(planNotification(q1('2026-05-15'), '2026-05-15', () => false)?.title).toBe('BIR 1701Q due today')
  })

  it('fires once when overdue', () => {
    const plan = planNotification(q1('2026-05-20'), '2026-05-20', () => false)
    expect(plan?.title).toBe('BIR 1701Q overdue by 5 days')
    expect(plan?.keysToMark).toEqual(['tax-notified:2026:Q1:overdue'])
    expect(planNotification(q1('2026-05-20'), '2026-05-20', (k) => k === notificationKey(q1('2026-05-20'), 'overdue'))).toBeNull()
  })

  it('returns null for upcoming or filed periods', () => {
    expect(planNotification(q1('2026-01-10'), '2026-01-10', () => false)).toBeNull()
    const [filed] = summarisePeriods([], [{ taxYear: 2026, period: 'Q1', filedOn: '2026-05-01', amountPaidPhp: 0 }], 2026, '2026-05-10')
    if (filed === undefined) throw new Error('no summary')
    expect(planNotification(filed, '2026-05-10', () => false)).toBeNull()
  })
})
