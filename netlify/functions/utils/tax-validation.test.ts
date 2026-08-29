import { describe, expect, it } from 'vitest'
import {
  parseEntryInput,
  parseFilingInput,
  parseJsonBody,
  parsePeriodParam,
  parseUuidParam,
  parseYearParam,
} from './tax-validation.ts'

const validEntry = { receivedOn: '2026-03-05', source: 'Acme', amountPhp: 1500.5, note: null }

describe('parseEntryInput', () => {
  it('accepts a valid body and trims strings', () => {
    const result = parseEntryInput({ ...validEntry, source: '  Acme  ', note: ' paid late ' })
    expect(result).toEqual({ ok: true, value: { ...validEntry, source: 'Acme', note: 'paid late' } })
  })

  it('treats a missing or empty note as null', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { note: _omit, ...withoutNote } = validEntry
    expect(parseEntryInput(withoutNote)).toEqual({ ok: true, value: validEntry })
    expect(parseEntryInput({ ...validEntry, note: '   ' })).toEqual({ ok: true, value: validEntry })
  })

  it.each([
    [{ ...validEntry, receivedOn: '2026-02-30' }, 'receivedOn must be a valid YYYY-MM-DD date'],
    [{ ...validEntry, receivedOn: '5 March' }, 'receivedOn must be a valid YYYY-MM-DD date'],
    [{ ...validEntry, source: '' }, 'source is required'],
    [{ ...validEntry, source: 'x'.repeat(121) }, 'source must be 120 characters or fewer'],
    [{ ...validEntry, amountPhp: -1 }, 'amountPhp must be a number between 0 and 1e12'],
    [{ ...validEntry, amountPhp: '100' }, 'amountPhp must be a number between 0 and 1e12'],
    [{ ...validEntry, amountPhp: Number.NaN }, 'amountPhp must be a number between 0 and 1e12'],
    [{ ...validEntry, note: 'n'.repeat(501) }, 'note must be 500 characters or fewer'],
    [null, 'body must be a JSON object'],
    ['str', 'body must be a JSON object'],
  ])('rejects %j', (body, error) => {
    expect(parseEntryInput(body)).toEqual({ ok: false, error })
  })
})

describe('parseFilingInput', () => {
  const valid = { taxYear: 2026, period: 'Q1', filedOn: '2026-05-10', amountPaidPhp: 4000 }

  it('accepts a valid body', () => {
    expect(parseFilingInput(valid)).toEqual({ ok: true, value: valid })
  })

  it.each([
    [{ ...valid, taxYear: 1999 }, 'taxYear must be an integer between 2000 and 2100'],
    [{ ...valid, taxYear: 2026.5 }, 'taxYear must be an integer between 2000 and 2100'],
    [{ ...valid, period: 'Q4' }, 'period must be one of Q1, Q2, Q3, ANNUAL'],
    [{ ...valid, filedOn: '2026-13-01' }, 'filedOn must be a valid YYYY-MM-DD date'],
    [{ ...valid, amountPaidPhp: -5 }, 'amountPaidPhp must be a number between 0 and 1e12'],
  ])('rejects %j', (body, error) => {
    expect(parseFilingInput(body)).toEqual({ ok: false, error })
  })
})

describe('query param parsers', () => {
  it('parses year, allowing absence', () => {
    expect(parseYearParam(undefined)).toEqual({ ok: true, value: null })
    expect(parseYearParam('2026')).toEqual({ ok: true, value: 2026 })
    expect(parseYearParam('26')).toEqual({ ok: false, error: 'year must be a four-digit year between 2000 and 2100' })
    expect(parseYearParam('2101')).toEqual({ ok: false, error: 'year must be a four-digit year between 2000 and 2100' })
  })

  it('parses period', () => {
    expect(parsePeriodParam('ANNUAL')).toEqual({ ok: true, value: 'ANNUAL' })
    expect(parsePeriodParam('q1')).toEqual({ ok: false, error: 'period must be one of Q1, Q2, Q3, ANNUAL' })
    expect(parsePeriodParam(undefined)).toEqual({ ok: false, error: 'period must be one of Q1, Q2, Q3, ANNUAL' })
  })

  it('parses uuid', () => {
    expect(parseUuidParam('6f1c2a3e-4b5d-4c6e-8f7a-9b0c1d2e3f4a')).toEqual({ ok: true, value: '6f1c2a3e-4b5d-4c6e-8f7a-9b0c1d2e3f4a' })
    expect(parseUuidParam('123')).toEqual({ ok: false, error: 'id must be a UUID' })
    expect(parseUuidParam(undefined)).toEqual({ ok: false, error: 'id must be a UUID' })
  })

  it('parses JSON bodies', () => {
    expect(parseJsonBody('{"a":1}')).toEqual({ ok: true, value: { a: 1 } })
    expect(parseJsonBody('{oops')).toEqual({ ok: false, error: 'body must be valid JSON' })
    expect(parseJsonBody(null)).toEqual({ ok: false, error: 'body must be valid JSON' })
  })
})
