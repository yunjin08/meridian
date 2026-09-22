import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { getDb, schema } from './db.ts'
import type { TaxFiling, TaxIncomeEntry, TaxIncomeEntryInput, TaxPeriod } from '../../../src/types/tax.ts'

export class TaxRepoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TaxRepoError'
  }
}

type EntryRow = typeof schema.taxIncomeEntries.$inferSelect
type FilingRow = typeof schema.taxFilings.$inferSelect

async function run<T>(context: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[tax-repo] ${context}:`, message)
    throw new TaxRepoError(message)
  }
}

function toEntry(row: EntryRow): TaxIncomeEntry {
  return {
    id: row.id,
    receivedOn: row.receivedOn,
    source: row.source,
    amountPhp: Number(row.amountPhp),
    note: row.note,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

function toFiling(row: FilingRow): TaxFiling {
  return {
    taxYear: row.taxYear,
    period: row.period as TaxPeriod,   // constrained by tax-validation.ts on write
    filedOn: row.filedOn,
    amountPaidPhp: Number(row.amountPaidPhp),
  }
}

export async function listEntries(year: number | null): Promise<TaxIncomeEntry[]> {
  return run('listEntries', async () => {
    const { taxIncomeEntries: t } = schema
    const where = year === null ? undefined : and(gte(t.receivedOn, `${year}-01-01`), lte(t.receivedOn, `${year}-12-31`))
    const rows = await getDb()
      .select()
      .from(t)
      .where(where)
      .orderBy(desc(t.receivedOn), desc(t.createdAt))
    return rows.map(toEntry)
  })
}

export async function insertEntry(input: TaxIncomeEntryInput): Promise<TaxIncomeEntry> {
  return run('insertEntry', async () => {
    const [row] = await getDb()
      .insert(schema.taxIncomeEntries)
      .values({
        receivedOn: input.receivedOn,
        source: input.source,
        amountPhp: String(input.amountPhp),
        note: input.note,
      })
      .returning()
    if (!row) throw new Error('insert returned no row')
    return toEntry(row)
  })
}

export async function updateEntry(id: string, input: TaxIncomeEntryInput): Promise<TaxIncomeEntry | null> {
  return run('updateEntry', async () => {
    const [row] = await getDb()
      .update(schema.taxIncomeEntries)
      .set({
        receivedOn: input.receivedOn,
        source: input.source,
        amountPhp: String(input.amountPhp),
        note: input.note,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.taxIncomeEntries.id, id))
      .returning()
    return row === undefined ? null : toEntry(row)
  })
}

export async function deleteEntry(id: string): Promise<boolean> {
  return run('deleteEntry', async () => {
    const rows = await getDb()
      .delete(schema.taxIncomeEntries)
      .where(eq(schema.taxIncomeEntries.id, id))
      .returning({ id: schema.taxIncomeEntries.id })
    return rows.length > 0
  })
}

export async function listFilings(year: number | null): Promise<TaxFiling[]> {
  return run('listFilings', async () => {
    const { taxFilings: t } = schema
    const where = year === null ? undefined : eq(t.taxYear, year)
    const rows = await getDb().select().from(t).where(where).orderBy(desc(t.taxYear))
    return rows.map(toFiling)
  })
}

export async function upsertFiling(input: TaxFiling): Promise<TaxFiling> {
  return run('upsertFiling', async () => {
    const { taxFilings: t } = schema
    const [row] = await getDb()
      .insert(t)
      .values({
        taxYear: input.taxYear,
        period: input.period,
        filedOn: input.filedOn,
        amountPaidPhp: String(input.amountPaidPhp),
      })
      .onConflictDoUpdate({
        target: [t.taxYear, t.period],
        set: { filedOn: input.filedOn, amountPaidPhp: String(input.amountPaidPhp) },
      })
      .returning()
    if (!row) throw new Error('upsert returned no row')
    return toFiling(row)
  })
}

export async function deleteFiling(taxYear: number, period: TaxPeriod): Promise<boolean> {
  return run('deleteFiling', async () => {
    const { taxFilings: t } = schema
    const rows = await getDb()
      .delete(t)
      .where(and(eq(t.taxYear, taxYear), eq(t.period, period)))
      .returning({ taxYear: t.taxYear })
    return rows.length > 0
  })
}
