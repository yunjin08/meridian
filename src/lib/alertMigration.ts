import type { AlertCondition, AlertInput } from '@/types/alert'

// Alerts used to live only in localStorage via Zustand's `persist` middleware
// under this key. Now that alerts are server-backed (so the cron can email
// them), anything still sitting here on first load is pre-migration data from
// an earlier session and gets pushed to the server once.
const LEGACY_STORAGE_KEY = 'dashboard-alerts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toLegacyInput(raw: unknown): AlertInput | null {
  if (!isRecord(raw)) return null
  const { label, symbol, condition, autoReset } = raw
  if (typeof label !== 'string' || typeof symbol !== 'string' || !isRecord(condition)) return null
  if (typeof condition['type'] !== 'string') return null
  return {
    label,
    symbol,
    condition: condition as unknown as AlertCondition,
    autoReset: typeof autoReset === 'boolean' ? autoReset : false,
  }
}

/** Reads and clears any pre-migration localStorage alerts. Safe to call every load — returns [] once migrated. */
export function takeLegacyAlerts(): AlertInput[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (raw === null) return []
    localStorage.removeItem(LEGACY_STORAGE_KEY)

    const parsed = JSON.parse(raw) as { state?: { alerts?: unknown[] } }
    const alerts = parsed.state?.alerts
    if (!Array.isArray(alerts)) return []
    return alerts.map(toLegacyInput).filter((a): a is AlertInput => a !== null)
  } catch {
    return []
  }
}
