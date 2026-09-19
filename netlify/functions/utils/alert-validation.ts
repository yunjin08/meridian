import type { AlertCondition, AlertConditionType, AlertInput } from '../../../src/types/alert.ts'

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_LABEL_LENGTH = 120
const MAX_SYMBOL_LENGTH = 20

const PRICE_TYPES: readonly AlertConditionType[] = ['price_above', 'price_below', 'price_crosses']
const RSI_TYPES: readonly AlertConditionType[] = ['rsi_above', 'rsi_below']
const MACD_TYPES: readonly AlertConditionType[] = ['macd_crossover', 'macd_crossunder']
const ALL_TYPES: readonly AlertConditionType[] = [...PRICE_TYPES, ...RSI_TYPES, ...MACD_TYPES]

function invalid<T>(error: string): Validation<T> {
  return { ok: false, error }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseJsonBody(body: string | null): Validation<unknown> {
  if (body === null) return invalid('body must be valid JSON')
  try {
    return { ok: true, value: JSON.parse(body) as unknown }
  } catch {
    return invalid('body must be valid JSON')
  }
}

export function parseUuidParam(raw: string | undefined): Validation<string> {
  if (raw === undefined || !UUID_PATTERN.test(raw)) return invalid('id must be a UUID')
  return { ok: true, value: raw }
}

function parseCondition(raw: unknown): Validation<AlertCondition> {
  if (!isRecord(raw)) return invalid('condition must be an object')
  const type = raw['type']
  if (typeof type !== 'string' || !(ALL_TYPES as readonly string[]).includes(type)) {
    return invalid(`condition.type must be one of ${ALL_TYPES.join(', ')}`)
  }
  const conditionType = type as AlertConditionType

  if ((MACD_TYPES as readonly string[]).includes(conditionType)) {
    return { ok: true, value: { type: conditionType as 'macd_crossover' | 'macd_crossunder' } }
  }

  const threshold = raw['threshold']
  if (typeof threshold !== 'number' || !Number.isFinite(threshold)) {
    return invalid('condition.threshold must be a finite number')
  }

  if ((RSI_TYPES as readonly string[]).includes(conditionType)) {
    if (threshold < 0 || threshold > 100) return invalid('RSI threshold must be between 0 and 100')
    return { ok: true, value: { type: conditionType as 'rsi_above' | 'rsi_below', threshold } }
  }

  // price_above | price_below | price_crosses
  if (threshold <= 0) return invalid('price threshold must be greater than 0')
  return { ok: true, value: { type: conditionType as 'price_above' | 'price_below' | 'price_crosses', threshold } }
}

export function parseAlertInput(body: unknown): Validation<AlertInput> {
  if (!isRecord(body)) return invalid('body must be a JSON object')

  const rawLabel = body['label']
  const label = typeof rawLabel === 'string' ? rawLabel.trim() : ''
  if (label.length === 0) return invalid('label is required')
  if (label.length > MAX_LABEL_LENGTH) return invalid(`label must be ${MAX_LABEL_LENGTH} characters or fewer`)

  const rawSymbol = body['symbol']
  const symbol = typeof rawSymbol === 'string' ? rawSymbol.trim().toUpperCase() : ''
  if (symbol.length === 0) return invalid('symbol is required')
  if (symbol.length > MAX_SYMBOL_LENGTH) return invalid(`symbol must be ${MAX_SYMBOL_LENGTH} characters or fewer`)

  const condition = parseCondition(body['condition'])
  if (!condition.ok) return condition

  const rawAutoReset = body['autoReset']
  if (rawAutoReset !== undefined && typeof rawAutoReset !== 'boolean') {
    return invalid('autoReset must be a boolean')
  }
  const autoReset = rawAutoReset ?? false

  return { ok: true, value: { label, symbol, condition: condition.value, autoReset } }
}

export type AlertPatch = { active: boolean } | { reset: true } | { trigger: true }

export function parsePatchInput(body: unknown): Validation<AlertPatch> {
  if (!isRecord(body)) return invalid('body must be a JSON object')
  if (typeof body['active'] === 'boolean') return { ok: true, value: { active: body['active'] } }
  if (body['reset'] === true) return { ok: true, value: { reset: true } }
  if (body['trigger'] === true) return { ok: true, value: { trigger: true } }
  return invalid('body must set "active" (boolean), "reset": true, or "trigger": true')
}
