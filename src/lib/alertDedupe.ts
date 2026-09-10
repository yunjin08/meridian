import type { Alert, AlertCondition } from '@/types/alert'

function sameCondition(a: AlertCondition, b: AlertCondition): boolean {
  if (a.type !== b.type) return false
  const ta = 'threshold' in a ? a.threshold : null
  const tb = 'threshold' in b ? b.threshold : null
  return ta === tb
}

/**
 * The assistant may retry a turn and call add_alert twice for the same
 * request. Two alerts that watch the same symbol for the same condition are
 * one intent, so the second is treated as already applied.
 */
export function findDuplicateAlert(
  alerts: readonly Alert[],
  symbol: string,
  condition: AlertCondition
): Alert | undefined {
  const upper = symbol.toUpperCase()
  return alerts.find((a) => a.symbol.toUpperCase() === upper && sameCondition(a.condition, condition))
}
