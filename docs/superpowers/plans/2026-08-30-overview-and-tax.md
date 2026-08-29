# Overview Dashboard and PH 8% Tax Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an Overview tab the landing page (total value across crypto, stocks, REITs, plus a tax deadline banner) and add a Tax tab where a purely self-employed PH taxpayer on the 8% flat rate logs PHP receipts, sees quarterly / annual tax due, and is notified before BIR deadlines.

**Architecture:** Pure math in `src/lib/tax.ts` and `src/lib/portfolioSummary.ts` (unit tested). Stock and REIT values come from Trading 212 positions (account currency) with quote x shares as the fallback, matching the rule the current `PortfolioSection` already applies. Tax records persist in Supabase Postgres, reached only through two Netlify Functions behind the existing session auth, using the service role key. Frontend keeps the existing pattern: Zustand store per domain, one hook per side effect, components read stores directly.

**Tech Stack:** React 19, TypeScript 6 strict, Vite 8, Tailwind v4, Zustand 5, Netlify Functions (esbuild), `@supabase/supabase-js` v2, Vitest.

Spec: `docs/superpowers/specs/2026-08-30-overview-and-tax-design.md`

## Global Constraints

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` are on. Never use `any`. Guard every `arr[i]`.
- Frontend imports use `@/`. Function code imports `src/` with relative paths and `.ts` extensions.
- Secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) are never prefixed `VITE_` and never read in `src/`.
- Every function handler: `OPTIONS` preflight first, then `requireAuth`, CORS headers via `utils/http.ts`, structured JSON errors.
- Tailwind v4 tokens only: `btc-orange`, `bull-green`, `bear-red`, `terminal-bg`, `panel-bg`, `panel-border`, `text-primary`, `text-muted`. Dark only. Monetary values use `font-mono`.
- Tax constants: `TAX_RATE = 0.08`, `TAX_ANNUAL_EXEMPTION_PHP = 250_000`, `TAX_DEADLINE_WARNING_DAYS = 30`, `TAX_NOTIFY_THRESHOLDS_DAYS = [30, 14, 7, 1]`.
- Dates are `YYYY-MM-DD` strings; compare lexically; build `Date` objects at UTC midnight.
- No em-dashes anywhere (code, comments, commits). No AI attribution in commits.
- Commit messages explain why. One purpose per commit.
- Run everything from the repo root: `/home/jed/jed/meridian`.

## Deviations from the spec (decided while planning)

- `GET /api/tax-entries` and `GET /api/tax-filings` return all rows; `year` is an optional filter. The client loads everything once so the deadline banner can see the previous year's annual return without a second load path.
- Mutations update the store from the returned row instead of reloading. Same result, one fewer request.
- Notifications fire once per visit at most: the smallest matching threshold is announced and every threshold at or above the current day count is marked as sent, so opening the app 5 days out gives one notification, not three.
- Year selector covers `currentYear - 3` through `currentYear`.

## File structure

```
vitest.config.ts                                 test runner config, @ alias
supabase/migrations/0001_tax.sql                 tables, RLS, index

src/constants.ts                                 + TAX_* constants
src/types/tax.ts                                 TaxIncomeEntry, TaxFiling, TaxPeriodSummary, inputs
src/lib/formatters.ts                            + formatPhp, formatIsoDate
src/lib/tax.ts                                   dates, deadlines, period summaries (pure)
src/lib/tax.test.ts
src/lib/taxNotifications.ts                      which threshold to announce (pure)
src/lib/taxNotifications.test.ts
src/lib/portfolioSummary.ts                      totals per asset class (pure)
src/lib/portfolioSummary.test.ts
src/lib/taxApi.ts                                fetch wrappers for /api/tax-*
src/store/taxStore.ts                            entries, filings, async actions
src/store/navigationStore.ts                     tabs: overview | crypto | stocks | reits | tax
src/hooks/useTaxData.ts                          load on mount
src/hooks/useTaxDeadlines.ts                     actionable period + browser notification
src/hooks/usePortfolioSummary.ts                 memoised summary from stores (incl. stockPositionsStore)
src/components/layout/TabBar.tsx                 new tab list
src/components/layout/Dashboard.tsx              new routing
src/components/ui/SkeletonBlock.tsx              loading placeholder
src/components/overview/OverviewSection.tsx
src/components/overview/PortfolioHero.tsx
src/components/overview/AssetClassCard.tsx
src/components/overview/AllocationBar.tsx
src/components/overview/TopHoldingsList.tsx
src/components/tax/TaxDeadlineBanner.tsx
src/components/tax/EnableNotificationsButton.tsx
src/components/tax/TaxSection.tsx
src/components/tax/TaxPeriodCard.tsx
src/components/tax/TaxEntryForm.tsx
src/components/tax/TaxEntryList.tsx
src/components/portfolio/PortfolioSection.tsx    DELETED

netlify/functions/utils/supabase-client.ts       createClient from env
netlify/functions/utils/tax-repo.ts              typed table access (thin, no unit tests)
netlify/functions/utils/tax-validation.ts        body parsing and validation (pure)
netlify/functions/utils/tax-validation.test.ts
netlify/functions/tax-entries.ts                 GET / POST / PUT / DELETE
netlify/functions/tax-entries.test.ts
netlify/functions/tax-filings.ts                 GET / PUT / DELETE
netlify/functions/tax-filings.test.ts

.env.example, README.md, CLAUDE.md               docs
```

---

### Task 1: Vitest tooling and PHP formatter

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json` (scripts, devDependencies)
- Modify: `tsconfig.node.json` (include vitest.config.ts)
- Modify: `src/lib/formatters.ts`
- Create: `src/lib/formatters.test.ts`

**Interfaces:**
- Produces: `formatPhp(value: number): string` (e.g. `₱4,000.00`), `formatIsoDate(iso: string): string` (e.g. `May 15, 2026`), `npm test`.

- [ ] **Step 1: Install vitest**

```bash
npm install --save-dev vitest
```

- [ ] **Step 2: Add config and script**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'netlify/functions/**/*.test.ts'],
  },
})
```

In `package.json` `scripts`, add `"test": "vitest run"` after `"typecheck"`.

In `tsconfig.node.json`, change `"include": ["netlify/functions", "vite.config.ts"]` to `"include": ["netlify/functions", "vite.config.ts", "vitest.config.ts"]`.

- [ ] **Step 3: Write the failing test**

Create `src/lib/formatters.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatIsoDate, formatPhp, lastValue } from '@/lib/formatters'

describe('formatPhp', () => {
  it('formats pesos with two decimals and grouping', () => {
    expect(formatPhp(4000)).toBe('₱4,000.00')
    expect(formatPhp(0)).toBe('₱0.00')
    expect(formatPhp(1234567.891)).toBe('₱1,234,567.89')
  })
})

describe('formatIsoDate', () => {
  it('renders an ISO date as a medium date without timezone drift', () => {
    expect(formatIsoDate('2026-05-15')).toBe('May 15, 2026')
    expect(formatIsoDate('2026-01-01')).toBe('Jan 1, 2026')
  })
})

describe('lastValue', () => {
  it('returns the last finite value', () => {
    expect(lastValue([1, NaN, 3, NaN])).toBe(3)
    expect(lastValue([])).toBeNull()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- src/lib/formatters.test.ts`
Expected: FAIL, `formatPhp` is not exported.

- [ ] **Step 5: Implement**

Append to `src/lib/formatters.ts`:

```ts
const phpFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatPhp(value: number): string {
  return phpFormatter.format(value)
}

const isoDateFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeZone: 'UTC',
})

/** Formats a YYYY-MM-DD string. Parsed as UTC so the day never shifts with the viewer's timezone. */
export function formatIsoDate(iso: string): string {
  return isoDateFormatter.format(new Date(`${iso}T00:00:00Z`))
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- src/lib/formatters.test.ts`
Expected: PASS (3 tests). If `formatPhp` yields `PHP 4,000.00` instead of `₱4,000.00` on this Node ICU, change the locale to `'en-US'` with `currencyDisplay: 'narrowSymbol'` and re-run.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add vitest.config.ts package.json package-lock.json tsconfig.node.json src/lib/formatters.ts src/lib/formatters.test.ts
git commit -m "Add Vitest and peso formatting

The tax module needs unit-tested date and money math, and the repo had
no test runner. Peso formatting lives next to the USD formatters so all
currency display stays in one place."
```

---

### Task 2: Tax constants, types, and pure tax math

**Files:**
- Modify: `src/constants.ts`
- Create: `src/types/tax.ts`
- Create: `src/lib/tax.ts`
- Create: `src/lib/tax.test.ts`

**Interfaces:**
- Produces (from `@/lib/tax`):
  - `TAX_PERIODS: readonly TaxPeriod[]` = `['Q1','Q2','Q3','ANNUAL']`
  - `isValidIsoDate(iso: string): boolean`
  - `todayIso(now?: Date): string` (local calendar date)
  - `addDays(iso: string, days: number): string`
  - `daysBetween(from: string, to: string): number` (to minus from)
  - `quarterOf(iso: string): 'Q1' | 'Q2' | 'Q3' | 'Q4'`
  - `periodRange(taxYear: number, period: TaxPeriod): { start: string; end: string }`
  - `deadlineFor(taxYear: number, period: TaxPeriod): string`
  - `formFor(period: TaxPeriod): '1701Q' | '1701A'`
  - `summarisePeriods(entries: TaxIncomeEntry[], filings: TaxFiling[], taxYear: number, today: string): TaxPeriodSummary[]`
  - `nextActionablePeriod(summaries: TaxPeriodSummary[]): TaxPeriodSummary | null`
  - `daysUntil(deadline: string, today: string): number`
- Produces (from `@/types/tax`): `TaxPeriod`, `TaxIncomeEntry`, `TaxIncomeEntryInput`, `TaxFiling`, `TaxFilingInput`, `TaxPeriodStatus`, `TaxPeriodSummary`.

- [ ] **Step 1: Add constants**

Append to `src/constants.ts`:

```ts
// PH income tax, 8% flat-rate option for a purely self-employed / professional
// taxpayer (non-VAT). The exemption is annual and applied cumulatively per 1701Q.
export const TAX_RATE = 0.08
export const TAX_ANNUAL_EXEMPTION_PHP = 250_000
export const TAX_DEADLINE_WARNING_DAYS = 30
export const TAX_NOTIFY_THRESHOLDS_DAYS = [30, 14, 7, 1] as const
```

- [ ] **Step 2: Add types**

Create `src/types/tax.ts`:

```ts
export type TaxPeriod = 'Q1' | 'Q2' | 'Q3' | 'ANNUAL'

export interface TaxIncomeEntry {
  id: string
  receivedOn: string      // YYYY-MM-DD
  source: string
  amountPhp: number
  note: string | null
  createdAt: string       // ISO timestamp
  updatedAt: string
}

export interface TaxIncomeEntryInput {
  receivedOn: string
  source: string
  amountPhp: number
  note: string | null
}

export interface TaxFiling {
  taxYear: number
  period: TaxPeriod
  filedOn: string         // YYYY-MM-DD
  amountPaidPhp: number
}

export type TaxFilingInput = TaxFiling

export type TaxPeriodStatus = 'upcoming' | 'due_soon' | 'overdue' | 'filed'

export interface TaxPeriodSummary {
  taxYear: number
  period: TaxPeriod
  form: '1701Q' | '1701A'
  periodStart: string
  periodEnd: string
  deadline: string        // after weekend rollover
  grossPhp: number        // receipts inside the period (full year for ANNUAL)
  cumulativeGrossPhp: number
  taxablePhp: number
  cumulativeTaxPhp: number
  taxDuePhp: number       // this period's payment after crediting earlier quarters
  status: TaxPeriodStatus
  filing: TaxFiling | null
}
```

- [ ] **Step 3: Write the failing tests**

Create `src/lib/tax.test.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- src/lib/tax.test.ts`
Expected: FAIL, module `@/lib/tax` not found.

- [ ] **Step 5: Implement `src/lib/tax.ts`**

```ts
import { TAX_ANNUAL_EXEMPTION_PHP, TAX_DEADLINE_WARNING_DAYS, TAX_RATE } from '@/constants'
import type {
  TaxFiling,
  TaxIncomeEntry,
  TaxPeriod,
  TaxPeriodStatus,
  TaxPeriodSummary,
} from '@/types/tax'

export const TAX_PERIODS: readonly TaxPeriod[] = ['Q1', 'Q2', 'Q3', 'ANNUAL']

const MS_PER_DAY = 86_400_000
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// All arithmetic runs on UTC midnight so a browser in UTC+8 and a function
// in UTC agree on which calendar day a string represents.
function parseIsoDate(iso: string): Date {
  const match = ISO_DATE_PATTERN.exec(iso)
  if (match === null) throw new Error(`Invalid ISO date: ${iso}`)
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

function toIsoDate(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`
}

export function isValidIsoDate(iso: string): boolean {
  if (!ISO_DATE_PATTERN.test(iso)) return false
  const parsed = parseIsoDate(iso)
  return !Number.isNaN(parsed.getTime()) && toIsoDate(parsed) === iso
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
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- src/lib/tax.test.ts`
Expected: PASS (all tests). If a deadline test fails, verify the weekday with `node -e "console.log(new Date(Date.UTC(2026,7,15)).getUTCDay())"` (should print 6) before changing the code.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add src/constants.ts src/types/tax.ts src/lib/tax.ts src/lib/tax.test.ts
git commit -m "Add PH 8% flat-rate tax math

Quarterly 1701Q payments are cumulative with credit for earlier
quarters, and BIR rolls weekend deadlines forward, so both rules live in
one pure module with tests rather than inside components."
```

---

### Task 3: Notification threshold selection (pure)

**Files:**
- Create: `src/lib/taxNotifications.ts`
- Create: `src/lib/taxNotifications.test.ts`

**Interfaces:**
- Consumes: `TaxPeriodSummary`, `daysUntil` from Task 2, `TAX_NOTIFY_THRESHOLDS_DAYS`.
- Produces:
  - `notificationKey(summary: TaxPeriodSummary, marker: number | 'overdue'): string` → `tax-notified:<year>:<period>:<marker>`
  - `planNotification(summary: TaxPeriodSummary, today: string, isMarked: (key: string) => boolean): { title: string; body: string; keysToMark: string[] } | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/taxNotifications.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/taxNotifications.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/taxNotifications.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/taxNotifications.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/lib/taxNotifications.ts src/lib/taxNotifications.test.ts
git commit -m "Decide tax deadline notifications without side effects

Threshold selection is pure so the hook only has to read and write
localStorage markers, and so opening the app late produces one notice
instead of one per missed threshold."
```

---

### Task 4: Portfolio summary math (pure)

**Files:**
- Create: `src/lib/portfolioSummary.ts`
- Create: `src/lib/portfolioSummary.test.ts`

**Interfaces:**
- Consumes: `CryptoHolding`, `StockHolding`, `StockQuote`, `StockPosition`, `StockAccountSummary` from `@/types/portfolio`; `SymbolPrice` from `@/store/priceStore`; `AccountBalance` from `@/types/account`.
- Produces:
  ```ts
  export type SummaryClass = 'crypto' | 'stock' | 'reit'
  export interface ClassSummary { value: number; currency: string; change24hUsd: number; change24hPercent: number | null; holdingCount: number; unpricedCount: number }
  export interface HoldingSummary { assetClass: SummaryClass; symbol: string; value: number; currency: string; changePercent: number | null }
  export interface PortfolioSummary {
    total: number; totalCurrency: string; isMixedCurrency: boolean
    change24hUsd: number; change24hPercent: number | null; asOf: number | null
    classes: Record<SummaryClass, ClassSummary>; topHoldings: HoldingSummary[]
  }
  export interface PortfolioSummaryInput {
    balance: AccountBalance | null; cryptoHoldings: CryptoHolding[]; prices: Record<string, SymbolPrice>
    stocks: StockHolding[]; quotes: Record<string, StockQuote>
    positions: Record<string, StockPosition>; account: StockAccountSummary | null; positionsFetchedAt: number | null
  }
  export function summarisePortfolio(input: PortfolioSummaryInput): PortfolioSummary
  export const TOP_HOLDINGS_LIMIT = 8
  ```
- Value rules (same as the current `PortfolioSection`): a stock or REIT is valued at its Trading 212 `currentValue` (account currency) when a position exists, else `quote.price * shares`, else counted as unpriced. Crypto is USD/USDT. `totalCurrency` is the Trading 212 currency when there is no crypto value, else `'USD'`, and `isMixedCurrency` is true when both crypto value and a non-USD Trading 212 account are present.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/portfolioSummary.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { summarisePortfolio, TOP_HOLDINGS_LIMIT, type PortfolioSummaryInput } from '@/lib/portfolioSummary'
import type { SymbolPrice } from '@/store/priceStore'
import type { CryptoHolding, StockAccountSummary, StockHolding, StockPosition, StockQuote } from '@/types/portfolio'

function crypto(asset: string, usdtValue: number): CryptoHolding {
  return { asset, symbol: asset === 'USDT' ? 'USDT' : `${asset}USDT`, free: 1, locked: 0, usdtValue }
}
function price(changePercent: number): SymbolPrice {
  return { price: 1, changePercent, high24h: 1, low24h: 1, volume24h: 1, lastTickAt: 1 }
}
function quote(ticker: string, p: number, changePercent: number, fetchedAt = 1_000): StockQuote {
  return { ticker, price: p, change: 0, changePercent, high: p, low: p, fetchedAt }
}
function position(ticker: string, currentValue: number): StockPosition {
  return {
    ticker, t212Ticker: `${ticker}_US_EQ`, name: ticker, quantity: 1, avgPrice: 1, currentPrice: 1,
    currency: 'USD', currentValue, totalCost: currentValue, unrealizedPnl: 0, fxImpact: 0, openedAt: 1,
  }
}
const gbpAccount: StockAccountSummary = {
  currency: 'GBP', totalValue: 0, cashAvailable: 0, cashInPies: 0, cashReserved: 0,
  invested: 0, investedCost: 0, unrealizedPnl: 0, realizedPnl: 0,
}
const empty: PortfolioSummaryInput = {
  balance: null, cryptoHoldings: [], prices: {}, stocks: [], quotes: {}, positions: {}, account: null, positionsFetchedAt: null,
}

describe('summarisePortfolio', () => {
  it('returns zeros for empty input', () => {
    const s = summarisePortfolio(empty)
    expect(s.total).toBe(0)
    expect(s.totalCurrency).toBe('USD')
    expect(s.isMixedCurrency).toBe(false)
    expect(s.change24hPercent).toBeNull()
    expect(s.asOf).toBeNull()
    expect(s.topHoldings).toEqual([])
    expect(s.classes.crypto.holdingCount).toBe(0)
  })

  it('totals each class, preferring Trading 212 values, and aggregates 24h change', () => {
    const holdings = [crypto('BTC', 1_000), crypto('USDT', 500)]
    const stocks: StockHolding[] = [
      { ticker: 'AAPL', assetClass: 'stock', shares: 10, source: 'trading212' },
      { ticker: 'O', assetClass: 'reit', shares: 4 },
      { ticker: 'MSFT', assetClass: 'stock' },
    ]
    const s = summarisePortfolio({
      ...empty,
      balance: { holdings, totalUsdtValue: 1_500, fetchedAt: 2_000 },
      cryptoHoldings: holdings,
      prices: { BTCUSDT: price(10) },
      stocks,
      quotes: { AAPL: quote('AAPL', 20, -5, 3_000), O: quote('O', 50, 2) },
      positions: { AAPL: position('AAPL', 250) },   // wins over 10 x 20
      account: { ...gbpAccount, currency: 'USD' },
      positionsFetchedAt: 4_000,
    })

    expect(s.classes.crypto.value).toBe(1_500)
    expect(s.classes.crypto.change24hUsd).toBeCloseTo(100)   // BTC 1000 x 10%, USDT has no price entry
    expect(s.classes.stock.value).toBe(250)
    expect(s.classes.stock.change24hUsd).toBeCloseTo(-12.5)  // quote change applied to the T212 value
    expect(s.classes.stock.holdingCount).toBe(2)
    expect(s.classes.stock.unpricedCount).toBe(1)
    expect(s.classes.reit.value).toBe(200)
    expect(s.classes.reit.change24hUsd).toBeCloseTo(4)

    expect(s.total).toBe(1_950)
    expect(s.totalCurrency).toBe('USD')
    expect(s.isMixedCurrency).toBe(false)
    expect(s.change24hUsd).toBeCloseTo(91.5)
    expect(s.change24hPercent).toBeCloseTo((91.5 / (1_950 - 91.5)) * 100)
    expect(s.asOf).toBe(4_000)
  })

  it('reports the Trading 212 currency and flags a mix with crypto', () => {
    const stocks: StockHolding[] = [{ ticker: 'VUSA', assetClass: 'stock', shares: 1, source: 'trading212' }]
    const onlyStocks = summarisePortfolio({
      ...empty, stocks, positions: { VUSA: position('VUSA', 300) }, account: gbpAccount,
    })
    expect(onlyStocks.totalCurrency).toBe('GBP')
    expect(onlyStocks.isMixedCurrency).toBe(false)
    expect(onlyStocks.classes.stock.currency).toBe('GBP')
    expect(onlyStocks.topHoldings[0]?.currency).toBe('GBP')

    const holdings = [crypto('BTC', 100)]
    const mixed = summarisePortfolio({
      ...empty, balance: { holdings, totalUsdtValue: 100, fetchedAt: 1 }, cryptoHoldings: holdings,
      stocks, positions: { VUSA: position('VUSA', 300) }, account: gbpAccount,
    })
    expect(mixed.totalCurrency).toBe('USD')
    expect(mixed.isMixedCurrency).toBe(true)
  })

  it('ranks top holdings across classes and truncates', () => {
    const holdings = Array.from({ length: 6 }, (_, i) => crypto(`C${i}`, 100 + i))
    const stocks: StockHolding[] = Array.from({ length: 6 }, (_, i) => ({ ticker: `S${i}`, assetClass: 'stock', shares: 1 }))
    const quotes = Object.fromEntries(stocks.map((st, i) => [st.ticker, quote(st.ticker, 200 + i, 0)]))
    const s = summarisePortfolio({
      ...empty, balance: { holdings, totalUsdtValue: 0, fetchedAt: 1 }, cryptoHoldings: holdings, stocks, quotes,
    })
    expect(s.topHoldings).toHaveLength(TOP_HOLDINGS_LIMIT)
    expect(s.topHoldings[0]?.symbol).toBe('S5')
    expect(s.topHoldings[0]?.assetClass).toBe('stock')
    expect(s.topHoldings[7]?.value).toBe(104)   // 200..205 fill indices 0-5, then 105, 104
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/portfolioSummary.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/portfolioSummary.ts`**

```ts
import type { AccountBalance } from '@/types/account'
import type { CryptoHolding, StockAccountSummary, StockHolding, StockPosition, StockQuote } from '@/types/portfolio'
import type { SymbolPrice } from '@/store/priceStore'

export const TOP_HOLDINGS_LIMIT = 8

export type SummaryClass = 'crypto' | 'stock' | 'reit'

export interface ClassSummary {
  value: number
  currency: string
  change24hUsd: number        // in the class currency; named for parity with crypto
  change24hPercent: number | null
  holdingCount: number
  unpricedCount: number       // no Trading 212 position and no (quote x shares)
}

export interface HoldingSummary {
  assetClass: SummaryClass
  symbol: string
  value: number
  currency: string
  changePercent: number | null
}

export interface PortfolioSummary {
  total: number
  totalCurrency: string
  isMixedCurrency: boolean
  change24hUsd: number
  change24hPercent: number | null
  asOf: number | null
  classes: Record<SummaryClass, ClassSummary>
  topHoldings: HoldingSummary[]
}

export interface PortfolioSummaryInput {
  balance: AccountBalance | null
  cryptoHoldings: CryptoHolding[]
  prices: Record<string, SymbolPrice>
  stocks: StockHolding[]
  quotes: Record<string, StockQuote>
  positions: Record<string, StockPosition>
  account: StockAccountSummary | null
  positionsFetchedAt: number | null
}

const USD = 'USD'

function percentChange(value: number, change: number): number | null {
  const previous = value - change
  if (previous <= 0) return null
  return (change / previous) * 100
}

function emptyClass(currency: string): ClassSummary {
  return { value: 0, currency, change24hUsd: 0, change24hPercent: null, holdingCount: 0, unpricedCount: 0 }
}

function summariseCrypto(input: PortfolioSummaryInput): { summary: ClassSummary; holdings: HoldingSummary[] } {
  const summary = emptyClass(USD)
  const holdings: HoldingSummary[] = []

  for (const h of input.cryptoHoldings) {
    const value = h.usdtValue ?? 0
    const changePercent = input.prices[h.symbol]?.changePercent ?? null
    summary.holdingCount += 1
    summary.change24hUsd += changePercent === null ? 0 : (value * changePercent) / 100
    holdings.push({ assetClass: 'crypto', symbol: h.asset, value, currency: USD, changePercent })
  }

  // The balance endpoint already sums holdings; prefer it so the hero matches the Crypto tab.
  summary.value = input.balance?.totalUsdtValue ?? holdings.reduce((sum, h) => sum + h.value, 0)
  summary.change24hPercent = percentChange(summary.value, summary.change24hUsd)
  return { summary, holdings }
}

// Trading 212 reports value in the account currency; quote x shares is the
// fallback for watchlist tickers with a manual share count.
function equityValue(h: StockHolding, input: PortfolioSummaryInput): number | null {
  const p = input.positions[h.ticker]
  if (p !== undefined) return p.currentValue
  const q = input.quotes[h.ticker]
  if (q === undefined || h.shares === undefined || h.shares <= 0) return null
  return q.price * h.shares
}

function summariseEquities(
  input: PortfolioSummaryInput,
  assetClass: 'stock' | 'reit',
  currency: string,
): { summary: ClassSummary; holdings: HoldingSummary[] } {
  const summary = emptyClass(currency)
  const holdings: HoldingSummary[] = []

  for (const s of input.stocks) {
    if (s.assetClass !== assetClass) continue
    summary.holdingCount += 1
    const value = equityValue(s, input)
    if (value === null) {
      summary.unpricedCount += 1
      continue
    }
    const changePercent = input.quotes[s.ticker]?.changePercent ?? null
    summary.value += value
    summary.change24hUsd += changePercent === null ? 0 : (value * changePercent) / 100
    holdings.push({ assetClass, symbol: s.ticker, value, currency, changePercent })
  }

  summary.change24hPercent = percentChange(summary.value, summary.change24hUsd)
  return { summary, holdings }
}

function latestTimestamp(input: PortfolioSummaryInput): number | null {
  let latest: number | null = input.balance?.fetchedAt ?? null
  const consider = (ts: number | null) => {
    if (ts !== null && (latest === null || ts > latest)) latest = ts
  }
  for (const q of Object.values(input.quotes)) consider(q.fetchedAt)
  consider(input.positionsFetchedAt)
  return latest
}

export function summarisePortfolio(input: PortfolioSummaryInput): PortfolioSummary {
  const stockCurrency = input.account?.currency ?? USD
  const crypto = summariseCrypto(input)
  const stock = summariseEquities(input, 'stock', stockCurrency)
  const reit = summariseEquities(input, 'reit', stockCurrency)

  const total = crypto.summary.value + stock.summary.value + reit.summary.value
  const change24hUsd = crypto.summary.change24hUsd + stock.summary.change24hUsd + reit.summary.change24hUsd

  // With no crypto the total is purely in the Trading 212 currency; otherwise
  // it is a USD-labelled mix and the UI shows a note.
  const totalCurrency = crypto.summary.value === 0 ? stockCurrency : USD
  const isMixedCurrency = crypto.summary.value > 0 && input.account !== null && stockCurrency !== USD

  const topHoldings = [...crypto.holdings, ...stock.holdings, ...reit.holdings]
    .filter((h) => h.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_HOLDINGS_LIMIT)

  return {
    total,
    totalCurrency,
    isMixedCurrency,
    change24hUsd,
    change24hPercent: percentChange(total, change24hUsd),
    asOf: latestTimestamp(input),
    classes: { crypto: crypto.summary, stock: stock.summary, reit: reit.summary },
    topHoldings,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/portfolioSummary.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
npm run typecheck
git add src/lib/portfolioSummary.ts src/lib/portfolioSummary.test.ts
git commit -m "Compute cross-class portfolio totals in one pure module

The Overview needs the same numbers in a hero, three cards, a bar, and
a ranked list; deriving them once keeps those views consistent and keeps
the Trading 212 value-over-quote rule in a single place."
```

---

### Task 5: Supabase migration, client, repository, and validation

**Files:**
- Create: `supabase/migrations/0001_tax.sql`
- Create: `netlify/functions/utils/supabase-client.ts`
- Create: `netlify/functions/utils/tax-repo.ts`
- Create: `netlify/functions/utils/tax-validation.ts`
- Create: `netlify/functions/utils/tax-validation.test.ts`
- Create: `.env.example`
- Modify: `package.json` (dependency)

**Interfaces:**
- Consumes: `TaxIncomeEntry`, `TaxIncomeEntryInput`, `TaxFiling`, `TaxPeriod` from `src/types/tax.ts`; `isValidIsoDate` from `src/lib/tax.ts`.
- Produces (`utils/tax-repo.ts`):
  ```ts
  export class SupabaseRepoError extends Error { constructor(message: string) }
  export function listEntries(year: number | null): Promise<TaxIncomeEntry[]>
  export function insertEntry(input: TaxIncomeEntryInput): Promise<TaxIncomeEntry>
  export function updateEntry(id: string, input: TaxIncomeEntryInput): Promise<TaxIncomeEntry | null>   // null when id not found
  export function deleteEntry(id: string): Promise<boolean>                                              // false when id not found
  export function listFilings(year: number | null): Promise<TaxFiling[]>
  export function upsertFiling(input: TaxFiling): Promise<TaxFiling>
  export function deleteFiling(taxYear: number, period: TaxPeriod): Promise<boolean>
  ```
- Produces (`utils/tax-validation.ts`):
  ```ts
  export type Validation<T> = { ok: true; value: T } | { ok: false; error: string }
  export function parseEntryInput(body: unknown): Validation<TaxIncomeEntryInput>
  export function parseFilingInput(body: unknown): Validation<TaxFiling>
  export function parseYearParam(raw: string | undefined): Validation<number | null>   // undefined → null (no filter)
  export function parsePeriodParam(raw: string | undefined): Validation<TaxPeriod>
  export function parseUuidParam(raw: string | undefined): Validation<string>
  export function parseJsonBody(body: string | null): Validation<unknown>
  ```

- [ ] **Step 1: Install supabase-js**

```bash
npm install @supabase/supabase-js
```

- [ ] **Step 2: Write the migration**

Create `supabase/migrations/0001_tax.sql`:

```sql
-- Tax records for the PH 8% flat-rate module. Applied once via the Supabase
-- SQL editor. Access is server-side only (service role), so RLS is enabled
-- with no policies to lock out the anon and authenticated roles.

create table public.tax_income_entries (
  id uuid primary key default gen_random_uuid(),
  received_on date not null,
  source text not null check (char_length(source) between 1 and 120),
  amount_php numeric(14,2) not null check (amount_php >= 0),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index tax_income_entries_received_on_idx
  on public.tax_income_entries (received_on desc);

create table public.tax_filings (
  tax_year integer not null check (tax_year between 2000 and 2100),
  period text not null check (period in ('Q1', 'Q2', 'Q3', 'ANNUAL')),
  filed_on date not null,
  amount_paid_php numeric(14,2) not null check (amount_paid_php >= 0),
  created_at timestamptz not null default now(),
  primary key (tax_year, period)
);

alter table public.tax_income_entries enable row level security;
alter table public.tax_filings enable row level security;
```

- [ ] **Step 3: Write `.env.example`**

```bash
# Binance (Read Info only)
BINANCE_API_KEY=
BINANCE_API_SECRET=

# Finnhub
FINNHUB_API_KEY=

# Trading 212 (read scopes only)
TRADING212_API_KEY=
TRADING212_API_SECRET=
TRADING212_ENV=live

# Anthropic (chat assistant)
ANTHROPIC_API_KEY=

# Dashboard auth: "salt:hex" scrypt hash and a random session secret
AUTH_PASSWORD_HASH=
AUTH_SESSION_SECRET=

# Supabase (tax records). Service role key: server-side only, never VITE_.
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Check the existing function code for any other `process.env[...]` names and add them: `grep -rhoE "process\.env\[['\"][A-Z_]+['\"]\]" netlify/functions | sort -u`.

- [ ] **Step 4: Write `netlify/functions/utils/supabase-client.ts`**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export interface TaxEntryRow {
  id: string
  received_on: string
  source: string
  amount_php: number | string   // numeric columns arrive as strings
  note: string | null
  created_at: string
  updated_at: string
}

export interface TaxEntryInsert {
  received_on: string
  source: string
  amount_php: number
  note: string | null
}

export interface TaxFilingRow {
  tax_year: number
  period: string
  filed_on: string
  amount_paid_php: number | string
  created_at: string
}

export interface TaxFilingInsert {
  tax_year: number
  period: string
  filed_on: string
  amount_paid_php: number
}

// Hand-written schema type so queries are typed without generating types.
export interface Database {
  public: {
    Tables: {
      tax_income_entries: {
        Row: TaxEntryRow
        Insert: TaxEntryInsert
        Update: Partial<TaxEntryInsert> & { updated_at?: string }
        Relationships: []
      }
      tax_filings: {
        Row: TaxFilingRow
        Insert: TaxFilingInsert
        Update: Partial<TaxFilingInsert>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

export function getSupabase(): SupabaseClient<Database> {
  const url = process.env['SUPABASE_URL']
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY']
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

If `tsc` rejects the `Database` shape, open `node_modules/@supabase/supabase-js/dist/module/lib/types.d.ts` (or `@supabase/postgrest-js` `types.d.ts`) and match the `GenericSchema` shape it expects; do not fall back to `any`.

- [ ] **Step 5: Write `netlify/functions/utils/tax-repo.ts`**

```ts
import { getSupabase, type TaxEntryRow, type TaxFilingRow } from './supabase-client.ts'
import type { TaxFiling, TaxIncomeEntry, TaxIncomeEntryInput, TaxPeriod } from '../../../src/types/tax.ts'

export class SupabaseRepoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupabaseRepoError'
  }
}

function toEntry(row: TaxEntryRow): TaxIncomeEntry {
  return {
    id: row.id,
    receivedOn: row.received_on,
    source: row.source,
    amountPhp: Number(row.amount_php),
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toFiling(row: TaxFilingRow): TaxFiling {
  return {
    taxYear: row.tax_year,
    period: row.period as TaxPeriod,   // constrained by the DB check
    filedOn: row.filed_on,
    amountPaidPhp: Number(row.amount_paid_php),
  }
}

function fail(context: string, error: { message: string }): never {
  console.error(`[tax-repo] ${context}:`, error.message)
  throw new SupabaseRepoError(error.message)
}

export async function listEntries(year: number | null): Promise<TaxIncomeEntry[]> {
  let query = getSupabase()
    .from('tax_income_entries')
    .select('*')
    .order('received_on', { ascending: false })
    .order('created_at', { ascending: false })
  if (year !== null) {
    query = query.gte('received_on', `${year}-01-01`).lte('received_on', `${year}-12-31`)
  }
  const { data, error } = await query
  if (error) fail('listEntries', error)
  return (data ?? []).map(toEntry)
}

export async function insertEntry(input: TaxIncomeEntryInput): Promise<TaxIncomeEntry> {
  const { data, error } = await getSupabase()
    .from('tax_income_entries')
    .insert({
      received_on: input.receivedOn,
      source: input.source,
      amount_php: input.amountPhp,
      note: input.note,
    })
    .select('*')
    .single()
  if (error) fail('insertEntry', error)
  return toEntry(data)
}

export async function updateEntry(id: string, input: TaxIncomeEntryInput): Promise<TaxIncomeEntry | null> {
  const { data, error } = await getSupabase()
    .from('tax_income_entries')
    .update({
      received_on: input.receivedOn,
      source: input.source,
      amount_php: input.amountPhp,
      note: input.note,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) fail('updateEntry', error)
  return data === null ? null : toEntry(data)
}

export async function deleteEntry(id: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from('tax_income_entries')
    .delete()
    .eq('id', id)
    .select('id')
  if (error) fail('deleteEntry', error)
  return (data ?? []).length > 0
}

export async function listFilings(year: number | null): Promise<TaxFiling[]> {
  let query = getSupabase()
    .from('tax_filings')
    .select('*')
    .order('tax_year', { ascending: false })
  if (year !== null) query = query.eq('tax_year', year)
  const { data, error } = await query
  if (error) fail('listFilings', error)
  return (data ?? []).map(toFiling)
}

export async function upsertFiling(input: TaxFiling): Promise<TaxFiling> {
  const { data, error } = await getSupabase()
    .from('tax_filings')
    .upsert(
      {
        tax_year: input.taxYear,
        period: input.period,
        filed_on: input.filedOn,
        amount_paid_php: input.amountPaidPhp,
      },
      { onConflict: 'tax_year,period' },
    )
    .select('*')
    .single()
  if (error) fail('upsertFiling', error)
  return toFiling(data)
}

export async function deleteFiling(taxYear: number, period: TaxPeriod): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from('tax_filings')
    .delete()
    .eq('tax_year', taxYear)
    .eq('period', period)
    .select('tax_year')
  if (error) fail('deleteFiling', error)
  return (data ?? []).length > 0
}
```

- [ ] **Step 6: Write the failing validation tests**

Create `netlify/functions/utils/tax-validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  parseEntryInput,
  parseFilingInput,
  parseJsonBody,
  parsePeriodParam,
  parseUuidParam,
  parseYearParam,
} from './tax-validation.ts'

const validEntry = { receivedOn: '2026-03-05', source: 'Acme', amountPhp: 1500.5, note: null }

describe('parseEntryInput', () => {
  it('accepts a valid body and trims strings', () => {
    const result = parseEntryInput({ ...validEntry, source: '  Acme  ', note: ' paid late ' })
    expect(result).toEqual({ ok: true, value: { ...validEntry, source: 'Acme', note: 'paid late' } })
  })

  it('treats a missing or empty note as null', () => {
    const { note: _omit, ...withoutNote } = validEntry
    expect(parseEntryInput(withoutNote)).toEqual({ ok: true, value: validEntry })
    expect(parseEntryInput({ ...validEntry, note: '   ' })).toEqual({ ok: true, value: validEntry })
  })

  it.each([
    [{ ...validEntry, receivedOn: '2026-02-30' }, 'receivedOn must be a valid YYYY-MM-DD date'],
    [{ ...validEntry, receivedOn: '5 March' }, 'receivedOn must be a valid YYYY-MM-DD date'],
    [{ ...validEntry, source: '' }, 'source is required'],
    [{ ...validEntry, source: 'x'.repeat(121) }, 'source must be 120 characters or fewer'],
    [{ ...validEntry, amountPhp: -1 }, 'amountPhp must be a number between 0 and 1e12'],
    [{ ...validEntry, amountPhp: '100' }, 'amountPhp must be a number between 0 and 1e12'],
    [{ ...validEntry, amountPhp: Number.NaN }, 'amountPhp must be a number between 0 and 1e12'],
    [{ ...validEntry, note: 'n'.repeat(501) }, 'note must be 500 characters or fewer'],
    [null, 'body must be a JSON object'],
    ['str', 'body must be a JSON object'],
  ])('rejects %j', (body, error) => {
    expect(parseEntryInput(body)).toEqual({ ok: false, error })
  })
})

describe('parseFilingInput', () => {
  const valid = { taxYear: 2026, period: 'Q1', filedOn: '2026-05-10', amountPaidPhp: 4000 }

  it('accepts a valid body', () => {
    expect(parseFilingInput(valid)).toEqual({ ok: true, value: valid })
  })

  it.each([
    [{ ...valid, taxYear: 1999 }, 'taxYear must be an integer between 2000 and 2100'],
    [{ ...valid, taxYear: 2026.5 }, 'taxYear must be an integer between 2000 and 2100'],
    [{ ...valid, period: 'Q4' }, 'period must be one of Q1, Q2, Q3, ANNUAL'],
    [{ ...valid, filedOn: '2026-13-01' }, 'filedOn must be a valid YYYY-MM-DD date'],
    [{ ...valid, amountPaidPhp: -5 }, 'amountPaidPhp must be a number between 0 and 1e12'],
  ])('rejects %j', (body, error) => {
    expect(parseFilingInput(body)).toEqual({ ok: false, error })
  })
})

describe('query param parsers', () => {
  it('parses year, allowing absence', () => {
    expect(parseYearParam(undefined)).toEqual({ ok: true, value: null })
    expect(parseYearParam('2026')).toEqual({ ok: true, value: 2026 })
    expect(parseYearParam('26')).toEqual({ ok: false, error: 'year must be a four-digit year between 2000 and 2100' })
    expect(parseYearParam('2101')).toEqual({ ok: false, error: 'year must be a four-digit year between 2000 and 2100' })
  })

  it('parses period', () => {
    expect(parsePeriodParam('ANNUAL')).toEqual({ ok: true, value: 'ANNUAL' })
    expect(parsePeriodParam('q1')).toEqual({ ok: false, error: 'period must be one of Q1, Q2, Q3, ANNUAL' })
    expect(parsePeriodParam(undefined)).toEqual({ ok: false, error: 'period must be one of Q1, Q2, Q3, ANNUAL' })
  })

  it('parses uuid', () => {
    expect(parseUuidParam('6f1c2a3e-4b5d-4c6e-8f7a-9b0c1d2e3f4a')).toEqual({ ok: true, value: '6f1c2a3e-4b5d-4c6e-8f7a-9b0c1d2e3f4a' })
    expect(parseUuidParam('123')).toEqual({ ok: false, error: 'id must be a UUID' })
    expect(parseUuidParam(undefined)).toEqual({ ok: false, error: 'id must be a UUID' })
  })

  it('parses JSON bodies', () => {
    expect(parseJsonBody('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
    expect(parseJsonBody('{oops')).toEqual({ ok: false, error: 'body must be valid JSON' })
    expect(parseJsonBody(null)).toEqual({ ok: false, error: 'body must be valid JSON' })
  })
})
```

- [ ] **Step 7: Run tests to verify they fail**

Run: `npm test -- netlify/functions/utils/tax-validation.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 8: Implement `netlify/functions/utils/tax-validation.ts`**

```ts
import { isValidIsoDate } from '../../../src/lib/tax.ts'
import type { TaxFiling, TaxIncomeEntryInput, TaxPeriod } from '../../../src/types/tax.ts'

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

const PERIODS: readonly TaxPeriod[] = ['Q1', 'Q2', 'Q3', 'ANNUAL']
const PERIOD_ERROR = 'period must be one of Q1, Q2, Q3, ANNUAL'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_AMOUNT = 1e12
const MAX_SOURCE_LENGTH = 120
const MAX_NOTE_LENGTH = 500

function invalid<T>(error: string): Validation<T> {
  return { ok: false, error }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT
}

function isTaxYear(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 2000 && value <= 2100
}

function isPeriod(value: unknown): value is TaxPeriod {
  return typeof value === 'string' && (PERIODS as readonly string[]).includes(value)
}

export function parseJsonBody(body: string | null): Validation<unknown> {
  if (body === null) return invalid('body must be valid JSON')
  try {
    return { ok: true, value: JSON.parse(body) as unknown }
  } catch {
    return invalid('body must be valid JSON')
  }
}

export function parseEntryInput(body: unknown): Validation<TaxIncomeEntryInput> {
  if (!isRecord(body)) return invalid('body must be a JSON object')

  const receivedOn = body['receivedOn']
  if (typeof receivedOn !== 'string' || !isValidIsoDate(receivedOn)) {
    return invalid('receivedOn must be a valid YYYY-MM-DD date')
  }

  const rawSource = body['source']
  const source = typeof rawSource === 'string' ? rawSource.trim() : ''
  if (source.length === 0) return invalid('source is required')
  if (source.length > MAX_SOURCE_LENGTH) return invalid(`source must be ${MAX_SOURCE_LENGTH} characters or fewer`)

  const amountPhp = body['amountPhp']
  if (!isAmount(amountPhp)) return invalid(`amountPhp must be a number between 0 and 1e12`)

  const rawNote = body['note']
  let note: string | null = null
  if (typeof rawNote === 'string') {
    const trimmed = rawNote.trim()
    if (trimmed.length > MAX_NOTE_LENGTH) return invalid(`note must be ${MAX_NOTE_LENGTH} characters or fewer`)
    note = trimmed.length === 0 ? null : trimmed
  } else if (rawNote !== undefined && rawNote !== null) {
    return invalid(`note must be ${MAX_NOTE_LENGTH} characters or fewer`)
  }

  return { ok: true, value: { receivedOn, source, amountPhp, note } }
}

export function parseFilingInput(body: unknown): Validation<TaxFiling> {
  if (!isRecord(body)) return invalid('body must be a JSON object')

  const taxYear = body['taxYear']
  if (!isTaxYear(taxYear)) return invalid('taxYear must be an integer between 2000 and 2100')

  const period = body['period']
  if (!isPeriod(period)) return invalid(PERIOD_ERROR)

  const filedOn = body['filedOn']
  if (typeof filedOn !== 'string' || !isValidIsoDate(filedOn)) {
    return invalid('filedOn must be a valid YYYY-MM-DD date')
  }

  const amountPaidPhp = body['amountPaidPhp']
  if (!isAmount(amountPaidPhp)) return invalid('amountPaidPhp must be a number between 0 and 1e12')

  return { ok: true, value: { taxYear, period, filedOn, amountPaidPhp } }
}

export function parseYearParam(raw: string | undefined): Validation<number | null> {
  if (raw === undefined) return { ok: true, value: null }
  if (!/^\d{4}$/.test(raw)) return invalid('year must be a four-digit year between 2000 and 2100')
  const year = Number(raw)
  if (!isTaxYear(year)) return invalid('year must be a four-digit year between 2000 and 2100')
  return { ok: true, value: year }
}

export function parsePeriodParam(raw: string | undefined): Validation<TaxPeriod> {
  return isPeriod(raw) ? { ok: true, value: raw } : invalid(PERIOD_ERROR)
}

export function parseUuidParam(raw: string | undefined): Validation<string> {
  if (raw === undefined || !UUID_PATTERN.test(raw)) return invalid('id must be a UUID')
  return { ok: true, value: raw }
}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test -- netlify/functions/utils/tax-validation.test.ts`
Expected: PASS.

- [ ] **Step 10: Typecheck and commit**

```bash
npm run typecheck
git add supabase/migrations/0001_tax.sql netlify/functions/utils/supabase-client.ts netlify/functions/utils/tax-repo.ts netlify/functions/utils/tax-validation.ts netlify/functions/utils/tax-validation.test.ts .env.example package.json package-lock.json
git commit -m "Add Supabase schema and server-side access for tax records

Tax records need to outlive a browser profile, which localStorage cannot
offer. The service role key stays in functions, RLS has no policies, and
validation is a pure module so handler tests can mock the repo."
```

---

### Task 6: `tax-entries` function

**Files:**
- Create: `netlify/functions/tax-entries.ts`
- Create: `netlify/functions/tax-entries.test.ts`

**Interfaces:**
- Consumes: `tax-repo.ts` (`listEntries`, `insertEntry`, `updateEntry`, `deleteEntry`, `SupabaseRepoError`), `tax-validation.ts`, `utils/http.ts` (`preflight`, `ok`, `badRequest`, `methodNotAllowed`, `badGateway`, `internalError`, `STATUS`), `utils/auth.ts` (`requireAuth`).
- Produces HTTP contract:
  - `GET /api/tax-entries[?year=YYYY]` → `200 { entries: TaxIncomeEntry[] }`
  - `POST /api/tax-entries` body `TaxIncomeEntryInput` → `201 { entry }`
  - `PUT /api/tax-entries?id=<uuid>` body `TaxIncomeEntryInput` → `200 { entry }`, `404 { error: 'not_found' }`
  - `DELETE /api/tax-entries?id=<uuid>` → `204`, `404 { error: 'not_found' }`
  - `400 { error }` on validation, `401` without session, `405` other methods, `502 { error: 'supabase_error', msg }`.

- [ ] **Step 1: Add `created` and `notFound` helpers to `utils/http.ts`**

In `netlify/functions/utils/http.ts`, add `CREATED: 201` and `NOT_FOUND: 404` to `STATUS`, and add after `ok`:

```ts
export function created(body: unknown): HandlerResponse {
  return { statusCode: STATUS.CREATED, headers: corsHeaders(), body: JSON.stringify(body) }
}

export function noContent(): HandlerResponse {
  return { statusCode: STATUS.NO_CONTENT, headers: corsHeaders(), body: '' }
}

export function notFound(error = 'not_found'): HandlerResponse {
  return { statusCode: STATUS.NOT_FOUND, headers: corsHeaders(), body: JSON.stringify({ error }) }
}
```

- [ ] **Step 2: Write the failing tests**

Create `netlify/functions/tax-entries.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HandlerEvent } from '@netlify/functions'
import type { TaxIncomeEntry } from '../../src/types/tax.ts'

vi.mock('./utils/auth.ts', () => ({
  requireAuth: vi.fn(() => null),
}))

vi.mock('./utils/tax-repo.ts', () => {
  class SupabaseRepoError extends Error {}
  return {
    SupabaseRepoError,
    listEntries: vi.fn(),
    insertEntry: vi.fn(),
    updateEntry: vi.fn(),
    deleteEntry: vi.fn(),
  }
})

import { requireAuth } from './utils/auth.ts'
import * as repo from './utils/tax-repo.ts'
import { handler } from './tax-entries.ts'

const entry: TaxIncomeEntry = {
  id: '6f1c2a3e-4b5d-4c6e-8f7a-9b0c1d2e3f4a',
  receivedOn: '2026-03-05',
  source: 'Acme',
  amountPhp: 1500.5,
  note: null,
  createdAt: '2026-03-05T00:00:00Z',
  updatedAt: '2026-03-05T00:00:00Z',
}

function makeEvent(overrides: Partial<HandlerEvent>): HandlerEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: {},
    body: null,
    ...overrides,
  } as unknown as HandlerEvent
}

async function call(overrides: Partial<HandlerEvent>) {
  const res = await handler(makeEvent(overrides), {} as never)
  if (res === undefined) throw new Error('handler returned nothing')
  return { status: res.statusCode, body: res.body ? (JSON.parse(res.body) as unknown) : null }
}

beforeEach(() => {
  vi.mocked(requireAuth).mockReturnValue(null)
  vi.mocked(repo.listEntries).mockReset()
  vi.mocked(repo.insertEntry).mockReset()
  vi.mocked(repo.updateEntry).mockReset()
  vi.mocked(repo.deleteEntry).mockReset()
})

describe('tax-entries handler', () => {
  it('answers preflight', async () => {
    expect((await call({ httpMethod: 'OPTIONS' })).status).toBe(204)
  })

  it('rejects unauthenticated requests', async () => {
    vi.mocked(requireAuth).mockReturnValue({ statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) })
    expect((await call({ httpMethod: 'GET' })).status).toBe(401)
  })

  it('rejects unsupported methods', async () => {
    expect((await call({ httpMethod: 'PATCH' })).status).toBe(405)
  })

  it('lists entries, optionally by year', async () => {
    vi.mocked(repo.listEntries).mockResolvedValue([entry])
    const all = await call({ httpMethod: 'GET' })
    expect(all.status).toBe(200)
    expect(all.body).toEqual({ entries: [entry] })
    expect(repo.listEntries).toHaveBeenLastCalledWith(null)

    await call({ httpMethod: 'GET', queryStringParameters: { year: '2026' } })
    expect(repo.listEntries).toHaveBeenLastCalledWith(2026)

    const bad = await call({ httpMethod: 'GET', queryStringParameters: { year: 'abc' } })
    expect(bad.status).toBe(400)
  })

  it('creates an entry', async () => {
    vi.mocked(repo.insertEntry).mockResolvedValue(entry)
    const res = await call({
      httpMethod: 'POST',
      body: JSON.stringify({ receivedOn: '2026-03-05', source: 'Acme', amountPhp: 1500.5 }),
    })
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ entry })
    expect(repo.insertEntry).toHaveBeenCalledWith({ receivedOn: '2026-03-05', source: 'Acme', amountPhp: 1500.5, note: null })
  })

  it('rejects an invalid create body with the validation message', async () => {
    const res = await call({ httpMethod: 'POST', body: JSON.stringify({ receivedOn: 'nope', source: 'Acme', amountPhp: 1 }) })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'receivedOn must be a valid YYYY-MM-DD date' })
    expect(repo.insertEntry).not.toHaveBeenCalled()
  })

  it('updates an entry and reports missing ids', async () => {
    vi.mocked(repo.updateEntry).mockResolvedValue(entry)
    const ok = await call({
      httpMethod: 'PUT',
      queryStringParameters: { id: entry.id },
      body: JSON.stringify({ receivedOn: '2026-03-05', source: 'Acme', amountPhp: 1500.5 }),
    })
    expect(ok.status).toBe(200)
    expect(ok.body).toEqual({ entry })

    vi.mocked(repo.updateEntry).mockResolvedValue(null)
    const missing = await call({
      httpMethod: 'PUT',
      queryStringParameters: { id: entry.id },
      body: JSON.stringify({ receivedOn: '2026-03-05', source: 'Acme', amountPhp: 1 }),
    })
    expect(missing.status).toBe(404)

    const badId = await call({ httpMethod: 'PUT', queryStringParameters: { id: '1' }, body: '{}' })
    expect(badId.status).toBe(400)
  })

  it('deletes an entry', async () => {
    vi.mocked(repo.deleteEntry).mockResolvedValue(true)
    expect((await call({ httpMethod: 'DELETE', queryStringParameters: { id: entry.id } })).status).toBe(204)

    vi.mocked(repo.deleteEntry).mockResolvedValue(false)
    expect((await call({ httpMethod: 'DELETE', queryStringParameters: { id: entry.id } })).status).toBe(404)
  })

  it('maps repository failures to 502', async () => {
    vi.mocked(repo.listEntries).mockRejectedValue(new repo.SupabaseRepoError('connection refused'))
    const res = await call({ httpMethod: 'GET' })
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'supabase_error', msg: 'connection refused' })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- netlify/functions/tax-entries.test.ts`
Expected: FAIL, `./tax-entries.ts` not found.

- [ ] **Step 4: Implement `netlify/functions/tax-entries.ts`**

```ts
import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { requireAuth } from './utils/auth.ts'
import {
  badGateway,
  badRequest,
  created,
  internalError,
  methodNotAllowed,
  noContent,
  notFound,
  ok,
  preflight,
} from './utils/http.ts'
import { deleteEntry, insertEntry, listEntries, SupabaseRepoError, updateEntry } from './utils/tax-repo.ts'
import { parseEntryInput, parseJsonBody, parseUuidParam, parseYearParam } from './utils/tax-validation.ts'

async function handleGet(event: HandlerEvent): Promise<HandlerResponse> {
  const year = parseYearParam(event.queryStringParameters?.['year'])
  if (!year.ok) return badRequest(year.error)
  const entries = await listEntries(year.value)
  return ok({ entries })
}

async function handlePost(event: HandlerEvent): Promise<HandlerResponse> {
  const json = parseJsonBody(event.body)
  if (!json.ok) return badRequest(json.error)
  const input = parseEntryInput(json.value)
  if (!input.ok) return badRequest(input.error)
  const entry = await insertEntry(input.value)
  return created({ entry })
}

async function handlePut(event: HandlerEvent): Promise<HandlerResponse> {
  const id = parseUuidParam(event.queryStringParameters?.['id'])
  if (!id.ok) return badRequest(id.error)
  const json = parseJsonBody(event.body)
  if (!json.ok) return badRequest(json.error)
  const input = parseEntryInput(json.value)
  if (!input.ok) return badRequest(input.error)
  const entry = await updateEntry(id.value, input.value)
  if (entry === null) return notFound()
  return ok({ entry })
}

async function handleDelete(event: HandlerEvent): Promise<HandlerResponse> {
  const id = parseUuidParam(event.queryStringParameters?.['id'])
  if (!id.ok) return badRequest(id.error)
  const removed = await deleteEntry(id.value)
  return removed ? noContent() : notFound()
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  try {
    switch (event.httpMethod) {
      case 'GET':    return await handleGet(event)
      case 'POST':   return await handlePost(event)
      case 'PUT':    return await handlePut(event)
      case 'DELETE': return await handleDelete(event)
      default:       return methodNotAllowed()
    }
  } catch (err) {
    if (err instanceof SupabaseRepoError) {
      return badGateway('supabase_error', { msg: err.message })
    }
    console.error('[tax-entries] unexpected error:', err)
    return internalError('internal_error')
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- netlify/functions/tax-entries.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add netlify/functions/utils/http.ts netlify/functions/tax-entries.ts netlify/functions/tax-entries.test.ts
git commit -m "Expose tax income entries through an authenticated function

The browser never holds Supabase credentials, so CRUD for receipts goes
through the same session-guarded function layer as Binance calls."
```

---

### Task 7: `tax-filings` function

**Files:**
- Create: `netlify/functions/tax-filings.ts`
- Create: `netlify/functions/tax-filings.test.ts`

**Interfaces:**
- Consumes: `tax-repo.ts` (`listFilings`, `upsertFiling`, `deleteFiling`, `SupabaseRepoError`), `tax-validation.ts` (`parseFilingInput`, `parseJsonBody`, `parseYearParam`, `parsePeriodParam`), `utils/http.ts`, `utils/auth.ts`.
- Produces HTTP contract:
  - `GET /api/tax-filings[?year=YYYY]` → `200 { filings: TaxFiling[] }`
  - `PUT /api/tax-filings` body `TaxFiling` → `200 { filing }` (upsert)
  - `DELETE /api/tax-filings?year=YYYY&period=Q1` → `204`, `404`
  - `400`, `401`, `405`, `502` as in Task 6.

- [ ] **Step 1: Write the failing tests**

Create `netlify/functions/tax-filings.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HandlerEvent } from '@netlify/functions'
import type { TaxFiling } from '../../src/types/tax.ts'

vi.mock('./utils/auth.ts', () => ({
  requireAuth: vi.fn(() => null),
}))

vi.mock('./utils/tax-repo.ts', () => {
  class SupabaseRepoError extends Error {}
  return {
    SupabaseRepoError,
    listFilings: vi.fn(),
    upsertFiling: vi.fn(),
    deleteFiling: vi.fn(),
  }
})

import { requireAuth } from './utils/auth.ts'
import * as repo from './utils/tax-repo.ts'
import { handler } from './tax-filings.ts'

const filing: TaxFiling = { taxYear: 2026, period: 'Q1', filedOn: '2026-05-10', amountPaidPhp: 4000 }

function makeEvent(overrides: Partial<HandlerEvent>): HandlerEvent {
  return {
    httpMethod: 'GET',
    headers: {},
    queryStringParameters: {},
    body: null,
    ...overrides,
  } as unknown as HandlerEvent
}

async function call(overrides: Partial<HandlerEvent>) {
  const res = await handler(makeEvent(overrides), {} as never)
  if (res === undefined) throw new Error('handler returned nothing')
  return { status: res.statusCode, body: res.body ? (JSON.parse(res.body) as unknown) : null }
}

beforeEach(() => {
  vi.mocked(requireAuth).mockReturnValue(null)
  vi.mocked(repo.listFilings).mockReset()
  vi.mocked(repo.upsertFiling).mockReset()
  vi.mocked(repo.deleteFiling).mockReset()
})

describe('tax-filings handler', () => {
  it('answers preflight and guards auth and methods', async () => {
    expect((await call({ httpMethod: 'OPTIONS' })).status).toBe(204)
    expect((await call({ httpMethod: 'POST' })).status).toBe(405)
    vi.mocked(requireAuth).mockReturnValue({ statusCode: 401, body: JSON.stringify({ error: 'unauthorized' }) })
    expect((await call({ httpMethod: 'GET' })).status).toBe(401)
  })

  it('lists filings, optionally by year', async () => {
    vi.mocked(repo.listFilings).mockResolvedValue([filing])
    const res = await call({ httpMethod: 'GET', queryStringParameters: { year: '2026' } })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ filings: [filing] })
    expect(repo.listFilings).toHaveBeenLastCalledWith(2026)
  })

  it('upserts a filing', async () => {
    vi.mocked(repo.upsertFiling).mockResolvedValue(filing)
    const res = await call({ httpMethod: 'PUT', body: JSON.stringify(filing) })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ filing })
    expect(repo.upsertFiling).toHaveBeenCalledWith(filing)
  })

  it('rejects an invalid filing body', async () => {
    const res = await call({ httpMethod: 'PUT', body: JSON.stringify({ ...filing, period: 'Q4' }) })
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'period must be one of Q1, Q2, Q3, ANNUAL' })
  })

  it('deletes a filing by year and period', async () => {
    vi.mocked(repo.deleteFiling).mockResolvedValue(true)
    expect((await call({ httpMethod: 'DELETE', queryStringParameters: { year: '2026', period: 'Q1' } })).status).toBe(204)
    expect(repo.deleteFiling).toHaveBeenCalledWith(2026, 'Q1')

    vi.mocked(repo.deleteFiling).mockResolvedValue(false)
    expect((await call({ httpMethod: 'DELETE', queryStringParameters: { year: '2026', period: 'Q1' } })).status).toBe(404)

    expect((await call({ httpMethod: 'DELETE', queryStringParameters: { period: 'Q1' } })).status).toBe(400)
    expect((await call({ httpMethod: 'DELETE', queryStringParameters: { year: '2026' } })).status).toBe(400)
  })

  it('maps repository failures to 502', async () => {
    vi.mocked(repo.listFilings).mockRejectedValue(new repo.SupabaseRepoError('timeout'))
    const res = await call({ httpMethod: 'GET' })
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'supabase_error', msg: 'timeout' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- netlify/functions/tax-filings.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `netlify/functions/tax-filings.ts`**

```ts
import type { Handler, HandlerEvent, HandlerResponse } from '@netlify/functions'
import { requireAuth } from './utils/auth.ts'
import {
  badGateway,
  badRequest,
  internalError,
  methodNotAllowed,
  noContent,
  notFound,
  ok,
  preflight,
} from './utils/http.ts'
import { deleteFiling, listFilings, SupabaseRepoError, upsertFiling } from './utils/tax-repo.ts'
import { parseFilingInput, parseJsonBody, parsePeriodParam, parseYearParam } from './utils/tax-validation.ts'

async function handleGet(event: HandlerEvent): Promise<HandlerResponse> {
  const year = parseYearParam(event.queryStringParameters?.['year'])
  if (!year.ok) return badRequest(year.error)
  const filings = await listFilings(year.value)
  return ok({ filings })
}

async function handlePut(event: HandlerEvent): Promise<HandlerResponse> {
  const json = parseJsonBody(event.body)
  if (!json.ok) return badRequest(json.error)
  const input = parseFilingInput(json.value)
  if (!input.ok) return badRequest(input.error)
  const filing = await upsertFiling(input.value)
  return ok({ filing })
}

async function handleDelete(event: HandlerEvent): Promise<HandlerResponse> {
  const year = parseYearParam(event.queryStringParameters?.['year'])
  if (!year.ok) return badRequest(year.error)
  if (year.value === null) return badRequest('year is required')
  const period = parsePeriodParam(event.queryStringParameters?.['period'])
  if (!period.ok) return badRequest(period.error)
  const removed = await deleteFiling(year.value, period.value)
  return removed ? noContent() : notFound()
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  try {
    switch (event.httpMethod) {
      case 'GET':    return await handleGet(event)
      case 'PUT':    return await handlePut(event)
      case 'DELETE': return await handleDelete(event)
      default:       return methodNotAllowed()
    }
  } catch (err) {
    if (err instanceof SupabaseRepoError) {
      return badGateway('supabase_error', { msg: err.message })
    }
    console.error('[tax-filings] unexpected error:', err)
    return internalError('internal_error')
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- netlify/functions/tax-filings.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add netlify/functions/tax-filings.ts netlify/functions/tax-filings.test.ts
git commit -m "Record which tax periods have been filed

Marking a period filed is what silences its deadline banner, so it
needs to persist alongside the receipts rather than per browser."
```

---

### Task 8: Client API, tax store, and load-on-mount hook

**Files:**
- Create: `src/lib/taxApi.ts`
- Create: `src/store/taxStore.ts`
- Create: `src/store/taxStore.test.ts`
- Create: `src/hooks/useTaxData.ts`
- Modify: `src/App.tsx` (mount hook)

**Interfaces:**
- Consumes: HTTP contracts from Tasks 6 and 7; `API_BASE`; `TaxIncomeEntry`, `TaxIncomeEntryInput`, `TaxFiling`, `TaxPeriod`.
- Produces (`@/lib/taxApi`):
  ```ts
  fetchEntries(): Promise<TaxIncomeEntry[]>
  createEntry(input: TaxIncomeEntryInput): Promise<TaxIncomeEntry>
  updateEntry(id: string, input: TaxIncomeEntryInput): Promise<TaxIncomeEntry>
  deleteEntry(id: string): Promise<void>
  fetchFilings(): Promise<TaxFiling[]>
  putFiling(input: TaxFiling): Promise<TaxFiling>
  deleteFiling(taxYear: number, period: TaxPeriod): Promise<void>
  ```
- Produces (`@/store/taxStore`), `useTaxStore` with state:
  ```ts
  selectedYear: number; entries: TaxIncomeEntry[]; filings: TaxFiling[]
  isLoading: boolean; hasLoaded: boolean; error: string | null
  setSelectedYear(year: number): void
  load(): Promise<void>
  addEntry(input: TaxIncomeEntryInput): Promise<void>
  editEntry(id: string, input: TaxIncomeEntryInput): Promise<void>
  removeEntry(id: string): Promise<void>
  markFiled(input: TaxFiling): Promise<void>
  unmarkFiled(taxYear: number, period: TaxPeriod): Promise<void>
  ```
  Mutations throw on failure (so forms can show the message) and also set `error`.
- Produces (`@/hooks/useTaxData`): `useTaxData(): void`, calls `load()` once on mount.

- [ ] **Step 1: Write `src/lib/taxApi.ts`**

```ts
import { API_BASE } from '@/constants'
import type { TaxFiling, TaxIncomeEntry, TaxIncomeEntryInput, TaxPeriod } from '@/types/tax'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string; msg?: string }
      message = body.msg ?? body.error ?? message
    } catch {
      // non-JSON error body, keep the status message
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export async function fetchEntries(): Promise<TaxIncomeEntry[]> {
  const body = await request<{ entries: TaxIncomeEntry[] }>('/tax-entries')
  return body.entries
}

export async function createEntry(input: TaxIncomeEntryInput): Promise<TaxIncomeEntry> {
  const body = await request<{ entry: TaxIncomeEntry }>('/tax-entries', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return body.entry
}

export async function updateEntry(id: string, input: TaxIncomeEntryInput): Promise<TaxIncomeEntry> {
  const body = await request<{ entry: TaxIncomeEntry }>(`/tax-entries?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  return body.entry
}

export async function deleteEntry(id: string): Promise<void> {
  await request<undefined>(`/tax-entries?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function fetchFilings(): Promise<TaxFiling[]> {
  const body = await request<{ filings: TaxFiling[] }>('/tax-filings')
  return body.filings
}

export async function putFiling(input: TaxFiling): Promise<TaxFiling> {
  const body = await request<{ filing: TaxFiling }>('/tax-filings', {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  return body.filing
}

export async function deleteFiling(taxYear: number, period: TaxPeriod): Promise<void> {
  await request<undefined>(`/tax-filings?year=${taxYear}&period=${period}`, { method: 'DELETE' })
}
```

- [ ] **Step 2: Write the failing store tests**

Create `src/store/taxStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaxFiling, TaxIncomeEntry } from '@/types/tax'

vi.mock('@/lib/taxApi', () => ({
  fetchEntries: vi.fn(),
  createEntry: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
  fetchFilings: vi.fn(),
  putFiling: vi.fn(),
  deleteFiling: vi.fn(),
}))

import * as api from '@/lib/taxApi'
import { useTaxStore } from '@/store/taxStore'

const older: TaxIncomeEntry = {
  id: 'a', receivedOn: '2026-01-10', source: 'A', amountPhp: 100, note: null,
  createdAt: '2026-01-10T00:00:00Z', updatedAt: '2026-01-10T00:00:00Z',
}
const newer: TaxIncomeEntry = { ...older, id: 'b', receivedOn: '2026-02-10' }
const filing: TaxFiling = { taxYear: 2026, period: 'Q1', filedOn: '2026-05-01', amountPaidPhp: 0 }

beforeEach(() => {
  useTaxStore.setState({ entries: [], filings: [], isLoading: false, hasLoaded: false, error: null })
  vi.mocked(api.fetchEntries).mockReset()
  vi.mocked(api.fetchFilings).mockReset()
  vi.mocked(api.createEntry).mockReset()
  vi.mocked(api.updateEntry).mockReset()
  vi.mocked(api.deleteEntry).mockReset()
  vi.mocked(api.putFiling).mockReset()
  vi.mocked(api.deleteFiling).mockReset()
})

describe('taxStore', () => {
  it('defaults selectedYear to the current year', () => {
    expect(useTaxStore.getState().selectedYear).toBe(new Date().getFullYear())
  })

  it('loads entries and filings together', async () => {
    vi.mocked(api.fetchEntries).mockResolvedValue([older, newer])
    vi.mocked(api.fetchFilings).mockResolvedValue([filing])
    await useTaxStore.getState().load()
    const s = useTaxStore.getState()
    expect(s.entries.map((e) => e.id)).toEqual(['b', 'a'])   // newest first
    expect(s.filings).toEqual([filing])
    expect(s.hasLoaded).toBe(true)
    expect(s.isLoading).toBe(false)
    expect(s.error).toBeNull()
  })

  it('records a load failure', async () => {
    vi.mocked(api.fetchEntries).mockRejectedValue(new Error('supabase_error'))
    vi.mocked(api.fetchFilings).mockResolvedValue([])
    await useTaxStore.getState().load()
    expect(useTaxStore.getState().error).toBe('supabase_error')
    expect(useTaxStore.getState().isLoading).toBe(false)
  })

  it('adds, edits, and removes entries keeping newest-first order', async () => {
    useTaxStore.setState({ entries: [older] })
    vi.mocked(api.createEntry).mockResolvedValue(newer)
    await useTaxStore.getState().addEntry({ receivedOn: '2026-02-10', source: 'A', amountPhp: 100, note: null })
    expect(useTaxStore.getState().entries.map((e) => e.id)).toEqual(['b', 'a'])

    vi.mocked(api.updateEntry).mockResolvedValue({ ...older, amountPhp: 999 })
    await useTaxStore.getState().editEntry('a', { receivedOn: '2026-01-10', source: 'A', amountPhp: 999, note: null })
    expect(useTaxStore.getState().entries.find((e) => e.id === 'a')?.amountPhp).toBe(999)

    vi.mocked(api.deleteEntry).mockResolvedValue()
    await useTaxStore.getState().removeEntry('b')
    expect(useTaxStore.getState().entries.map((e) => e.id)).toEqual(['a'])
  })

  it('marks and unmarks filings', async () => {
    vi.mocked(api.putFiling).mockResolvedValue(filing)
    await useTaxStore.getState().markFiled(filing)
    expect(useTaxStore.getState().filings).toEqual([filing])

    const updated = { ...filing, amountPaidPhp: 50 }
    vi.mocked(api.putFiling).mockResolvedValue(updated)
    await useTaxStore.getState().markFiled(updated)
    expect(useTaxStore.getState().filings).toEqual([updated])   // replaced, not duplicated

    vi.mocked(api.deleteFiling).mockResolvedValue()
    await useTaxStore.getState().unmarkFiled(2026, 'Q1')
    expect(useTaxStore.getState().filings).toEqual([])
  })

  it('rethrows mutation failures and records the message', async () => {
    vi.mocked(api.createEntry).mockRejectedValue(new Error('amountPhp must be a number between 0 and 1e12'))
    await expect(
      useTaxStore.getState().addEntry({ receivedOn: '2026-02-10', source: 'A', amountPhp: -1, note: null }),
    ).rejects.toThrow('amountPhp')
    expect(useTaxStore.getState().error).toBe('amountPhp must be a number between 0 and 1e12')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/store/taxStore.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement `src/store/taxStore.ts`**

```ts
import { create } from 'zustand'
import * as api from '@/lib/taxApi'
import type { TaxFiling, TaxIncomeEntry, TaxIncomeEntryInput, TaxPeriod } from '@/types/tax'

interface TaxState {
  selectedYear: number
  entries: TaxIncomeEntry[]     // newest receivedOn first
  filings: TaxFiling[]
  isLoading: boolean
  hasLoaded: boolean
  error: string | null

  setSelectedYear: (year: number) => void
  load: () => Promise<void>
  addEntry: (input: TaxIncomeEntryInput) => Promise<void>
  editEntry: (id: string, input: TaxIncomeEntryInput) => Promise<void>
  removeEntry: (id: string) => Promise<void>
  markFiled: (input: TaxFiling) => Promise<void>
  unmarkFiled: (taxYear: number, period: TaxPeriod) => Promise<void>
}

function sortEntries(entries: TaxIncomeEntry[]): TaxIncomeEntry[] {
  return [...entries].sort((a, b) => {
    if (a.receivedOn !== b.receivedOn) return a.receivedOn < b.receivedOn ? 1 : -1
    return a.createdAt < b.createdAt ? 1 : -1
  })
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export const useTaxStore = create<TaxState>()((set, get) => {
  // Mutations surface the failure to the caller (form) and to the store (section-level line).
  async function mutate(fallback: string, run: () => Promise<void>): Promise<void> {
    try {
      await run()
      set({ error: null })
    } catch (err) {
      set({ error: messageOf(err, fallback) })
      throw err
    }
  }

  return {
    selectedYear: new Date().getFullYear(),
    entries: [],
    filings: [],
    isLoading: false,
    hasLoaded: false,
    error: null,

    setSelectedYear: (selectedYear) => set({ selectedYear }),

    load: async () => {
      set({ isLoading: true })
      try {
        const [entries, filings] = await Promise.all([api.fetchEntries(), api.fetchFilings()])
        set({ entries: sortEntries(entries), filings, hasLoaded: true, error: null })
      } catch (err) {
        console.error('[taxStore] load failed:', err)
        set({ error: messageOf(err, 'Failed to load tax records') })
      } finally {
        set({ isLoading: false })
      }
    },

    addEntry: (input) =>
      mutate('Failed to add entry', async () => {
        const entry = await api.createEntry(input)
        set({ entries: sortEntries([...get().entries, entry]) })
      }),

    editEntry: (id, input) =>
      mutate('Failed to update entry', async () => {
        const entry = await api.updateEntry(id, input)
        set({ entries: sortEntries(get().entries.map((e) => (e.id === id ? entry : e))) })
      }),

    removeEntry: (id) =>
      mutate('Failed to delete entry', async () => {
        await api.deleteEntry(id)
        set({ entries: get().entries.filter((e) => e.id !== id) })
      }),

    markFiled: (input) =>
      mutate('Failed to mark as filed', async () => {
        const filing = await api.putFiling(input)
        const others = get().filings.filter((f) => !(f.taxYear === filing.taxYear && f.period === filing.period))
        set({ filings: [...others, filing] })
      }),

    unmarkFiled: (taxYear, period) =>
      mutate('Failed to unmark filing', async () => {
        await api.deleteFiling(taxYear, period)
        set({ filings: get().filings.filter((f) => !(f.taxYear === taxYear && f.period === period)) })
      }),
  }
})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/store/taxStore.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Write `src/hooks/useTaxData.ts` and mount it**

```ts
import { useEffect } from 'react'
import { useTaxStore } from '@/store/taxStore'

/** Loads tax records once so the Overview banner has data before the Tax tab is visited. */
export function useTaxData() {
  const load = useTaxStore((s) => s.load)

  useEffect(() => {
    void load()
  }, [load])
}
```

In `src/App.tsx`, add `import { useTaxData } from '@/hooks/useTaxData'` and call `useTaxData()` inside `AppInner` after `useStockQuotes()`.

- [ ] **Step 7: Typecheck, run all tests, commit**

```bash
npm run typecheck && npm test
git add src/lib/taxApi.ts src/store/taxStore.ts src/store/taxStore.test.ts src/hooks/useTaxData.ts src/App.tsx
git commit -m "Load and mutate tax records from the browser

The store owns the async actions so every form and the deadline banner
see the same entries and filings, updated from the server's response
without a second round trip."
```

---

### Task 9: Navigation change and Overview tab

**Files:**
- Modify: `src/store/navigationStore.ts`
- Modify: `src/components/layout/TabBar.tsx`
- Modify: `src/components/layout/Dashboard.tsx`
- Delete: `src/components/portfolio/PortfolioSection.tsx`
- Create: `src/hooks/usePortfolioSummary.ts`
- Create: `src/components/ui/SkeletonBlock.tsx`
- Create: `src/components/overview/PortfolioHero.tsx`
- Create: `src/components/overview/AssetClassCard.tsx`
- Create: `src/components/overview/AllocationBar.tsx`
- Create: `src/components/overview/TopHoldingsList.tsx`
- Create: `src/components/overview/OverviewSection.tsx`
- Create: `src/components/tax/TaxSection.tsx` (placeholder in this task, filled in Task 10)

**Interfaces:**
- Consumes: `summarisePortfolio`, `PortfolioSummary`, `ClassSummary`, `HoldingSummary`, `SummaryClass` from Task 4; `formatMoney(value, currency)`, `formatPercent`, `formatTimestamp` from `@/lib/formatters`; stores `balanceStore`, `cryptoHoldingsStore`, `priceStore`, `portfolioStore`, `stockQuoteStore`, `stockPositionsStore`.
- Produces: `DashboardTab = 'overview' | 'crypto' | 'stocks' | 'reits' | 'tax'`; `usePortfolioSummary(): PortfolioSummary`; `OverviewSection`; `TaxSection` (placeholder export replaced in Task 10). The Overview reserves a slot at the top for `TaxDeadlineBanner` (Task 11).

- [ ] **Step 1: Update navigation**

`src/store/navigationStore.ts`: change the type and default:

```ts
export type DashboardTab = 'overview' | 'crypto' | 'stocks' | 'reits' | 'tax'
```
and `activeTab: 'overview',`.

`src/components/layout/TabBar.tsx`: replace `TABS` with:

```ts
const TABS: { id: DashboardTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'crypto',   label: 'Crypto' },
  { id: 'stocks',   label: 'Stocks' },
  { id: 'reits',    label: 'REITs' },
  { id: 'tax',      label: 'Tax' },
]
```

`src/components/layout/Dashboard.tsx`: replace the `PortfolioSection` import with `OverviewSection` and `TaxSection` imports and the body with:

```tsx
        {activeTab === 'overview' && <OverviewSection />}
        {activeTab === 'crypto'   && <CryptoSection />}
        {activeTab === 'stocks'   && <StocksSection tab="stocks" filter="stock" />}
        {activeTab === 'reits'    && <ReitsSection />}
        {activeTab === 'tax'      && <TaxSection />}
```

Delete `src/components/portfolio/PortfolioSection.tsx` (`git rm src/components/portfolio/PortfolioSection.tsx`). Its Trading 212 account block (account value, cash, unrealized P&L) is carried into the Stocks class card's detail line below; the crypto per-asset list is covered by Top holdings.

Create a placeholder `src/components/tax/TaxSection.tsx` so the build passes until Task 10:

```tsx
export function TaxSection() {
  return <div className="p-3 text-xs text-text-muted font-mono">Tax module loading…</div>
}
```

- [ ] **Step 2: Write `src/hooks/usePortfolioSummary.ts`**

```ts
import { useMemo } from 'react'
import { useBalanceStore } from '@/store/balanceStore'
import { useCryptoHoldingsStore } from '@/store/cryptoHoldingsStore'
import { usePriceStore } from '@/store/priceStore'
import { usePortfolioStore } from '@/store/portfolioStore'
import { useStockPositionsStore } from '@/store/stockPositionsStore'
import { useStockQuoteStore } from '@/store/stockQuoteStore'
import { summarisePortfolio, type PortfolioSummary } from '@/lib/portfolioSummary'

export function usePortfolioSummary(): PortfolioSummary {
  const balance = useBalanceStore((s) => s.balance)
  const cryptoHoldings = useCryptoHoldingsStore((s) => s.holdings)
  const prices = usePriceStore((s) => s.prices)
  const stocks = usePortfolioStore((s) => s.stocks)
  const quotes = useStockQuoteStore((s) => s.quotes)
  const positions = useStockPositionsStore((s) => s.positions)
  const account = useStockPositionsStore((s) => s.account)
  const positionsFetchedAt = useStockPositionsStore((s) => s.fetchedAt)

  return useMemo(
    () => summarisePortfolio({ balance, cryptoHoldings, prices, stocks, quotes, positions, account, positionsFetchedAt }),
    [balance, cryptoHoldings, prices, stocks, quotes, positions, account, positionsFetchedAt],
  )
}
```

- [ ] **Step 3: Write `src/components/ui/SkeletonBlock.tsx`**

```tsx
interface SkeletonBlockProps {
  className?: string
}

export function SkeletonBlock({ className = '' }: SkeletonBlockProps) {
  return <div className={`animate-pulse rounded bg-panel-border/60 ${className}`} aria-hidden="true" />
}
```

- [ ] **Step 4: Write `src/components/overview/PortfolioHero.tsx`**

```tsx
import { SkeletonBlock } from '@/components/ui/SkeletonBlock'
import { formatMoney, formatPercent, formatTimestamp } from '@/lib/formatters'
import type { PortfolioSummary } from '@/lib/portfolioSummary'

interface PortfolioHeroProps {
  summary: PortfolioSummary
  isLoading: boolean
  error: string | null
}

export function PortfolioHero({ summary, isLoading, error }: PortfolioHeroProps) {
  const showSkeleton = isLoading && summary.asOf === null
  const isPositive = summary.change24hUsd >= 0
  const changeColor = isPositive ? 'text-bull-green' : 'text-bear-red'
  const stockCurrency = summary.classes.stock.currency

  return (
    <section className="bg-panel-bg border border-panel-border rounded-lg p-5 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-btc-orange/60 to-transparent" />
      <div className="text-[11px] uppercase tracking-widest text-text-muted font-mono">Total portfolio value</div>

      {showSkeleton ? (
        <div className="mt-3 space-y-2">
          <SkeletonBlock className="h-10 w-64" />
          <SkeletonBlock className="h-4 w-40" />
        </div>
      ) : (
        <>
          <div className="mt-2 text-4xl md:text-5xl font-mono font-bold text-text-primary tabular-nums">
            {formatMoney(summary.total, summary.totalCurrency)}
          </div>
          <div className="mt-2 flex items-baseline gap-3 font-mono text-sm">
            <span className={changeColor}>
              {isPositive ? '+' : ''}{formatMoney(summary.change24hUsd, summary.totalCurrency)}
            </span>
            {summary.change24hPercent !== null && (
              <span className={`${changeColor} text-xs`}>{formatPercent(summary.change24hPercent)}</span>
            )}
            <span className="text-text-muted text-xs">24h</span>
            {summary.asOf !== null && (
              <span className="ml-auto text-text-muted text-[11px]">as of {formatTimestamp(summary.asOf)}</span>
            )}
          </div>
          {summary.isMixedCurrency && (
            <p className="mt-2 text-[11px] text-text-muted">
              Stocks and REITs are in {stockCurrency} (Trading 212 account currency); crypto is in USDT. The total mixes both.
            </p>
          )}
        </>
      )}

      {error !== null && (
        <p className="mt-3 text-[11px] text-text-muted font-mono">Some data failed to load: {error}</p>
      )}
    </section>
  )
}
```

- [ ] **Step 5: Write `src/components/overview/AssetClassCard.tsx`**

```tsx
import { SkeletonBlock } from '@/components/ui/SkeletonBlock'
import { useNavigationStore, type DashboardTab } from '@/store/navigationStore'
import { formatMoney, formatPercent } from '@/lib/formatters'
import type { ClassSummary } from '@/lib/portfolioSummary'

interface AssetClassCardProps {
  label: string
  tab: DashboardTab
  summary: ClassSummary
  total: number
  accentClass: string     // e.g. 'bg-btc-orange'
  isLoading: boolean
  detail?: string         // one extra line, e.g. Trading 212 cash and P&L
}

export function AssetClassCard({ label, tab, summary, total, accentClass, isLoading, detail }: AssetClassCardProps) {
  const setActiveTab = useNavigationStore((s) => s.setActiveTab)
  const share = total > 0 ? (summary.value / total) * 100 : 0
  const isPositive = summary.change24hUsd >= 0
  const showSkeleton = isLoading && summary.value === 0 && summary.holdingCount === 0
  const allUnpriced = summary.holdingCount > 0 && summary.unpricedCount === summary.holdingCount

  return (
    <button
      type="button"
      onClick={() => setActiveTab(tab)}
      className="text-left bg-panel-bg border border-panel-border rounded-lg p-4 hover:border-text-muted/60 transition-colors group flex flex-col"
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${accentClass}`} />
        <span className="text-xs text-text-muted font-mono uppercase tracking-wider">{label}</span>
        <span className="ml-auto text-[10px] text-text-muted font-mono">
          {summary.holdingCount} {summary.holdingCount === 1 ? 'holding' : 'holdings'}
        </span>
      </div>

      {showSkeleton ? (
        <div className="mt-3 space-y-2">
          <SkeletonBlock className="h-7 w-32" />
          <SkeletonBlock className="h-3 w-20" />
        </div>
      ) : (
        <>
          <div className="mt-3 text-2xl font-mono font-semibold text-text-primary tabular-nums">
            {allUnpriced
              ? <span className="text-text-muted text-base">Unpriced</span>
              : formatMoney(summary.value, summary.currency)}
          </div>
          <div className="mt-1 flex items-baseline gap-2 font-mono text-xs">
            <span className="text-text-muted">{formatPercent(share, false)} of total</span>
            {summary.change24hPercent !== null && (
              <span className={isPositive ? 'text-bull-green' : 'text-bear-red'}>
                {formatPercent(summary.change24hPercent)} 24h
              </span>
            )}
          </div>
          {allUnpriced && (
            <p className="mt-2 text-[11px] text-text-muted">Connect Trading 212 or add share counts to price these.</p>
          )}
          {!allUnpriced && summary.unpricedCount > 0 && (
            <p className="mt-2 text-[11px] text-text-muted">{summary.unpricedCount} without a position or share count.</p>
          )}
          {detail !== undefined && (
            <p className="mt-2 text-[11px] text-text-muted font-mono">{detail}</p>
          )}
        </>
      )}

      <div className="mt-auto pt-3 text-[11px] font-mono text-text-muted group-hover:text-text-primary transition-colors">
        View {label} →
      </div>
    </button>
  )
}
```

- [ ] **Step 6: Write `src/components/overview/AllocationBar.tsx`**

```tsx
import { formatPercent } from '@/lib/formatters'
import type { PortfolioSummary } from '@/lib/portfolioSummary'

interface AllocationBarProps {
  summary: PortfolioSummary
}

const SEGMENTS = [
  { key: 'crypto', label: 'Crypto', color: 'bg-btc-orange' },
  { key: 'stock',  label: 'Stocks', color: 'bg-bull-green' },
  { key: 'reit',   label: 'REITs',  color: 'bg-blue-400' },
] as const

export function AllocationBar({ summary }: AllocationBarProps) {
  const total = summary.total
  const segments = SEGMENTS.map((s) => ({
    ...s,
    pct: total > 0 ? (summary.classes[s.key].value / total) * 100 : 0,
  }))

  return (
    <section className="bg-panel-bg border border-panel-border rounded-lg p-4 h-full">
      <div className="text-xs text-text-muted font-mono mb-3">Allocation</div>
      <div className="h-2.5 rounded-full overflow-hidden bg-terminal-bg flex">
        {segments.map((s) => (
          <div
            key={s.key}
            className={`${s.color} h-full`}
            style={{ width: `${s.pct.toFixed(2)}%` }}
            title={`${s.label} ${formatPercent(s.pct, false)}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-xs">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.color}`} />
            <span className="text-text-muted">{s.label}</span>
            <span className="text-text-primary">{formatPercent(s.pct, false)}</span>
          </div>
        ))}
      </div>
      {total === 0 && (
        <p className="mt-3 text-[11px] text-text-muted">
          Nothing priced yet. Crypto loads from Binance and stocks from Trading 212 once their API keys are set.
        </p>
      )}
      {summary.isMixedCurrency && (
        <p className="mt-3 text-[11px] text-text-muted">Shares mix USDT and {summary.classes.stock.currency} at face value.</p>
      )}
    </section>
  )
}
```

- [ ] **Step 7: Write `src/components/overview/TopHoldingsList.tsx`**

```tsx
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
```

- [ ] **Step 8: Write `src/components/overview/OverviewSection.tsx`**

```tsx
import { AllocationBar } from '@/components/overview/AllocationBar'
import { AssetClassCard } from '@/components/overview/AssetClassCard'
import { PortfolioHero } from '@/components/overview/PortfolioHero'
import { TopHoldingsList } from '@/components/overview/TopHoldingsList'
import { usePortfolioSummary } from '@/hooks/usePortfolioSummary'
import { formatMoney } from '@/lib/formatters'
import { useBalanceStore } from '@/store/balanceStore'
import { useStockPositionsStore } from '@/store/stockPositionsStore'
import { useStockQuoteStore } from '@/store/stockQuoteStore'

export function OverviewSection() {
  const summary = usePortfolioSummary()
  const balanceLoading = useBalanceStore((s) => s.isLoading)
  const balanceError = useBalanceStore((s) => s.error)
  const quotesLoading = useStockQuoteStore((s) => s.isLoading)
  const quotesError = useStockQuoteStore((s) => s.error)
  const positionsLoading = useStockPositionsStore((s) => s.isLoading)
  const positionsError = useStockPositionsStore((s) => s.error)
  const account = useStockPositionsStore((s) => s.account)

  const equitiesLoading = quotesLoading || positionsLoading
  const isLoading = balanceLoading || equitiesLoading
  const error = balanceError ?? positionsError ?? quotesError

  let tradingDetail: string | undefined
  if (account !== null) {
    const sign = account.unrealizedPnl >= 0 ? '+' : ''
    tradingDetail = `Trading 212 · cash ${formatMoney(account.cashAvailable, account.currency)} · ${sign}${formatMoney(account.unrealizedPnl, account.currency)} unrealized`
  }

  return (
    <div className="p-3 md:p-4 flex flex-col gap-3 max-w-6xl w-full mx-auto">
      {/* Task 11 mounts <TaxDeadlineBanner /> here */}
      <PortfolioHero summary={summary} isLoading={isLoading} error={error} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AssetClassCard label="Crypto" tab="crypto" summary={summary.classes.crypto} total={summary.total} accentClass="bg-btc-orange" isLoading={balanceLoading} />
        <AssetClassCard label="Stocks" tab="stocks" summary={summary.classes.stock}  total={summary.total} accentClass="bg-bull-green" isLoading={equitiesLoading} {...(tradingDetail === undefined ? {} : { detail: tradingDetail })} />
        <AssetClassCard label="REITs"  tab="reits"  summary={summary.classes.reit}   total={summary.total} accentClass="bg-blue-400"  isLoading={equitiesLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-2"><AllocationBar summary={summary} /></div>
        <div className="lg:col-span-3"><TopHoldingsList holdings={summary.topHoldings} total={summary.total} /></div>
      </div>
    </div>
  )
}
```

The spread for `detail` is deliberate: `exactOptionalPropertyTypes` rejects passing `detail={undefined}` to an optional prop.

- [ ] **Step 9: Typecheck, lint, and look at it**

```bash
npm run typecheck && npm run lint
```

Then `npm run dev`, open `http://localhost:8888`, log in, and check: Overview is the landing tab; hero shows the total in the right currency (Trading 212 currency when there is no crypto, USD otherwise, with the mixed-currency note); the Stocks card shows the Trading 212 cash and P&L line; class cards switch tabs; allocation bar sums to 100% when priced; the old Portfolio tab is gone. On a narrow window (375px) cards stack and nothing overflows horizontally. Fix anything off before committing.

- [ ] **Step 10: Commit**

```bash
git add src/store/navigationStore.ts src/components/layout/TabBar.tsx src/components/layout/Dashboard.tsx src/hooks/usePortfolioSummary.ts src/components/ui/SkeletonBlock.tsx src/components/overview src/components/tax/TaxSection.tsx
git rm -q src/components/portfolio/PortfolioSection.tsx
git commit -m "Land on an Overview of crypto, stocks, and REITs

The first screen should answer \"what am I worth right now\" across every
asset class instead of dropping into the BTC chart. The Portfolio tab's
allocation and Trading 212 summary move into the Overview so there is one
summary, not two."
```

---

### Task 10: Tax tab

**Files:**
- Modify: `src/components/tax/TaxSection.tsx` (replace placeholder)
- Create: `src/components/tax/TaxPeriodCard.tsx`
- Create: `src/components/tax/TaxEntryForm.tsx`
- Create: `src/components/tax/TaxEntryList.tsx`

**Interfaces:**
- Consumes: `useTaxStore` (Task 8), `summarisePeriods`, `todayIso`, `quarterOf`, `isValidIsoDate`, `TAX_PERIODS` (Task 2), `formatPhp`, `formatIsoDate` (Task 1), `TaxPeriodSummary`, `TaxIncomeEntry`, `TaxIncomeEntryInput`.
- Produces: `TaxSection` (final), `TaxPeriodCard`, `TaxEntryForm` (used for both add and inline edit), `TaxEntryList`. Task 11 adds `EnableNotificationsButton` into `TaxSection`'s header slot.

- [ ] **Step 1: Write `src/components/tax/TaxEntryForm.tsx`**

```tsx
import { useState } from 'react'
import type { FormEvent } from 'react'
import { isValidIsoDate, todayIso } from '@/lib/tax'
import type { TaxIncomeEntryInput } from '@/types/tax'

interface TaxEntryFormProps {
  initial?: TaxIncomeEntryInput
  submitLabel: string
  onSubmit: (input: TaxIncomeEntryInput) => Promise<void>
  onCancel?: () => void
}

const inputClass =
  'bg-terminal-bg border border-panel-border rounded px-2 py-1.5 font-mono text-xs text-text-primary outline-none focus:border-text-muted placeholder:text-text-muted/50'

function validate(receivedOn: string, source: string, amount: string): string | null {
  if (!isValidIsoDate(receivedOn)) return 'Enter a valid date.'
  if (source.trim().length === 0) return 'Source is required.'
  if (source.trim().length > 120) return 'Source must be 120 characters or fewer.'
  const parsed = Number(amount)
  if (amount.trim() === '' || !Number.isFinite(parsed) || parsed < 0) return 'Amount must be zero or more.'
  return null
}

export function TaxEntryForm({ initial, submitLabel, onSubmit, onCancel }: TaxEntryFormProps) {
  const [receivedOn, setReceivedOn] = useState(initial?.receivedOn ?? todayIso())
  const [source, setSource] = useState(initial?.source ?? '')
  const [amount, setAmount] = useState(initial === undefined ? '' : String(initial.amountPhp))
  const [note, setNote] = useState(initial?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const problem = validate(receivedOn, source, amount)
    if (problem !== null) {
      setError(problem)
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await onSubmit({
        receivedOn,
        source: source.trim(),
        amountPhp: Number(amount),
        note: note.trim().length === 0 ? null : note.trim(),
      })
      if (initial === undefined) {
        setSource('')
        setAmount('')
        setNote('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form
      onSubmit={(event) => { void handleSubmit(event) }}
      className="grid grid-cols-2 md:grid-cols-[9rem_1fr_9rem_1fr_auto] gap-2 items-start"
    >
      <input type="date" className={inputClass} value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} aria-label="Date received" required />
      <input type="text" className={inputClass} value={source} onChange={(e) => setSource(e.target.value)} placeholder="Source / client" aria-label="Source" maxLength={120} required />
      <input type="number" inputMode="decimal" min="0" step="0.01" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (PHP)" aria-label="Amount in PHP" required />
      <input type="text" className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" aria-label="Note" maxLength={500} />
      <div className="flex gap-2 col-span-2 md:col-span-1">
        <button type="submit" disabled={isSaving} className="px-3 py-1.5 rounded bg-btc-orange text-terminal-bg font-mono text-xs font-semibold disabled:opacity-60">
          {isSaving ? 'Saving…' : submitLabel}
        </button>
        {onCancel !== undefined && (
          <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded border border-panel-border font-mono text-xs text-text-muted hover:text-text-primary">
            Cancel
          </button>
        )}
      </div>
      {error !== null && <p className="col-span-full text-[11px] text-bear-red font-mono">{error}</p>}
    </form>
  )
}
```

- [ ] **Step 2: Write `src/components/tax/TaxEntryList.tsx`**

```tsx
import { useState } from 'react'
import { TaxEntryForm } from '@/components/tax/TaxEntryForm'
import { formatIsoDate, formatPhp } from '@/lib/formatters'
import { quarterOf } from '@/lib/tax'
import { useTaxStore } from '@/store/taxStore'
import type { TaxIncomeEntry } from '@/types/tax'

interface TaxEntryListProps {
  entries: TaxIncomeEntry[]   // already filtered to the selected year, newest first
}

type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4'
const QUARTER_ORDER: Quarter[] = ['Q4', 'Q3', 'Q2', 'Q1']

function EntryRow({ entry }: { entry: TaxIncomeEntry }) {
  const editEntry = useTaxStore((s) => s.editEntry)
  const removeEntry = useTaxStore((s) => s.removeEntry)
  const [isEditing, setIsEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  if (isEditing) {
    return (
      <li className="py-2">
        <TaxEntryForm
          initial={{ receivedOn: entry.receivedOn, source: entry.source, amountPhp: entry.amountPhp, note: entry.note }}
          submitLabel="Save"
          onSubmit={async (input) => {
            await editEntry(entry.id, input)
            setIsEditing(false)
          }}
          onCancel={() => setIsEditing(false)}
        />
      </li>
    )
  }

  return (
    <li className="flex items-center gap-3 py-2 font-mono text-xs">
      <span className="text-text-muted w-24 shrink-0">{formatIsoDate(entry.receivedOn)}</span>
      <span className="text-text-primary truncate">{entry.source}</span>
      {entry.note !== null && <span className="text-text-muted/70 truncate hidden md:inline">{entry.note}</span>}
      <span className="ml-auto text-text-primary tabular-nums">{formatPhp(entry.amountPhp)}</span>
      <div className="flex items-center gap-1 shrink-0">
        <button type="button" onClick={() => setIsEditing(true)} className="px-1.5 py-0.5 rounded border border-panel-border text-text-muted hover:text-text-primary" title="Edit">✎</button>
        {confirmDelete ? (
          <>
            <button
              type="button"
              onClick={() => {
                removeEntry(entry.id).catch((err: unknown) => {
                  setDeleteError(err instanceof Error ? err.message : 'Delete failed')
                })
              }}
              className="px-1.5 py-0.5 rounded border border-bear-red/40 text-bear-red hover:bg-bear-red/10"
            >
              Confirm
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="px-1.5 py-0.5 rounded border border-panel-border text-text-muted">Keep</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="px-1.5 py-0.5 rounded text-bear-red/60 hover:text-bear-red" title="Delete">✕</button>
        )}
      </div>
      {deleteError !== null && <span className="text-bear-red text-[10px]">{deleteError}</span>}
    </li>
  )
}

export function TaxEntryList({ entries }: TaxEntryListProps) {
  if (entries.length === 0) {
    return <p className="text-[11px] text-text-muted py-2">No receipts logged for this year yet.</p>
  }

  const groups = QUARTER_ORDER
    .map((q) => ({ quarter: q, items: entries.filter((e) => quarterOf(e.receivedOn) === q) }))
    .filter((g) => g.items.length > 0)

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const subtotal = g.items.reduce((sum, e) => sum + e.amountPhp, 0)
        return (
          <div key={g.quarter}>
            <div className="flex justify-between font-mono text-[11px] text-text-muted border-b border-panel-border pb-1">
              <span>{g.quarter}</span>
              <span>Subtotal {formatPhp(subtotal)}</span>
            </div>
            <ul className="divide-y divide-panel-border/50">
              {g.items.map((e) => <EntryRow key={e.id} entry={e} />)}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Write `src/components/tax/TaxPeriodCard.tsx`**

```tsx
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
          <button type="button" onClick={() => setIsMarking(false)} className="px-2 py-1 rounded border border-panel-border font-mono text-xs text-text-muted">Cancel</button>
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
```

- [ ] **Step 4: Replace `src/components/tax/TaxSection.tsx`**

```tsx
import { useMemo } from 'react'
import { TaxEntryForm } from '@/components/tax/TaxEntryForm'
import { TaxEntryList } from '@/components/tax/TaxEntryList'
import { TaxPeriodCard } from '@/components/tax/TaxPeriodCard'
import { TAX_ANNUAL_EXEMPTION_PHP, TAX_RATE } from '@/constants'
import { formatPhp } from '@/lib/formatters'
import { summarisePeriods, todayIso } from '@/lib/tax'
import { useTaxStore } from '@/store/taxStore'

const YEARS_BACK = 3

export function TaxSection() {
  const selectedYear = useTaxStore((s) => s.selectedYear)
  const setSelectedYear = useTaxStore((s) => s.setSelectedYear)
  const entries = useTaxStore((s) => s.entries)
  const filings = useTaxStore((s) => s.filings)
  const isLoading = useTaxStore((s) => s.isLoading)
  const hasLoaded = useTaxStore((s) => s.hasLoaded)
  const error = useTaxStore((s) => s.error)
  const addEntry = useTaxStore((s) => s.addEntry)

  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: YEARS_BACK + 1 }, (_, i) => currentYear - i)

  const yearEntries = useMemo(
    () => entries.filter((e) => e.receivedOn.startsWith(`${selectedYear}-`)),
    [entries, selectedYear],
  )
  const summaries = useMemo(
    () => summarisePeriods(entries, filings, selectedYear, todayIso()),
    [entries, filings, selectedYear],
  )
  const yearGross = yearEntries.reduce((sum, e) => sum + e.amountPhp, 0)

  return (
    <div className="p-3 md:p-4 flex flex-col gap-3 max-w-6xl w-full mx-auto">
      <section className="bg-panel-bg border border-panel-border rounded-lg p-4 flex flex-wrap items-center gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-text-muted font-mono">Income tax</div>
          <div className="text-xs text-text-muted mt-0.5">
            8% flat rate, non-VAT, purely self-employed. ₱{TAX_ANNUAL_EXEMPTION_PHP.toLocaleString('en-PH')} annual exemption, rate {TAX_RATE * 100}%.
          </div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {/* Task 11 mounts <EnableNotificationsButton /> here */}
          <label className="font-mono text-xs text-text-muted flex items-center gap-2">
            Year
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-terminal-bg border border-panel-border rounded px-2 py-1 font-mono text-xs text-text-primary outline-none focus:border-text-muted"
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <div className="w-full flex gap-6 font-mono text-xs pt-2 border-t border-panel-border">
          <span className="text-text-muted">Gross {selectedYear}: <span className="text-text-primary">{formatPhp(yearGross)}</span></span>
          <span className="text-text-muted">Tax for year: <span className="text-text-primary">{formatPhp(summaries[3]?.cumulativeTaxPhp ?? 0)}</span></span>
        </div>
      </section>

      {error !== null && <p className="text-[11px] text-bear-red font-mono px-1">{error}</p>}
      {isLoading && !hasLoaded && <p className="text-[11px] text-text-muted font-mono px-1 animate-pulse">Loading tax records…</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {summaries.map((s) => <TaxPeriodCard key={s.period} summary={s} />)}
      </div>

      <section className="bg-panel-bg border border-panel-border rounded-lg p-4 flex flex-col gap-3">
        <div className="text-xs text-text-muted font-mono">Log a receipt</div>
        <TaxEntryForm submitLabel="Add" onSubmit={addEntry} />
      </section>

      <section className="bg-panel-bg border border-panel-border rounded-lg p-4">
        <div className="text-xs text-text-muted font-mono mb-2">Receipts {selectedYear}</div>
        <TaxEntryList entries={yearEntries} />
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck, lint, run against real Supabase**

```bash
npm run typecheck && npm run lint
```

Before this step the Supabase project must exist with the migration applied and `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` in `.env`. Then `npm run dev`, open the Tax tab, and:
1. Add ₱200,000 dated Jan 15 and ₱100,000 dated May 15 of the current year. Q1 card shows tax due ₱0.00; Q2 shows ₱4,000.00; the Supabase table has two rows.
2. Edit the May entry to ₱150,000; Q2 shows ₱8,000.00.
3. Delete via ✕ then Confirm; totals update.
4. Mark Q1 as filed; the pill turns green; Unmark reverts it.
5. Switch year to last year; empty list message shows.
Fix anything off before committing.

- [ ] **Step 6: Commit**

```bash
git add src/components/tax
git commit -m "Add the Tax tab for logging receipts and tracking 1701Q/1701A

Quarter cards mirror how the BIR form is filled (cumulative gross,
exemption, credit for earlier quarters) so the number on screen is the
number that goes on the return."
```

---

### Task 11: Deadline banner and browser notifications

**Files:**
- Create: `src/hooks/useTaxDeadlines.ts`
- Create: `src/components/tax/EnableNotificationsButton.tsx`
- Create: `src/components/tax/TaxDeadlineBanner.tsx`
- Modify: `src/components/overview/OverviewSection.tsx` (mount banner)
- Modify: `src/components/tax/TaxSection.tsx` (mount button)
- Modify: `src/App.tsx` (mount hook)

**Interfaces:**
- Consumes: `summarisePeriods`, `nextActionablePeriod`, `todayIso` (Task 2); `planNotification` (Task 3); `useTaxStore` (Task 8); `getItem`/`setItem` from `@/lib/localStorage`; `sendNotification`, `getNotificationPermission`, `requestNotificationPermission` from `@/lib/notifications`.
- Produces:
  - `useTaxDeadlines(): TaxPeriodSummary | null` (selector-style; safe to call from several components) plus `useTaxDeadlineNotifier(): void` (side effect, mounted once in `App.tsx`).
  - `TaxDeadlineBanner`, `EnableNotificationsButton`.

- [ ] **Step 1: Write `src/hooks/useTaxDeadlines.ts`**

```ts
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
```

- [ ] **Step 2: Write `src/components/tax/EnableNotificationsButton.tsx`**

```tsx
import { useState } from 'react'
import { getNotificationPermission, requestNotificationPermission } from '@/lib/notifications'

/** Browsers grant Notification permission only from a user gesture, hence a button. */
export function EnableNotificationsButton() {
  const [permission, setPermission] = useState<NotificationPermission>(getNotificationPermission())

  if (permission !== 'default') return null

  return (
    <button
      type="button"
      onClick={() => {
        void requestNotificationPermission().then(setPermission)
      }}
      className="px-2.5 py-1 rounded border border-panel-border font-mono text-xs text-text-muted hover:text-text-primary hover:border-text-muted"
    >
      Enable notifications
    </button>
  )
}
```

- [ ] **Step 3: Write `src/components/tax/TaxDeadlineBanner.tsx`**

```tsx
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
          className="px-2.5 py-1 rounded border border-current font-mono text-xs hover:bg-white/5"
        >
          Open Tax
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Mount everything**

- `src/components/overview/OverviewSection.tsx`: import `TaxDeadlineBanner` from `@/components/tax/TaxDeadlineBanner` and replace the `{/* Task 11 mounts <TaxDeadlineBanner /> here */}` comment with `<TaxDeadlineBanner />`.
- `src/components/tax/TaxSection.tsx`: import `EnableNotificationsButton` and replace the `{/* Task 11 mounts <EnableNotificationsButton /> here */}` comment with `<EnableNotificationsButton />`.
- `src/App.tsx`: import `useTaxDeadlineNotifier` from `@/hooks/useTaxDeadlines` and call it in `AppInner` after `useTaxData()`.

- [ ] **Step 5: Verify in the browser**

```bash
npm run typecheck && npm run lint && npm test
```

Then in `npm run dev`:
1. With a quarter within 30 days of its deadline (add a receipt dated in the current quarter if needed, or pick a date when one is naturally due), the Overview shows the banner; muted beyond 7 days, orange at 7 or fewer, red when overdue.
2. Click "Enable notifications", accept. A browser notification appears once. Reload: it does not repeat. Check DevTools → Application → Local Storage for `tax-notified:*` keys.
3. Mark the period filed on the Tax tab, return to Overview: banner gone. Unmark: banner back.
4. If nothing is due within 30 days, the banner is absent and the Overview layout has no empty gap.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useTaxDeadlines.ts src/components/tax/EnableNotificationsButton.tsx src/components/tax/TaxDeadlineBanner.tsx src/components/overview/OverviewSection.tsx src/components/tax/TaxSection.tsx src/App.tsx
git commit -m "Warn about upcoming BIR deadlines on the Overview

A filing deadline is the one date this dashboard must not let slip, so
it surfaces on the landing page and as a browser notification. Permission
is requested from a button because browsers ignore silent requests, which
also unblocks the existing price alerts."
```

---

### Task 12: Documentation and final verification

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/roadmap.md`

- [ ] **Step 1: Update `CLAUDE.md`**

- Project Description: add "an Overview landing tab summarising crypto, stocks, and REITs, and a Tax tab for PH 8% flat-rate income tax with BIR deadline reminders."
- Tech Stack table: add `| Database | Supabase (Postgres, tax records only) | n/a |` and `| Tests | Vitest | n/a |`.
- Netlify Functions table (already lists `stock-positions.ts` and `utils/trading212-client.ts`; keep them): add rows for `tax-entries.ts` (`GET/POST/PUT/DELETE /api/tax-entries`, Session, "Tax receipts in Supabase"), `tax-filings.ts` (`GET/PUT/DELETE /api/tax-filings`, Session, "Filed periods"), `utils/supabase-client.ts`, `utils/tax-repo.ts`, `utils/tax-validation.ts`.
- Frontend structure: add `types/tax.ts`, `store/taxStore.ts`, `hooks/useTaxData.ts`, `hooks/useTaxDeadlines.ts`, `hooks/usePortfolioSummary.ts`, `lib/tax.ts`, `lib/taxNotifications.ts`, `lib/portfolioSummary.ts`, `lib/taxApi.ts`, `components/overview/`, `components/tax/`, `components/ui/`. Remove `components/portfolio/` and `BalanceCard`, `PriceTicker`, `AlertForm` entries that no longer exist.
- Commands: fix the `cd` path to `/home/jed/jed/meridian` and add `npm test`.
- Environment Variables: add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` with the note "service role key, server-side only, never `VITE_`".
- Important Rules, rule 4: replace with:
  > **Tax records live in Supabase; everything else stays stateless.** Only `tax_income_entries` and `tax_filings` are persisted server-side, and only through `netlify/functions/tax-*.ts` using the service role key. Alerts and the stock watchlist remain in localStorage. Adding another table is an architecture decision, not a convenience.
- Important Rules, rule 5: fix the working directory path.
- Add rule 9: "Tax math is pure and tested (`src/lib/tax.ts`). Components never compute tax; they render `TaxPeriodSummary`."
- Known Limitations: add "Deadline notifications fire only while the tab is open; the once-per-threshold markers are per browser." and "PH public holidays are not modelled in deadline rollover."

- [ ] **Step 2: Update `README.md`**

Add a "Supabase (tax records)" section: create a project, run `supabase/migrations/0001_tax.sql` in the SQL editor, copy the project URL and service role key into `.env` and Netlify environment variables. Add `npm test` to the commands list. Mention the Overview and Tax tabs in the feature list.

- [ ] **Step 3: Update `docs/roadmap.md`**

Under "Feature additions", add a short "Done" note for the Overview and Tax module and list follow-ups that were explicitly out of scope: trading-gain taxation, mixed-income formula, USD receipts, chat tools for tax entries, BIR holiday calendar.

- [ ] **Step 4: Full verification**

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

All four must pass. Then one last `npm run dev` pass through the manual checklist in the spec (section 5):
1. Fresh load lands on Overview with skeletons, then totals.
2. Tax tab entries and cards match hand-computed figures.
3. Banner and notification behave as in Task 11 step 5.
4. Mark filed / unmark toggles the banner.
5. Delete an entry; Supabase reflects it.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md docs/roadmap.md
git commit -m "Document the Overview tab, Tax module, and Supabase setup

The no-database rule changed; the project instructions have to say so
and explain the boundary so the next change does not widen it."
```

---

## Self-review

**Spec coverage**
- Overview layout (banner, hero, class cards, allocation, top holdings, states, Trading 212 currency handling): Task 9 and Task 11.
- Navigation default and Portfolio removal: Task 9.
- Tax constants, types, math, weekend rollover, cumulative credit, statuses, next actionable: Task 2.
- Supabase schema, RLS, env vars, functions, validation rules: Tasks 5, 6, 7.
- Client API, store, load on mount: Task 8.
- Tax tab (year selector, period cards, mark filed, entry form, grouped list, two-step delete, `formatPhp`): Tasks 1 and 10.
- Notifications (thresholds, once per browser, permission button, previous-year annual): Tasks 3 and 11.
- Tests (tax math, portfolio summary, handlers, validation, store): Tasks 1 to 8.
- Docs (CLAUDE.md rule 4, README, .env.example): Tasks 5 and 12.

**Type consistency**
- `TaxIncomeEntry`, `TaxIncomeEntryInput`, `TaxFiling`, `TaxPeriod`, `TaxPeriodSummary` defined in Task 2 and used unchanged after.
- Store actions `load / addEntry / editEntry / removeEntry / markFiled / unmarkFiled` named identically in Task 8 store, Task 8 tests, Task 10 components, Task 11 hook.
- Repo functions `listEntries / insertEntry / updateEntry / deleteEntry / listFilings / upsertFiling / deleteFiling` match between Task 5 and the Task 6 / 7 handlers and mocks.
- `http.ts` gains `created`, `noContent`, `notFound`, `STATUS.CREATED`, `STATUS.NOT_FOUND` in Task 6 before Task 7 uses them.
- `DashboardTab` union updated in Task 9 before `AssetClassCard` and `TaxDeadlineBanner` pass `'tax'` / class tabs.
