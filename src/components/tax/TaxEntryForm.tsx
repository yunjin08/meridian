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
