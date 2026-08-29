import { describe, expect, it } from 'vitest'
import { formatIsoDate, formatPhp, lastValue } from '@/lib/formatters'

describe('formatPhp', () => {
  it('formats pesos with two decimals and grouping', () => {
    expect(formatPhp(4000)).toBe('₱4,000.00')
    expect(formatPhp(0)).toBe('₱0.00')
    expect(formatPhp(1234567.891)).toBe('₱1,234,567.89')
  })
})

describe('formatIsoDate', () => {
  it('renders an ISO date as a medium date without timezone drift', () => {
    expect(formatIsoDate('2026-05-15')).toBe('May 15, 2026')
    expect(formatIsoDate('2026-01-01')).toBe('Jan 1, 2026')
  })
})

describe('lastValue', () => {
  it('returns the last finite value', () => {
    expect(lastValue([1, NaN, 3, NaN])).toBe(3)
    expect(lastValue([])).toBeNull()
  })
})
