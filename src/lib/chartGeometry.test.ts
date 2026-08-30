import { describe, expect, it } from 'vitest'
import { bandPath, buildScales, linePath, type ChartBox } from '@/lib/chartGeometry'

const box: ChartBox = { width: 100, height: 50, padLeft: 0, padRight: 0, padTop: 0, padBottom: 0 }

describe('buildScales', () => {
  it('spreads points across the full width and anchors the y axis at zero', () => {
    const scales = buildScales(box, 3, 100)
    expect(scales.x(0)).toBe(0)
    expect(scales.x(2)).toBe(100)
    expect(scales.y(0)).toBe(50)                 // zero sits on the baseline
    expect(scales.y(108)).toBeCloseTo(0)         // headroom is 8 percent above the peak
  })

  it('survives a single point and an all-zero series', () => {
    expect(buildScales(box, 1, 0).x(0)).toBe(0)
    expect(buildScales(box, 1, 0).y(0)).toBe(50)
  })

  it('respects padding', () => {
    const padded = buildScales({ ...box, padLeft: 10, padRight: 10, padTop: 5, padBottom: 5 }, 2, 100)
    expect(padded.x(0)).toBe(10)
    expect(padded.x(1)).toBe(90)
    expect(padded.y(0)).toBe(45)
  })
})

describe('linePath', () => {
  it('moves to the first point and draws to the rest', () => {
    const scales = buildScales(box, 3, 100)
    // y is scaled against 108, the peak plus its 8 percent headroom.
    expect(linePath([0, 50, 100], scales)).toBe('M0.00 50.00 L50.00 26.85 L100.00 3.70')
  })
})

describe('bandPath', () => {
  it('traces the value line out and the spent line back, then closes', () => {
    const scales = buildScales(box, 2, 100)
    const d = bandPath([{ i: 0, spent: 0, value: 100 }, { i: 1, spent: 0, value: 100 }], scales)
    expect(d.startsWith('M0.00')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d.split('L')).toHaveLength(4)   // one out, two back
  })
})
