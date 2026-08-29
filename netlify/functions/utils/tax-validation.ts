import { isValidIsoDate } from '../../../src/lib/isoDate.ts'
import type { TaxFiling, TaxIncomeEntryInput, TaxPeriod } from '../../../src/types/tax.ts'

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

const PERIODS: readonly TaxPeriod[] = ['Q1', 'Q2', 'Q3', 'ANNUAL']
const PERIOD_ERROR = 'period must be one of Q1, Q2, Q3, ANNUAL'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_AMOUNT = 999_999_999_999.99
const MAX_SOURCE_LENGTH = 120
const MAX_NOTE_LENGTH = 500

function invalid<T>(error: string): Validation<T> {
  return { ok: false, error }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAmount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT
}

function isTaxYear(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 2000 && value <= 2100
}

function isPeriod(value: unknown): value is TaxPeriod {
  return typeof value === 'string' && (PERIODS as readonly string[]).includes(value)
}

export function parseJsonBody(body: string | null): Validation<unknown> {
  if (body === null) return invalid('body must be valid JSON')
  try {
    return { ok: true, value: JSON.parse(body) as unknown }
  } catch {
    return invalid('body must be valid JSON')
  }
}

export function parseEntryInput(body: unknown): Validation<TaxIncomeEntryInput> {
  if (!isRecord(body)) return invalid('body must be a JSON object')

  const receivedOn = body['receivedOn']
  if (typeof receivedOn !== 'string' || !isValidIsoDate(receivedOn)) {
    return invalid('receivedOn must be a valid YYYY-MM-DD date')
  }

  const rawSource = body['source']
  const source = typeof rawSource === 'string' ? rawSource.trim() : ''
  if (source.length === 0) return invalid('source is required')
  if (source.length > MAX_SOURCE_LENGTH) return invalid(`source must be ${MAX_SOURCE_LENGTH} characters or fewer`)

  const amountPhp = body['amountPhp']
  if (!isAmount(amountPhp)) return invalid(`amountPhp must be a number between 0 and ${MAX_AMOUNT}`)

  const rawNote = body['note']
  let note: string | null = null
  if (typeof rawNote === 'string') {
    const trimmed = rawNote.trim()
    if (trimmed.length > MAX_NOTE_LENGTH) return invalid(`note must be ${MAX_NOTE_LENGTH} characters or fewer`)
    note = trimmed.length === 0 ? null : trimmed
  } else if (rawNote !== undefined && rawNote !== null) {
    return invalid('note must be a string or null')
  }

  return { ok: true, value: { receivedOn, source, amountPhp, note } }
}

export function parseFilingInput(body: unknown): Validation<TaxFiling> {
  if (!isRecord(body)) return invalid('body must be a JSON object')

  const taxYear = body['taxYear']
  if (!isTaxYear(taxYear)) return invalid('taxYear must be an integer between 2000 and 2100')

  const period = body['period']
  if (!isPeriod(period)) return invalid(PERIOD_ERROR)

  const filedOn = body['filedOn']
  if (typeof filedOn !== 'string' || !isValidIsoDate(filedOn)) {
    return invalid('filedOn must be a valid YYYY-MM-DD date')
  }

  const amountPaidPhp = body['amountPaidPhp']
  if (!isAmount(amountPaidPhp)) return invalid(`amountPaidPhp must be a number between 0 and ${MAX_AMOUNT}`)

  return { ok: true, value: { taxYear, period, filedOn, amountPaidPhp } }
}

export function parseYearParam(raw: string | undefined): Validation<number | null> {
  if (raw === undefined) return { ok: true, value: null }
  if (!/^\d{4}$/.test(raw)) return invalid('year must be a four-digit year between 2000 and 2100')
  const year = Number(raw)
  if (!isTaxYear(year)) return invalid('year must be a four-digit year between 2000 and 2100')
  return { ok: true, value: year }
}

export function parsePeriodParam(raw: string | undefined): Validation<TaxPeriod> {
  return isPeriod(raw) ? { ok: true, value: raw } : invalid(PERIOD_ERROR)
}

export function parseUuidParam(raw: string | undefined): Validation<string> {
  if (raw === undefined || !UUID_PATTERN.test(raw)) return invalid('id must be a UUID')
  return { ok: true, value: raw }
}
