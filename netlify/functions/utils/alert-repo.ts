import { getSupabase, type AlertRow } from './supabase-client.ts'
import type { Alert, AlertCondition, AlertInput } from '../../../src/types/alert.ts'

export class SupabaseRepoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SupabaseRepoError'
  }
}

/** An alert plus the cron's private cross-detection state. */
export interface CronAlert extends Alert {
  lastPrice: number | null
}

function fail(context: string, error: { message: string }): never {
  console.error(`[alert-repo] ${context}:`, error.message)
  throw new SupabaseRepoError(error.message)
}

function toCondition(type: string, threshold: number | null): AlertCondition {
  if (type === 'macd_crossover' || type === 'macd_crossunder') return { type }
  if (type === 'rsi_above' || type === 'rsi_below') return { type, threshold: threshold ?? 0 }
  return { type: type as 'price_above' | 'price_below' | 'price_crosses', threshold: threshold ?? 0 }
}

function conditionColumns(condition: AlertCondition): { condition_type: string; threshold: number | null } {
  if ('threshold' in condition) return { condition_type: condition.type, threshold: condition.threshold }
  return { condition_type: condition.type, threshold: null }
}

function toAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    label: row.label,
    symbol: row.symbol,
    condition: toCondition(row.condition_type, row.threshold === null ? null : Number(row.threshold)),
    active: row.active,
    triggered: row.triggered,
    triggeredAt: row.triggered_at === null ? null : Date.parse(row.triggered_at),
    createdAt: Date.parse(row.created_at),
    autoReset: row.auto_reset,
  }
}

function toCronAlert(row: AlertRow): CronAlert {
  return { ...toAlert(row), lastPrice: row.last_price === null ? null : Number(row.last_price) }
}

export async function listAlerts(): Promise<Alert[]> {
  const { data, error } = await getSupabase()
    .from('alerts')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) fail('listAlerts', error)
  return (data ?? []).map(toAlert)
}

export async function insertAlert(input: AlertInput): Promise<Alert> {
  const cols = conditionColumns(input.condition)
  const { data, error } = await getSupabase()
    .from('alerts')
    .insert({
      label: input.label,
      symbol: input.symbol,
      condition_type: cols.condition_type,
      threshold: cols.threshold,
      active: true,
      triggered: false,
      auto_reset: input.autoReset,
    })
    .select('*')
    .single()
  if (error) fail('insertAlert', error)
  return toAlert(data)
}

export async function deleteAlert(id: string): Promise<boolean> {
  const { data, error } = await getSupabase().from('alerts').delete().eq('id', id).select('id')
  if (error) fail('deleteAlert', error)
  return (data ?? []).length > 0
}

export async function setActive(id: string, active: boolean): Promise<Alert | null> {
  const { data, error } = await getSupabase()
    .from('alerts')
    .update({ active, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) fail('setActive', error)
  return data === null ? null : toAlert(data)
}

/**
 * Sets the triggered latch. Called when the browser evaluator fires — which,
 * with a tab open, happens well ahead of the cron's next minute-tick. Reports
 * whether the alert was already triggered so the caller knows whether this is
 * a fresh transition (and should send the email itself) or a redundant call.
 */
export async function triggerAlert(id: string): Promise<{ alert: Alert | null; wasAlreadyTriggered: boolean }> {
  const { data: existing, error: selectError } = await getSupabase()
    .from('alerts')
    .select('triggered')
    .eq('id', id)
    .maybeSingle()
  if (selectError) fail('triggerAlert:select', selectError)
  const wasAlreadyTriggered = existing?.triggered ?? false

  const { data, error } = await getSupabase()
    .from('alerts')
    .update({ triggered: true, triggered_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) fail('triggerAlert:update', error)
  return { alert: data === null ? null : toAlert(data), wasAlreadyTriggered }
}

/** Clears the triggered latch so the alert can fire again. Used by the manual reset button and the cron's auto-reset. */
export async function clearTriggered(id: string): Promise<Alert | null> {
  const { data, error } = await getSupabase()
    .from('alerts')
    .update({ triggered: false, triggered_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .maybeSingle()
  if (error) fail('clearTriggered', error)
  return data === null ? null : toAlert(data)
}

export async function listActiveAlerts(): Promise<CronAlert[]> {
  const { data, error } = await getSupabase().from('alerts').select('*').eq('active', true)
  if (error) fail('listActiveAlerts', error)
  return (data ?? []).map(toCronAlert)
}

export async function markTriggered(id: string, triggeredAt: string): Promise<void> {
  const { error } = await getSupabase()
    .from('alerts')
    .update({ triggered: true, triggered_at: triggeredAt, updated_at: triggeredAt })
    .eq('id', id)
  if (error) fail('markTriggered', error)
}

export async function updateLastPrice(id: string, lastPrice: number): Promise<void> {
  const { error } = await getSupabase().from('alerts').update({ last_price: lastPrice }).eq('id', id)
  if (error) fail('updateLastPrice', error)
}
