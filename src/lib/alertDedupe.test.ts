import { describe, expect, it } from 'vitest'
import { findDuplicateAlert } from './alertDedupe'
import type { Alert } from '@/types/alert'

function alert(symbol: string, condition: Alert['condition']): Alert {
  return {
    id: crypto.randomUUID(), label: 'x', symbol, condition, active: true, triggered: false,
    triggeredAt: null, createdAt: 0, lastEvaluatedPrice: null, autoReset: false, autoResetAt: null,
  }
}

describe('findDuplicateAlert', () => {
  const existing = [
    alert('BTCUSDT', { type: 'price_below', threshold: 77_873.7 }),
    alert('ETHUSDT', { type: 'macd_crossover' }),
  ]

  it('matches the same symbol, type and threshold regardless of case', () => {
    expect(findDuplicateAlert(existing, 'btcusdt', { type: 'price_below', threshold: 77_873.7 })).toBe(existing[0])
    expect(findDuplicateAlert(existing, 'ETHUSDT', { type: 'macd_crossover' })).toBe(existing[1])
  })

  it('does not match a different threshold, type or symbol', () => {
    expect(findDuplicateAlert(existing, 'BTCUSDT', { type: 'price_below', threshold: 77_000 })).toBeUndefined()
    expect(findDuplicateAlert(existing, 'BTCUSDT', { type: 'price_above', threshold: 77_873.7 })).toBeUndefined()
    expect(findDuplicateAlert(existing, 'SOLUSDT', { type: 'price_below', threshold: 77_873.7 })).toBeUndefined()
  })
})
