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
  /** Local-only sync for a mutation the chat assistant already ran server-side — no network call. */
  applySyncedEntry: (entry: TaxIncomeEntry) => void
  applySyncedEntryRemoval: (id: string) => void
  applySyncedFiling: (filing: TaxFiling) => void
  applySyncedFilingRemoval: (taxYear: number, period: TaxPeriod) => void
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

    applySyncedEntry: (entry) => {
      const entries = get().entries
      const exists = entries.some((e) => e.id === entry.id)
      set({ entries: sortEntries(exists ? entries.map((e) => (e.id === entry.id ? entry : e)) : [...entries, entry]) })
    },

    applySyncedEntryRemoval: (id) => set({ entries: get().entries.filter((e) => e.id !== id) }),

    applySyncedFiling: (filing) => {
      const others = get().filings.filter((f) => !(f.taxYear === filing.taxYear && f.period === filing.period))
      set({ filings: [...others, filing] })
    },

    applySyncedFilingRemoval: (taxYear, period) =>
      set({ filings: get().filings.filter((f) => !(f.taxYear === taxYear && f.period === period)) }),
  }
})
