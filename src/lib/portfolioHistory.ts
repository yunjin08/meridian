// Daily "what I put in" versus "what it is worth" since the first purchase.
// This module is bundled into a Netlify Function, so it must stay free of
// `@/` imports (that esbuild run has no path alias).
import { addDays, toIsoDate } from './isoDate.ts'
import type { PortfolioHistory, PortfolioHistoryPoint } from '../types/pnl.ts'

/** One acquisition or disposal. `costDelta` is positive for money spent, negative for proceeds. */
export interface HistoryEvent {
  time: number            // ms epoch
  asset: string
  qtyDelta: number        // positive when coins arrive, negative when they leave
  costDelta: number
}

export type DailyCloses = ReadonlyMap<string, ReadonlyMap<string, number>>

export const EMPTY_PORTFOLIO_HISTORY: PortfolioHistory = {
  points: [],
  daysAboveWater: 0,
  daysBelowWater: 0,
  lastCrossedOn: null,
}

/**
 * Walks every day from the first event to today, applying that day's trades and
 * repricing the resulting holdings at the day's close.
 *
 * `holdingsOffset` reconciles the trade history with the wallet: positive for
 * coins the history cannot explain (transfers in, Convert, rewards), negative
 * for coins that were bought here and later withdrawn. Neither movement carries
 * a date we can read, so the offset applies from the first day. That keeps the
 * final point equal to the portfolio's real value today, which matters more
 * than the distortion it adds to earlier days.
 */
export function buildPortfolioHistory(
  events: readonly HistoryEvent[],
  prices: DailyCloses,
  holdingsOffset: ReadonlyMap<string, number>,
  today: string,
): PortfolioHistory {
  const sorted = [...events].sort((a, b) => a.time - b.time)
  const first = sorted[0]
  if (first === undefined) return EMPTY_PORTFOLIO_HISTORY

  const holdings = new Map<string, number>(holdingsOffset)
  const lastPrice = new Map<string, number>()
  const points: PortfolioHistoryPoint[] = []
  let spent = 0
  let cursor = 0
  let date = toIsoDate(new Date(first.time))

  while (date <= today) {
    for (; cursor < sorted.length; cursor += 1) {
      const event = sorted[cursor]
      if (event === undefined || toIsoDate(new Date(event.time)) > date) break
      holdings.set(event.asset, (holdings.get(event.asset) ?? 0) + event.qtyDelta)
      spent += event.costDelta
    }

    // Carry the last close forward so a missing day does not zero a coin out.
    for (const [asset, series] of prices) {
      const close = series.get(date)
      if (close !== undefined) lastPrice.set(asset, close)
    }

    let value = 0
    for (const [asset, qty] of holdings) {
      if (qty <= 0) continue
      const price = lastPrice.get(asset)
      if (price !== undefined) value += qty * price
    }

    points.push({ date, spent, value })
    date = addDays(date, 1)
  }

  let daysAboveWater = 0
  let daysBelowWater = 0
  let lastCrossedOn: string | null = null
  let previousAbove: boolean | null = null
  for (const point of points) {
    const above = point.value >= point.spent
    if (above) daysAboveWater += 1
    else daysBelowWater += 1
    if (previousAbove !== null && above !== previousAbove) lastCrossedOn = point.date
    previousAbove = above
  }

  return { points, daysAboveWater, daysBelowWater, lastCrossedOn }
}

/** A point on the band between the two lines. `i` is fractional where the lines cross. */
export interface BandPoint {
  i: number
  spent: number
  value: number
}

export interface BandSegment {
  above: boolean          // value at or above spent for this stretch
  points: BandPoint[]
}

/**
 * Splits the gap between the two lines into runs that are wholly above or wholly
 * below water, inserting the exact crossing point between runs so the shaded
 * areas meet cleanly instead of overlapping.
 */
export function bandSegments(points: readonly PortfolioHistoryPoint[]): BandSegment[] {
  if (points.length < 2) return []

  const segments: BandSegment[] = []
  let current: BandSegment | null = null

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i]
    if (point === undefined) continue
    const above = point.value >= point.spent

    if (current === null) {
      current = { above, points: [] }
    } else if (above !== current.above) {
      const previous = points[i - 1]
      if (previous !== undefined) {
        const dPrev = previous.value - previous.spent
        const dNow = point.value - point.spent
        const t = dPrev / (dPrev - dNow)
        const crossing: BandPoint = {
          i: i - 1 + t,
          spent: previous.spent + (point.spent - previous.spent) * t,
          value: previous.value + (point.value - previous.value) * t,
        }
        current.points.push(crossing)
        segments.push(current)
        current = { above, points: [crossing] }
      } else {
        segments.push(current)
        current = { above, points: [] }
      }
    }

    current.points.push({ i, spent: point.spent, value: point.value })
  }

  if (current !== null && current.points.length > 1) segments.push(current)
  return segments
}
