// Turns Trading 212 order-history fills into the same generic history events the
// crypto curve uses, so stocks and crypto share one since-inception chart.
// This module is bundled into a Netlify Function, so it must stay free of `@/`
// imports (that esbuild run has no path alias).
import type { HistoryEvent } from './portfolioHistory.ts'
import type { StockFill } from '../types/pnl.ts'

/**
 * One event per fill. Cost comes from `netValue`, which Trading 212 already
 * reports in the account currency with fees and taxes folded in, so a buy adds
 * exactly the cash that left the wallet and a sell removes exactly what came
 * back. Corporate actions (splits, distributions) move shares without moving
 * cash, so they carry a quantity delta but zero cost; the holdings offset the
 * caller applies then reconciles any share drift against today's real position.
 */
export function buildStockHistoryEvents(fills: readonly StockFill[]): HistoryEvent[] {
  const events: HistoryEvent[] = []
  for (const fill of fills) {
    const sign = fill.side === 'BUY' ? 1 : -1
    events.push({
      time: fill.time,
      asset: fill.ticker,
      qtyDelta: sign * fill.qty,
      costDelta: fill.isTrade ? sign * fill.netValue : 0,
    })
  }
  return events
}

/**
 * Shares each ticker's fills leave it holding, summed. The caller subtracts this
 * from today's real position to get the offset that anchors the curve's final
 * point to the actual portfolio value (mirrors the crypto side).
 */
export function stockQtyByTicker(fills: readonly StockFill[]): Map<string, number> {
  const held = new Map<string, number>()
  for (const fill of fills) {
    const sign = fill.side === 'BUY' ? 1 : -1
    held.set(fill.ticker, (held.get(fill.ticker) ?? 0) + sign * fill.qty)
  }
  return held
}
