import { API_BASE } from '@/constants'
import type { TaxFiling, TaxIncomeEntry, TaxIncomeEntryInput, TaxPeriod } from '@/types/tax'

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config: RequestInit = {
    credentials: 'include',
    ...init,
  }
  if (init.body !== undefined) {
    config.headers = { 'Content-Type': 'application/json' }
  }
  const res = await fetch(`${API_BASE}${path}`, config)
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
