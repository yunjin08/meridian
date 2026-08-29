# Overview Dashboard and PH 8% Flat-Rate Tax Module

Date: 2026-08-30
Status: approved design, awaiting implementation plan

## Goal

Two additions to the investing dashboard:

1. An **Overview** tab that is the landing page. It summarises total portfolio value across crypto, stocks, and REITs and surfaces a tax filing deadline notice when one is near.
2. A **Tax** module for a purely self-employed Philippine taxpayer on the 8% flat-rate income tax option (non-VAT registered). The user logs gross receipts in PHP; the app computes quarterly and annual tax due, tracks BIR deadlines, and notifies the user as a deadline approaches.

## Decisions already made

| Question | Decision |
|---|---|
| Tax base | Manually entered freelance / professional gross receipts. Trading gains are not taxed by this module. |
| Currency | PHP only. No FX. |
| Taxpayer type | Purely self-employed / professional. ₱250,000 annual exemption applies. Forms: 1701Q (quarterly), 1701A (annual). |
| Persistence | Supabase (Postgres), accessed only through Netlify Functions with the service role key. The browser never talks to Supabase. |
| Landing page | New Overview tab replaces the existing Portfolio tab. |

## Out of scope

- Tax on realized trading gains, stock transaction tax, or any non-PHP income.
- Mixed-income earner formula (no exemption, form 1701).
- Moving alerts or the stock watchlist into Supabase.
- BIR form generation or e-filing.
- Chat assistant tools for tax entries.

## 1. Overview tab

### Navigation

- `DashboardTab` gains `'overview'` and loses `'portfolio'`.
- `TabBar` order: Overview, Crypto, Stocks, REITs, Tax.
- `navigationStore.activeTab` defaults to `'overview'`.
- `PortfolioSection` is deleted; its allocation and crypto breakdown move into the Overview.

### Layout (top to bottom)

1. **Tax deadline banner**: rendered only when `useTaxDeadlines` reports an unfiled period whose deadline is within 30 days or already past. Shows form name, period, deadline date, days remaining (or "overdue by N days"), and the amount due. Links to the Tax tab. Overdue uses `bear-red`, due within 7 days uses `btc-orange`, otherwise muted.
2. **Hero card**: total portfolio value in USD (`formatPrice`), 24h change in USD and percent, "as of" timestamp from the latest balance / quote fetch.
3. **Class cards** (three across on `lg`, stacked on mobile): Crypto, Stocks, REITs. Each shows value, share of total, 24h change, number of holdings, and a button that switches to that tab.
4. **Allocation bar**: one stacked horizontal bar, `btc-orange` / `bull-green` / `blue-400`, with a legend.
5. **Top holdings**: up to eight positions across all classes sorted by USD value, showing class tag, symbol, value, and share.

### Data

All values derive from existing stores. No new network calls.

- Crypto: `balanceStore.balance.totalUsdtValue`, holdings from `cryptoHoldingsStore`, 24h change per asset from `priceStore.prices[symbol].changePercent`.
- Stocks / REITs: `portfolioStore.stocks` filtered by `assetClass`, priced with `stockQuoteStore.quotes[ticker].price * shares`. Holdings without `shares` contribute zero and are counted separately as "unpriced".
- 24h change per class = Σ(value × changePercent / 100) over priced holdings.

A new pure helper `src/lib/portfolioSummary.ts` takes the store slices and returns `{ total, change24h, classes: { crypto, stock, reit }, topHoldings }`. It is unit tested.

### States

- Loading: skeleton blocks in the hero and class cards while `balanceStore.isLoading` or `stockQuoteStore.isLoading` and no data has arrived yet.
- Empty: when every stock lacks `shares`, the Stocks / REITs cards show "Add share counts to price these" instead of $0.00.
- Error: `balanceStore.error` or `stockQuoteStore.error` renders as a one-line muted notice under the hero, not as a blocking state.

## 2. Tax domain model and math

### Constants (`src/constants.ts`)

```ts
export const TAX_RATE = 0.08
export const TAX_ANNUAL_EXEMPTION_PHP = 250_000
export const TAX_DEADLINE_WARNING_DAYS = 30
export const TAX_NOTIFY_THRESHOLDS_DAYS = [30, 14, 7, 1] as const
```

### Types (`src/types/tax.ts`)

```ts
export type TaxPeriod = 'Q1' | 'Q2' | 'Q3' | 'ANNUAL'

export interface TaxIncomeEntry {
  id: string
  receivedOn: string      // ISO date, YYYY-MM-DD
  source: string
  amountPhp: number
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface TaxFiling {
  taxYear: number
  period: TaxPeriod
  filedOn: string         // ISO date
  amountPaidPhp: number
}

export type TaxPeriodStatus = 'upcoming' | 'due_soon' | 'overdue' | 'filed'

export interface TaxPeriodSummary {
  taxYear: number
  period: TaxPeriod
  form: '1701Q' | '1701A'
  periodStart: string
  periodEnd: string
  deadline: string        // ISO date, after weekend rollover
  grossPhp: number        // receipts inside this period
  cumulativeGrossPhp: number
  taxablePhp: number      // max(0, cumulativeGross - exemption)
  cumulativeTaxPhp: number
  taxDuePhp: number       // cumulativeTax - tax due in earlier periods of the year
  status: TaxPeriodStatus
  filing: TaxFiling | null
}
```

### Math (`src/lib/tax.ts`, pure)

- `quarterOf(date)`: Jan–Mar Q1, Apr–Jun Q2, Jul–Sep Q3, Oct–Dec Q4. Q4 receipts are settled on the annual return.
- `deadlineFor(taxYear, period)`: Q1 → May 15, Q2 → Aug 15, Q3 → Nov 15 of `taxYear`; ANNUAL → Apr 15 of `taxYear + 1`. If the date falls on Saturday or Sunday it rolls forward to Monday. Philippine public holidays are not modelled.
- `summarisePeriods(entries, filings, taxYear, today)`: returns four `TaxPeriodSummary` values in order Q1, Q2, Q3, ANNUAL.
  - `cumulativeGrossPhp` for Qn is the sum of receipts from Jan 1 through the end of Qn. For ANNUAL it is the full year.
  - `cumulativeTaxPhp = TAX_RATE * max(0, cumulativeGrossPhp - TAX_ANNUAL_EXEMPTION_PHP)`.
  - `taxDuePhp = cumulativeTaxPhp - (previous period's cumulativeTaxPhp)`, never below zero.
  - `status`: `filed` if a filing exists; otherwise `overdue` if `today > deadline`; `due_soon` if within `TAX_DEADLINE_WARNING_DAYS`; else `upcoming`.
- `nextActionablePeriod(summaries, today)`: the earliest period with status `overdue` or `due_soon`, or `null`. Overdue wins over due_soon. Feeds the banner and notifications.
- `daysUntil(deadline, today)`: signed integer, negative when past.

All date handling uses `YYYY-MM-DD` strings compared lexically, with helpers that construct dates at local midnight, to avoid timezone drift between browser and function.

## 3. Persistence: Supabase through Netlify Functions

### Schema (`supabase/migrations/0001_tax.sql`)

```sql
create table public.tax_income_entries (
  id uuid primary key default gen_random_uuid(),
  received_on date not null,
  source text not null,
  amount_php numeric(14,2) not null check (amount_php >= 0),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tax_filings (
  tax_year integer not null,
  period text not null check (period in ('Q1','Q2','Q3','ANNUAL')),
  filed_on date not null,
  amount_paid_php numeric(14,2) not null check (amount_paid_php >= 0),
  created_at timestamptz not null default now(),
  primary key (tax_year, period)
);

alter table public.tax_income_entries enable row level security;
alter table public.tax_filings enable row level security;
-- No policies: only the service role (used server-side) can read or write.

create index tax_income_entries_received_on_idx on public.tax_income_entries (received_on);
```

The migration is applied once by pasting into the Supabase SQL editor. The Supabase CLI is not installed locally and is not required.

### Environment variables

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

Never prefixed with `VITE_`. Documented in README and `.env.example`. Set in Netlify Site Settings for production.

### Server (`netlify/functions/`)

- `utils/supabase-client.ts`: creates one `@supabase/supabase-js` client per invocation from env, throws a clear error when env is missing. Exposes `SupabaseError` for the handlers.
- `tax-entries.ts`:
  - `GET /api/tax-entries[?year=YYYY]` → `{ entries: TaxIncomeEntry[] }` ordered by `received_on desc, created_at desc`. `year` is an optional four-digit filter; the client loads all rows once so the deadline banner can see the previous year's annual return.
  - `POST /api/tax-entries` with `{ receivedOn, source, amountPhp, note? }` → `{ entry }`.
  - `PUT /api/tax-entries?id=<uuid>` with the same body → `{ entry }`.
  - `DELETE /api/tax-entries?id=<uuid>` → 204.
- `tax-filings.ts`:
  - `GET /api/tax-filings[?year=YYYY]` → `{ filings: TaxFiling[] }`.
  - `PUT /api/tax-filings` with `{ taxYear, period, filedOn, amountPaidPhp }` → upsert, returns `{ filing }`.
  - `DELETE /api/tax-filings?year=YYYY&period=Q1` → 204 (unmark as filed).
- Every handler: `OPTIONS` preflight, `requireAuth`, method dispatch with `methodNotAllowed`, body validation returning `badRequest` with a specific message, Supabase failures returning `badGateway('supabase_error', { msg })`. Column names are mapped snake_case → camelCase in one `toEntry` / `toFiling` function per file.
- Validation rules: `receivedOn` matches `^\d{4}-\d{2}-\d{2}$` and parses to a real date; `source` non-empty, ≤ 120 chars; `amountPhp` finite, ≥ 0, ≤ 1e12; `note` ≤ 500 chars or null; `period` one of the four values; `taxYear` between 2000 and 2100.

### Client

- `src/lib/taxApi.ts`: typed `fetch` wrappers for the six operations, `credentials: 'include'`, throwing `Error` with the server's `error` message.
- `src/store/taxStore.ts` (not persisted): `selectedYear`, `entries`, `filings`, `isLoading`, `error`, setters. Default `selectedYear` is the current year.
- `src/store/taxStore.ts` owns the async actions `load`, `addEntry`, `editEntry`, `removeEntry`, `markFiled`, `unmarkFiled`; each mutation updates the store from the server's returned row (no reload). `src/hooks/useTaxData.ts` calls `load()` once on mount from `App.tsx` so the Overview banner has data on first load.

## 4. Tax tab and deadline notifications

### Tax tab (`src/components/tax/`)

- `TaxSection`: year selector (current year and the three before it), then `TaxPeriodCards`, then `TaxEntryForm` and `TaxEntryList`. Loading and error lines follow the pattern in `CryptoTradeDetails`.
- `TaxPeriodCards`: four cards (Q1, Q2, Q3, Annual). Each shows form, period range, deadline, days remaining, gross, taxable, tax due, and status pill. Unfiled cards have a "Mark as filed" button that reveals date + amount-paid inputs; filed cards show filed date, amount, and an "Unmark" link.
- `TaxEntryForm`: inline row with date (defaults to today), source, amount (PHP), optional note, Add button. Client-side validation mirrors the server rules. Editing an entry reuses the same form inline in its row.
- `TaxEntryList`: entries for the year, newest first, grouped by quarter with a subtotal per group. Delete asks for confirmation via a two-step button (click "Delete", then "Confirm"), no modal.
- Peso values use a new `formatPhp` in `formatters.ts` (`en-PH`, `PHP`, two decimals) and `font-mono`.

### Deadline notifications (`src/hooks/useTaxDeadlines.ts`)

- Derives `summarisePeriods` for the current tax year and also for the previous year while its ANNUAL period is unfiled (so an overdue annual return keeps showing after Apr 15). Returns `nextActionablePeriod` across both years.
- On change of the actionable period, finds the thresholds in `TAX_NOTIFY_THRESHOLDS_DAYS` where `daysUntil <= threshold` (or the single `overdue` marker). If any is unmarked in localStorage (`tax-notified:<year>:<period>:<threshold|overdue>`), sends one notification for the smallest threshold and marks all of them, so opening the app late yields one notice, not several. Markers are written only while permission is granted. Browsers only grant permission from a user gesture, so when `Notification.permission === 'default'` the banner and the Tax tab show an "Enable notifications" button that calls `requestNotificationPermission`. Nothing in the app requests permission today (the old `AlertForm` that did was removed), so this button also unblocks the existing price alerts.
- Marking a period filed clears its banner immediately (store update, no reload wait).

## 5. Testing and verification

### Tooling

Add `vitest` as a dev dependency. No DOM testing library: tests target pure modules and function handlers. Add `"test": "vitest run"` to `package.json`. Test files sit next to their subject as `*.test.ts`.

### Unit tests

- `src/lib/tax.test.ts`
  - Cumulative gross exactly ₱250,000 yields zero tax; ₱250,001 yields ₱0.08. Tax is computed in full precision and rounded to centavos only for display.
  - Q1 ₱200k, Q2 ₱100k: Q1 due 0, Q2 due 8% × 50k = 4,000; Q3 with no receipts due 0; Annual due 0 (all paid quarterly).
  - Receipts only in Q4 all land on ANNUAL.
  - Deadline rollover: a year where May 15 is a Saturday resolves to May 17.
  - Status transitions at exactly 30 days, 0 days, and 1 day past.
  - `nextActionablePeriod` prefers overdue over due_soon and returns null when everything is filed.
- `src/lib/portfolioSummary.test.ts`
  - Mixed classes, unpriced stocks counted but valued at zero, 24h change aggregation, top-eight truncation, all-empty input.
- `netlify/functions/tax-entries.test.ts` and `tax-filings.test.ts` with a mocked Supabase client
  - 401 without a session cookie, 405 on unsupported methods, 400 on each invalid field, snake_case → camelCase mapping, 502 when Supabase errors.

### Manual verification (against a real Supabase project in `netlify dev`)

1. Fresh load lands on Overview with skeletons, then real totals; class cards switch tabs.
2. Tax tab: add three entries across two quarters, confirm subtotals and period cards match hand-computed figures.
3. Set the system clock or entry dates so a deadline is within 7 days; banner appears in Overview with orange styling; browser notification fires once; reload does not re-fire it.
4. Mark the period filed; banner disappears; unmark; it returns.
5. Delete an entry; totals update; Supabase table reflects the change.
6. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.

## Documentation changes

- `CLAUDE.md`: rule 4 becomes "Tax records live in Supabase, accessed only through Netlify Functions with the service role key. Everything else remains stateless or localStorage." Add the two functions and the `tax` component / store / hook entries to the structure tables. Add the Supabase env vars to the Environment Variables section.
- `README.md`: Supabase setup (create project, run migration, set env vars).
- `.env.example`: add the two Supabase variables.
