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
            8% flat rate, non-VAT, purely self-employed. <span className="font-mono">{formatPhp(TAX_ANNUAL_EXEMPTION_PHP)}</span> annual exemption, rate {TAX_RATE * 100}%.
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
        {summaries.map((s) => <TaxPeriodCard key={`${s.taxYear}-${s.period}`} summary={s} />)}
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
