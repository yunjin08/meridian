import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  daysUntil,
  deadlineFor,
  isValidIsoDate,
  nextActionablePeriod,
  periodRange,
  quarterOf,
  summarisePeriods,
  todayIso,
} from '@/lib/tax'
import type { TaxFiling, TaxIncomeEntry } from '@/types/tax'

function entry(receivedOn: string, amountPhp: number): TaxIncomeEntry {
  return {
    id: `${receivedOn}-${amountPhp}`,
    receivedOn,
    source: 'Client',
    amountPhp,
    note: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

describe('date helpers', () => {
  it('validates real ISO dates only', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true)
    expect(isValidIsoDate('2026-02-30')).toBe(false)
    expect(isValidIsoDate('2026-2-3')).toBe(false)
    expect(isValidIsoDate('nope')).toBe(false)
  })

  it('uses the local calendar date for today', () => {
    const local = new Date(2026, 4, 15, 23, 30)
    expect(todayIso(local)).toBe('2026-05-15')
  })

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('counts signed days between dates', () => {
    expect(daysBetween('2026-05-01', '2026-05-15')).toBe(14)
    expect(daysBetween('2026-05-15', '2026-05-01')).toBe(-14)
    expect(daysUntil('2026-05-15', '2026-05-15')).toBe(0)
  })
})

describe('quarters and deadlines', () => {
  it('maps months to quarters', () => {
    expect(quarterOf('2026-01-31')).toBe('Q1')
    expect(quarterOf('2026-04-01')).toBe('Q2')
    expect(quarterOf('2026-09-30')).toBe('Q3')
    expect(quarterOf('2026-10-01')).toBe('Q4')
  })

  it('gives period ranges', () => {
    expect(periodRange(2026, 'Q2')).toEqual({ start: '2026-04-01', end: '2026-06-30' })
    expect(periodRange(2026, 'ANNUAL')).toEqual({ start: '2026-01-01', end: '2026-12-31' })
  })

  it('places statutory deadlines', () => {
    // 2026: May 15 Fri, Aug 15 Sat, Nov 15 Sun; Apr 15 2027 Thu
    expect(deadlineFor(2026, 'Q1')).toBe('2026-05-15')
    expect(deadlineFor(2026, 'Q2')).toBe('2026-08-17')
    expect(deadlineFor(2026, 'Q3')).toBe('2026-11-16')
    expect(deadlineFor(2026, 'ANNUAL')).toBe('2027-04-15')
  })

  it('rolls a Saturday deadline to Monday', () => {
    // May 15 2027 is a Saturday
    expect(deadlineFor(2027, 'Q1')).toBe('2027-05-17')
  })
})

describe('summarisePeriods', () => {
  const noFilings: TaxFiling[] = []

  it('charges nothing at exactly the exemption and 8% on the peso above it', () => {
    const atLimit = summarisePeriods([entry('2026-02-01', 250_000)], noFilings, 2026, '2026-03-01')
    expect(atLimit[0]?.taxDuePhp).toBe(0)

    const overByOne = summarisePeriods([entry('2026-02-01', 250_001)], noFilings, 2026, '2026-03-01')
    expect(overByOne[0]?.taxablePhp).toBe(1)
    expect(overByOne[0]?.taxDuePhp).toBeCloseTo(0.08, 10)
  })

  it('credits earlier quarters cumulatively', () => {
    const entries = [entry('2026-01-15', 200_000), entry('2026-05-15', 100_000)]
    const [q1, q2, q3, annual] = summarisePeriods(entries, noFilings, 2026, '2026-01-01')

    expect(q1?.grossPhp).toBe(200_000)
    expect(q1?.cumulativeGrossPhp).toBe(200_000)
    expect(q1?.taxDuePhp).toBe(0)

    expect(q2?.grossPhp).toBe(100_000)
    expect(q2?.cumulativeGrossPhp).toBe(300_000)
    expect(q2?.taxablePhp).toBe(50_000)
    expect(q2?.taxDuePhp).toBeCloseTo(4_000, 6)

    expect(q3?.grossPhp).toBe(0)
    expect(q3?.taxDuePhp).toBe(0)

    expect(annual?.grossPhp).toBe(300_000)
    expect(annual?.cumulativeTaxPhp).toBeCloseTo(4_000, 6)
    expect(annual?.taxDuePhp).toBe(0)
  })

  it('settles Q4 receipts on the annual return', () => {
    const [q1, , q3, annual] = summarisePeriods([entry('2026-11-20', 400_000)], noFilings, 2026, '2026-12-01')
    expect(q1?.taxDuePhp).toBe(0)
    expect(q3?.taxDuePhp).toBe(0)
    expect(annual?.grossPhp).toBe(400_000)
    expect(annual?.taxDuePhp).toBeCloseTo(12_000, 6)
  })

  it('ignores entries from other years', () => {
    const [q1] = summarisePeriods([entry('2025-02-01', 999_999)], noFilings, 2026, '2026-03-01')
    expect(q1?.cumulativeGrossPhp).toBe(0)
  })

  it('derives status from deadline, today, and filings', () => {
    // Q1 2026 deadline is 2026-05-15
    expect(summarisePeriods([], noFilings, 2026, '2026-04-14')[0]?.status).toBe('upcoming')
    expect(summarisePeriods([], noFilings, 2026, '2026-04-15')[0]?.status).toBe('due_soon')
    expect(summarisePeriods([], noFilings, 2026, '2026-05-15')[0]?.status).toBe('due_soon')
    expect(summarisePeriods([], noFilings, 2026, '2026-05-16')[0]?.status).toBe('overdue')

    const filed: TaxFiling[] = [{ taxYear: 2026, period: 'Q1', filedOn: '2026-05-10', amountPaidPhp: 0 }]
    const [q1] = summarisePeriods([], filed, 2026, '2026-06-01')
    expect(q1?.status).toBe('filed')
    expect(q1?.filing?.filedOn).toBe('2026-05-10')
  })
})

describe('nextActionablePeriod', () => {
  it('prefers overdue over due_soon and returns null when nothing is actionable', () => {
    // Today 2026-08-20: Q1 (May 15) overdue, Q2 (Aug 17) overdue, Q3 upcoming
    const summaries = summarisePeriods([], [], 2026, '2026-08-20')
    expect(nextActionablePeriod(summaries)?.period).toBe('Q1')

    const q1Filed: TaxFiling[] = [{ taxYear: 2026, period: 'Q1', filedOn: '2026-05-01', amountPaidPhp: 0 }]
    expect(nextActionablePeriod(summarisePeriods([], q1Filed, 2026, '2026-08-20'))?.period).toBe('Q2')

    const allFiled: TaxFiling[] = [
      { taxYear: 2026, period: 'Q1', filedOn: '2026-05-01', amountPaidPhp: 0 },
      { taxYear: 2026, period: 'Q2', filedOn: '2026-08-01', amountPaidPhp: 0 },
    ]
    expect(nextActionablePeriod(summarisePeriods([], allFiled, 2026, '2026-08-20'))).toBeNull()

    // Due soon only
    expect(nextActionablePeriod(summarisePeriods([], allFiled, 2026, '2026-10-20'))?.period).toBe('Q3')
  })
})
