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
