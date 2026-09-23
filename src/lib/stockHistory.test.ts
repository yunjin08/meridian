import { describe, expect, it } from 'vitest'
import { buildStockHistoryEvents, stockQtyByTicker } from '@/lib/stockHistory'
import type { StockFill } from '@/types/pnl'

const D1 = Date.UTC(2026, 0, 1)

function fill(overrides: Partial<StockFill>): StockFill {
  return {
    ticker: 'AAPL',
    side: 'BUY',
    qty: 10,
    netValue: 1000,
    instrumentCurrency: 'USD',
    fxRate: 1,
    isTrade: true,
    time: D1,
    ...overrides,
  }
}

describe('buildStockHistoryEvents', () => {
  it('turns a buy into shares in and money out', () => {
    const [event] = buildStockHistoryEvents([fill({ side: 'BUY', qty: 10, netValue: 1000 })])
    expect(event).toEqual({ time: D1, asset: 'AAPL', qtyDelta: 10, costDelta: 1000 })
  })

  it('turns a sell into shares out and money back', () => {
    const [event] = buildStockHistoryEvents([fill({ side: 'SELL', qty: 4, netValue: 480 })])
    expect(event).toEqual({ time: D1, asset: 'AAPL', qtyDelta: -4, costDelta: -480 })
  })

  it('moves shares but no cash for a corporate action', () => {
    // A 2-for-1 split adds shares with no wallet impact; cost basis must not move.
    const [event] = buildStockHistoryEvents([
      fill({ side: 'BUY', qty: 10, netValue: 0, isTrade: false }),
    ])
    expect(event).toEqual({ time: D1, asset: 'AAPL', qtyDelta: 10, costDelta: 0 })
  })

  it('keeps one event per fill in input order', () => {
    const events = buildStockHistoryEvents([
      fill({ ticker: 'AAPL' }),
      fill({ ticker: 'MSFT', qty: 5, netValue: 500 }),
    ])
    expect(events.map((e) => e.asset)).toEqual(['AAPL', 'MSFT'])
  })
})

describe('stockQtyByTicker', () => {
  it('nets buys against sells per ticker', () => {
    const held = stockQtyByTicker([
      fill({ ticker: 'AAPL', side: 'BUY', qty: 10 }),
      fill({ ticker: 'AAPL', side: 'SELL', qty: 3 }),
      fill({ ticker: 'MSFT', side: 'BUY', qty: 5 }),
    ])
    expect(held.get('AAPL')).toBe(7)
    expect(held.get('MSFT')).toBe(5)
  })
})
