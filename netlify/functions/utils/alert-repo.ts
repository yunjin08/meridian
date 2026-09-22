import { desc, eq } from 'drizzle-orm'
import { getDb, schema } from './db.ts'
import type { Alert, AlertCondition, AlertEditFields, AlertInput } from '../../../src/types/alert.ts'

export class AlertRepoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AlertRepoError'
  }
}

/** An alert plus the cron's private cross-detection state. */
export interface CronAlert extends Alert {
  lastPrice: number | null
}

type AlertRow = typeof schema.alerts.$inferSelect

async function run<T>(context: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[alert-repo] ${context}:`, message)
    throw new AlertRepoError(message)
  }
}

function toCondition(type: string, threshold: number | null): AlertCondition {
  if (type === 'macd_crossover' || type === 'macd_crossunder') return { type }
  if (type === 'rsi_above' || type === 'rsi_below') return { type, threshold: threshold ?? 0 }
  return { type: type as 'price_above' | 'price_below' | 'price_crosses', threshold: threshold ?? 0 }
}

function conditionColumns(condition: AlertCondition): { conditionType: string; threshold: string | null } {
  if ('threshold' in condition) return { conditionType: condition.type, threshold: String(condition.threshold) }
  return { conditionType: condition.type, threshold: null }
}

function toAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    label: row.label,
    symbol: row.symbol,
    condition: toCondition(row.conditionType, row.threshold === null ? null : Number(row.threshold)),
    active: row.active,
    triggered: row.triggered,
    triggeredAt: row.triggeredAt === null ? null : Date.parse(row.triggeredAt),
    createdAt: Date.parse(row.createdAt),
    autoReset: row.autoReset,
  }
}

function toCronAlert(row: AlertRow): CronAlert {
  return { ...toAlert(row), lastPrice: row.lastPrice === null ? null : Number(row.lastPrice) }
}

export async function listAlerts(): Promise<Alert[]> {
  return run('listAlerts', async () => {
    const rows = await getDb().select().from(schema.alerts).orderBy(desc(schema.alerts.createdAt))
    return rows.map(toAlert)
  })
}

export async function insertAlert(input: AlertInput): Promise<Alert> {
  return run('insertAlert', async () => {
    const cols = conditionColumns(input.condition)
    const [row] = await getDb()
      .insert(schema.alerts)
      .values({
        label: input.label,
        symbol: input.symbol,
        conditionType: cols.conditionType,
        threshold: cols.threshold,
        active: true,
        triggered: false,
        autoReset: input.autoReset,
      })
      .returning()
    if (!row) throw new Error('insert returned no row')
    return toAlert(row)
  })
}

export async function deleteAlert(id: string): Promise<boolean> {
  return run('deleteAlert', async () => {
    const rows = await getDb().delete(schema.alerts).where(eq(schema.alerts.id, id)).returning({ id: schema.alerts.id })
    return rows.length > 0
  })
}

export async function setActive(id: string, active: boolean): Promise<Alert | null> {
  return run('setActive', async () => {
    const [row] = await getDb()
      .update(schema.alerts)
      .set({ active, updatedAt: new Date().toISOString() })
      .where(eq(schema.alerts.id, id))
      .returning()
    return row === undefined ? null : toAlert(row)
  })
}

/** Flips active on or off. Read-then-write, not atomic — fine for a single-user app. */
export async function toggleActive(id: string): Promise<Alert | null> {
  const existing = await run('toggleActive:select', async () => {
    const [row] = await getDb().select({ active: schema.alerts.active }).from(schema.alerts).where(eq(schema.alerts.id, id))
    return row ?? null
  })
  if (existing === null) return null
  return setActive(id, !existing.active)
}

/**
 * Partial update — an omitted field keeps its stored value. Changing the
 * condition re-arms the alert (clears triggered/last_price), since whatever
 * the old trigger meant no longer applies to the new condition.
 */
export async function updateAlert(id: string, fields: AlertEditFields): Promise<Alert | null> {
  return run('updateAlert', async () => {
    const update: Partial<typeof schema.alerts.$inferInsert> = { updatedAt: new Date().toISOString() }
    if (fields.label !== undefined) update.label = fields.label
    if (fields.condition !== undefined) {
      const cols = conditionColumns(fields.condition)
      update.conditionType = cols.conditionType
      update.threshold = cols.threshold
      update.triggered = false
      update.triggeredAt = null
      update.lastPrice = null
    }
    if (fields.autoReset !== undefined) update.autoReset = fields.autoReset

    const [row] = await getDb().update(schema.alerts).set(update).where(eq(schema.alerts.id, id)).returning()
    return row === undefined ? null : toAlert(row)
  })
}

/** Clears the triggered latch so the alert can fire again. Used by the manual reset button and the cron's auto-reset. */
export async function clearTriggered(id: string): Promise<Alert | null> {
  return run('clearTriggered', async () => {
    const [row] = await getDb()
      .update(schema.alerts)
      .set({ triggered: false, triggeredAt: null, updatedAt: new Date().toISOString() })
      .where(eq(schema.alerts.id, id))
      .returning()
    return row === undefined ? null : toAlert(row)
  })
}

export async function listActiveAlerts(): Promise<CronAlert[]> {
  return run('listActiveAlerts', async () => {
    const rows = await getDb().select().from(schema.alerts).where(eq(schema.alerts.active, true))
    return rows.map(toCronAlert)
  })
}

export async function markTriggered(id: string, triggeredAt: string): Promise<void> {
  await run('markTriggered', async () => {
    await getDb()
      .update(schema.alerts)
      .set({ triggered: true, triggeredAt, updatedAt: triggeredAt })
      .where(eq(schema.alerts.id, id))
  })
}

export async function updateLastPrice(id: string, lastPrice: number): Promise<void> {
  await run('updateLastPrice', async () => {
    await getDb().update(schema.alerts).set({ lastPrice: String(lastPrice) }).where(eq(schema.alerts.id, id))
  })
}
