import { describe, expect, it } from 'vitest'
import { bandSegments, buildPortfolioHistory, type HistoryEvent } from '@/lib/portfolioHistory'
import type { PortfolioHistoryPoint } from '@/types/pnl'

const DAY = 86_400_000
const D1 = Date.UTC(2026, 0, 1)   // 2026-01-01

function event(dayOffset: number, asset: string, qtyDelta: number, costDelta: number): HistoryEvent {
  return { time: D1 + dayOffset * DAY, asset, qtyDelta, costDelta }
}

function closes(entries: Array<[string, number]>): ReadonlyMap<string, number> {
  return new Map(entries)
}

describe('buildPortfolioHistory', () => {
  it('returns nothing when there are no events', () => {
    const h = buildPortfolioHistory([], new Map(), new Map(), '2026-01-05')
    expect(h.points).toEqual([])
    expect(h.daysAboveWater).toBe(0)
    expect(h.lastCrossedOn).toBeNull()
  })

  it('runs a day per calendar day from the first trade to today', () => {
    const h = buildPortfolioHistory(
      [event(0, 'BTC', 1, 100)],
      new Map([['BTC', closes([['2026-01-01', 100], ['2026-01-02', 110], ['2026-01-03', 90]])]]),
      new Map(),
      '2026-01-03',
    )
    expect(h.points.map((p) => p.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03'])
    expect(h.points.map((p) => p.spent)).toEqual([100, 100, 100])
    expect(h.points.map((p) => p.value)).toEqual([100, 110, 90])
    expect(h.daysAboveWater).toBe(2)      // day 1 breaks even, day 2 up
    expect(h.daysBelowWater).toBe(1)
    expect(h.lastCrossedOn).toBe('2026-01-03')
  })

  it('adds later purchases to spend and to the repriced holdings', () => {
    const h = buildPortfolioHistory(
      [event(0, 'BTC', 1, 100), event(2, 'BTC', 1, 80)],
      new Map([['BTC', closes([['2026-01-01', 100], ['2026-01-02', 90], ['2026-01-03', 80]])]]),
      new Map(),
      '2026-01-03',
    )
    expect(h.points.map((p) => p.spent)).toEqual([100, 100, 180])
    expect(h.points.map((p) => p.value)).toEqual([100, 90, 160])
  })

  it('deducts sale proceeds from spend and drops the sold coins from value', () => {
    const h = buildPortfolioHistory(
      [event(0, 'SOL', 10, 100), event(1, 'SOL', -4, -60)],
      new Map([['SOL', closes([['2026-01-01', 10], ['2026-01-02', 15]])]]),
      new Map(),
      '2026-01-02',
    )
    expect(h.points[0]).toEqual({ date: '2026-01-01', spent: 100, value: 100 })
    expect(h.points[1]).toEqual({ date: '2026-01-02', spent: 40, value: 90 })  // 6 left at 15
  })

  it('carries the last close forward over a day with no candle', () => {
    const h = buildPortfolioHistory(
      [event(0, 'BTC', 1, 100)],
      new Map([['BTC', closes([['2026-01-01', 100], ['2026-01-03', 120]])]]),
      new Map(),
      '2026-01-03',
    )
    expect(h.points.map((p) => p.value)).toEqual([100, 100, 120])
  })

  it('prices coins the history cannot explain as held throughout', () => {
    const h = buildPortfolioHistory(
      [event(0, 'BTC', 1, 100)],
      new Map([['BTC', closes([['2026-01-01', 100]])]]),
      new Map([['BTC', 0.5]]),
      '2026-01-01',
    )
    expect(h.points[0]?.value).toBe(150)   // 1 bought plus 0.5 untracked
    expect(h.points[0]?.spent).toBe(100)   // the untracked half cost nothing we know of
  })

  it('excludes coins that were bought here and later withdrawn', () => {
    // Bought 1 BTC, moved 0.4 to cold storage: the wallet holds 0.6 today, so the
    // curve must never price the 0.4 that left.
    const h = buildPortfolioHistory(
      [event(0, 'BTC', 1, 100)],
      new Map([['BTC', closes([['2026-01-01', 100], ['2026-01-02', 100]])]]),
      new Map([['BTC', -0.4]]),
      '2026-01-02',
    )
    expect(h.points.map((p) => p.value)).toEqual([60, 60])
    expect(h.points.map((p) => p.spent)).toEqual([100, 100])
  })

  it('never prices a holding that the offset drives negative', () => {
    const h = buildPortfolioHistory(
      [event(0, 'BTC', 1, 100)],
      new Map([['BTC', closes([['2026-01-01', 100]])]]),
      new Map([['BTC', -5]]),
      '2026-01-01',
    )
    expect(h.points[0]?.value).toBe(0)
  })

  it('contributes nothing for a coin with no price series', () => {
    const h = buildPortfolioHistory([event(0, 'NOPAIR', 5, 50)], new Map(), new Map(), '2026-01-01')
    expect(h.points[0]).toEqual({ date: '2026-01-01', spent: 50, value: 0 })
  })

  it('counts days on each side and remembers the last crossing', () => {
    const h = buildPortfolioHistory(
      [event(0, 'BTC', 1, 100)],
      new Map([['BTC', closes([
        ['2026-01-01', 120],   // above
        ['2026-01-02', 80],    // below, crossing
        ['2026-01-03', 130],   // above, crossing
        ['2026-01-04', 140],   // above
      ])]]),
      new Map(),
      '2026-01-04',
    )
    expect(h.daysAboveWater).toBe(3)
    expect(h.daysBelowWater).toBe(1)
    expect(h.lastCrossedOn).toBe('2026-01-03')
  })
})

describe('bandSegments', () => {
  function point(spent: number, value: number, i: number): PortfolioHistoryPoint {
    return { date: `2026-01-0${i + 1}`, spent, value }
  }

  it('needs at least two points', () => {
    expect(bandSegments([])).toEqual([])
    expect(bandSegments([point(10, 20, 0)])).toEqual([])
  })

  it('keeps one segment while the lines never cross', () => {
    const segments = bandSegments([point(10, 5, 0), point(10, 6, 1), point(10, 7, 2)])
    expect(segments).toHaveLength(1)
    expect(segments[0]?.above).toBe(false)
    expect(segments[0]?.points).toHaveLength(3)
  })

  it('splits at the crossing and both sides share that exact point', () => {
    // value goes 20 -> 0 while spent stays 10, so the lines cross halfway.
    const segments = bandSegments([point(10, 20, 0), point(10, 0, 1)])
    expect(segments).toHaveLength(2)
    expect(segments[0]?.above).toBe(true)
    expect(segments[1]?.above).toBe(false)

    const firstPoints = segments[0]?.points ?? []
    const crossing = firstPoints[firstPoints.length - 1]
    expect(crossing?.i).toBeCloseTo(0.5)
    expect(crossing?.spent).toBeCloseTo(10)
    expect(crossing?.value).toBeCloseTo(10)
    expect(segments[1]?.points[0]).toEqual(crossing)
  })

  it('drops a trailing segment that is only the crossing point', () => {
    const segments = bandSegments([point(10, 20, 0), point(10, 30, 1), point(10, 5, 2)])
    expect(segments).toHaveLength(2)
    expect(segments.every((s) => s.points.length >= 2)).toBe(true)
  })
})
