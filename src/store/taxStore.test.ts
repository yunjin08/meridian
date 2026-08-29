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
