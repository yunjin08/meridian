import { describe, expect, it } from 'vitest'
import { evaluateIndicatorAlert, evaluatePriceAlert, isIndicatorCondition, isPriceCondition } from '@/lib/alertEvaluation'
import type { Alert } from '@/types/alert'
import type { IndicatorData } from '@/types/candle'

function alert(condition: Alert['condition']): Alert {
  return {
    id: 'a1',
    label: 'x',
    symbol: 'BTCUSDT',
    condition,
    active: true,
    triggered: false,
    triggeredAt: null,
    createdAt: 0,
    autoReset: false,
  }
}

function indicators(overrides: Partial<IndicatorData> = {}): IndicatorData {
  return {
    rsi: [50],
    macd: { macdLine: [0], signalLine: [0], histogram: [0] },
    bollingerBands: { upper: [0], middle: [0], lower: [0] },
    ...overrides,
  }
}

describe('evaluatePriceAlert', () => {
  it('fires price_above when price exceeds the threshold', () => {
    const result = evaluatePriceAlert(alert({ type: 'price_above', threshold: 100 }), 101, null)
    expect(result.triggered).toBe(true)
  })

  it('does not fire price_above at or below the threshold', () => {
    expect(evaluatePriceAlert(alert({ type: 'price_above', threshold: 100 }), 100, null).triggered).toBe(false)
    expect(evaluatePriceAlert(alert({ type: 'price_above', threshold: 100 }), 99, null).triggered).toBe(false)
  })

  it('fires price_below when price drops under the threshold', () => {
    const result = evaluatePriceAlert(alert({ type: 'price_below', threshold: 100 }), 99, null)
    expect(result.triggered).toBe(true)
  })

  it('does not fire price_crosses without a previous price', () => {
    const result = evaluatePriceAlert(alert({ type: 'price_crosses', threshold: 100 }), 101, null)
    expect(result.triggered).toBe(false)
  })

  it('fires price_crosses when price moves from below to at-or-above the threshold', () => {
    const result = evaluatePriceAlert(alert({ type: 'price_crosses', threshold: 100 }), 100, 99)
    expect(result.triggered).toBe(true)
  })

  it('fires price_crosses when price moves from above to at-or-below the threshold', () => {
    const result = evaluatePriceAlert(alert({ type: 'price_crosses', threshold: 100 }), 100, 101)
    expect(result.triggered).toBe(true)
  })

  it('does not fire price_crosses when price stays on the same side', () => {
    const result = evaluatePriceAlert(alert({ type: 'price_crosses', threshold: 100 }), 105, 101)
    expect(result.triggered).toBe(false)
  })
})

describe('evaluateIndicatorAlert', () => {
  it('fires rsi_above when RSI exceeds the threshold', () => {
    const result = evaluateIndicatorAlert(alert({ type: 'rsi_above', threshold: 70 }), indicators({ rsi: [75] }))
    expect(result.triggered).toBe(true)
  })

  it('fires rsi_below when RSI drops under the threshold', () => {
    const result = evaluateIndicatorAlert(alert({ type: 'rsi_below', threshold: 30 }), indicators({ rsi: [25] }))
    expect(result.triggered).toBe(true)
  })

  it('does not fire rsi conditions when the RSI series is empty', () => {
    const result = evaluateIndicatorAlert(alert({ type: 'rsi_above', threshold: 70 }), indicators({ rsi: [] }))
    expect(result.triggered).toBe(false)
  })

  it('fires macd_crossover when the MACD line is above the signal line', () => {
    const macd = { macdLine: [1], signalLine: [0.5], histogram: [0.5] }
    const result = evaluateIndicatorAlert(alert({ type: 'macd_crossover' }), indicators({ macd }))
    expect(result.triggered).toBe(true)
  })

  it('fires macd_crossunder when the MACD line is below the signal line', () => {
    const macd = { macdLine: [-1], signalLine: [0.5], histogram: [-1.5] }
    const result = evaluateIndicatorAlert(alert({ type: 'macd_crossunder' }), indicators({ macd }))
    expect(result.triggered).toBe(true)
  })
})

describe('condition classification', () => {
  it('classifies price conditions', () => {
    expect(isPriceCondition(alert({ type: 'price_above', threshold: 1 }))).toBe(true)
    expect(isIndicatorCondition(alert({ type: 'price_above', threshold: 1 }))).toBe(false)
  })

  it('classifies indicator conditions', () => {
    expect(isPriceCondition(alert({ type: 'macd_crossover' }))).toBe(false)
    expect(isIndicatorCondition(alert({ type: 'rsi_above', threshold: 50 }))).toBe(true)
  })
})
