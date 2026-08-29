import { TAX_ANNUAL_EXEMPTION_PHP, TAX_DEADLINE_WARNING_DAYS, TAX_RATE } from '@/constants'
import { parseIsoDate, toIsoDate } from '@/lib/isoDate'
import type {
  TaxFiling,
  TaxIncomeEntry,
  TaxPeriod,
  TaxPeriodStatus,
  TaxPeriodSummary,
} from '@/types/tax'

// Re-exported so existing consumers (and tests) can keep importing
// `isValidIsoDate` from `@/lib/tax`. The implementation lives in
// `@/lib/isoDate`, which stays free of `@/` imports because it is also
// bundled directly into a Netlify Function.
export { isValidIsoDate } from '@/lib/isoDate'

export const TAX_PERIODS: readonly TaxPeriod[] = ['Q1', 'Q2', 'Q3', 'ANNUAL']

const MS_PER_DAY = 86_400_000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** The user's local calendar date, as YYYY-MM-DD. */
export function todayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

export function addDays(iso: string, days: number): string {
  const date = parseIsoDate(iso)
  date.setUTCDate(date.getUTCDate() + days)
  return toIsoDate(date)
}

/** Signed whole days from `from` to `to`. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / MS_PER_DAY)
}

export function daysUntil(deadline: string, today: string): number {
  return daysBetween(today, deadline)
}

export function quarterOf(iso: string): 'Q1' | 'Q2' | 'Q3' | 'Q4' {
  const month = parseIsoDate(iso).getUTCMonth()
  if (month < 3) return 'Q1'
  if (month < 6) return 'Q2'
  if (month < 9) return 'Q3'
  return 'Q4'
}

export function periodRange(taxYear: number, period: TaxPeriod): { start: string; end: string } {
  switch (period) {
    case 'Q1':     return { start: `${taxYear}-01-01`, end: `${taxYear}-03-31` }
    case 'Q2':     return { start: `${taxYear}-04-01`, end: `${taxYear}-06-30` }
    case 'Q3':     return { start: `${taxYear}-07-01`, end: `${taxYear}-09-30` }
    case 'ANNUAL': return { start: `${taxYear}-01-01`, end: `${taxYear}-12-31` }
  }
}

// BIR moves a deadline that lands on a weekend to the next business day.
// Public holidays are not modelled.
function rollForwardFromWeekend(iso: string): string {
  const day = parseIsoDate(iso).getUTCDay()
  if (day === 6) return addDays(iso, 2)
  if (day === 0) return addDays(iso, 1)
  return iso
}

export function deadlineFor(taxYear: number, period: TaxPeriod): string {
  switch (period) {
    case 'Q1':     return rollForwardFromWeekend(`${taxYear}-05-15`)
    case 'Q2':     return rollForwardFromWeekend(`${taxYear}-08-15`)
    case 'Q3':     return rollForwardFromWeekend(`${taxYear}-11-15`)
    case 'ANNUAL': return rollForwardFromWeekend(`${taxYear + 1}-04-15`)
  }
}

export function formFor(period: TaxPeriod): '1701Q' | '1701A' {
  return period === 'ANNUAL' ? '1701A' : '1701Q'
}

function sumAmounts(entries: readonly TaxIncomeEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amountPhp, 0)
}

function statusFor(deadline: string, filing: TaxFiling | null, today: string): TaxPeriodStatus {
  if (filing !== null) return 'filed'
  const remaining = daysUntil(deadline, today)
  if (remaining < 0) return 'overdue'
  if (remaining <= TAX_DEADLINE_WARNING_DAYS) return 'due_soon'
  return 'upcoming'
}

export function summarisePeriods(
  entries: readonly TaxIncomeEntry[],
  filings: readonly TaxFiling[],
  taxYear: number,
  today: string,
): TaxPeriodSummary[] {
  const yearPrefix = `${taxYear}-`
  const yearEntries = entries.filter((e) => e.receivedOn.startsWith(yearPrefix))

  let previousCumulativeTax = 0
  return TAX_PERIODS.map((period) => {
    const { start, end } = periodRange(taxYear, period)
    const grossPhp = sumAmounts(yearEntries.filter((e) => e.receivedOn >= start && e.receivedOn <= end))
    const cumulativeGrossPhp = sumAmounts(yearEntries.filter((e) => e.receivedOn <= end))
    const taxablePhp = Math.max(0, cumulativeGrossPhp - TAX_ANNUAL_EXEMPTION_PHP)
    const cumulativeTaxPhp = taxablePhp * TAX_RATE
    const taxDuePhp = Math.max(0, cumulativeTaxPhp - previousCumulativeTax)
    previousCumulativeTax = cumulativeTaxPhp

    const deadline = deadlineFor(taxYear, period)
    const filing = filings.find((f) => f.taxYear === taxYear && f.period === period) ?? null

    return {
      taxYear,
      period,
      form: formFor(period),
      periodStart: start,
      periodEnd: end,
      deadline,
      grossPhp,
      cumulativeGrossPhp,
      taxablePhp,
      cumulativeTaxPhp,
      taxDuePhp,
      status: statusFor(deadline, filing, today),
      filing,
    }
  })
}

/** Earliest overdue period, else earliest due_soon period, else null. */
export function nextActionablePeriod(summaries: readonly TaxPeriodSummary[]): TaxPeriodSummary | null {
  const overdue = summaries.find((s) => s.status === 'overdue')
  if (overdue !== undefined) return overdue
  return summaries.find((s) => s.status === 'due_soon') ?? null
}
