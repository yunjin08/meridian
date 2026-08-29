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
        <button type="button" onClick={() => setIsEditing(true)} className="px-1.5 py-0.5 rounded border border-panel-border text-text-muted hover:text-text-primary" title="Edit" aria-label="Edit receipt">✎</button>
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
            <button type="button" onClick={() => { setConfirmDelete(false); setDeleteError(null) }} className="px-1.5 py-0.5 rounded border border-panel-border text-text-muted">Keep</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="px-1.5 py-0.5 rounded text-bear-red/60 hover:text-bear-red" title="Delete" aria-label="Delete receipt">✕</button>
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
