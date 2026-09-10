import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HandlerEvent } from '@netlify/functions'
import type { Trading212AccountSummary, Trading212Position } from '../../../src/types/trading212.ts'
import type { StockPositionsResponse } from '../../../src/types/portfolio.ts'

vi.mock('../utils/auth.ts', () => ({
  requireAuth: vi.fn(() => null),
}))

vi.mock('../utils/trading212-client.ts', () => {
  class Trading212Error extends Error {
    constructor(public readonly status: number, message: string) {
      super(message)
    }
  }
  return {
    Trading212Error,
    t212Fetch: vi.fn(),
    toDashboardTicker: (t: string) => (t.split('_')[0] ?? t).replace(/[a-z]$/, '').toUpperCase(),
  }
})

import { t212Fetch, Trading212Error } from '../utils/trading212-client.ts'
import { clearPositionsCache, handler } from '../stock-positions.ts'

const event = { httpMethod: 'GET', headers: {} } as unknown as HandlerEvent

function position(ticker: string, currentValue: number): Trading212Position {
  return {
    instrument: { ticker, name: ticker, currency: 'USD' },
    quantity: 1,
    averagePricePaid: 100,
    currentPrice: currentValue,
    walletImpact: { currentValue, totalCost: 100, unrealizedProfitLoss: currentValue - 100, fxImpact: 0 },
    createdAt: '2026-01-01T00:00:00Z',
  } as unknown as Trading212Position
}

const summary = {
  currency: 'USD',
  totalValue: 500,
  cash: { availableToTrade: 10, inPies: 0, reservedForOrders: 0 },
  investments: { currentValue: 490, totalCost: 480, unrealizedProfitLoss: 10, realizedProfitLoss: 2 },
} as unknown as Trading212AccountSummary

function respond(positions: Trading212Position[] | Error, account: Trading212AccountSummary | Error) {
  vi.mocked(t212Fetch).mockImplementation(async (path: string) => {
    const v = path.includes('/positions') ? positions : account
    if (v instanceof Error) throw v
    return v as never
  })
}

beforeEach(() => {
  clearPositionsCache()
  vi.mocked(t212Fetch).mockReset()
})

describe('GET /api/stock-positions', () => {
  it('returns positions and the account summary, sorted by value', async () => {
    respond([position('CSPXl_EQ', 197), position('EQQQl_EQ', 250)], summary)
    const res = await handler(event, {} as never)
    const body = JSON.parse(res?.body ?? '{}') as StockPositionsResponse
    expect(res?.statusCode).toBe(200)
    expect(body.positions.map((p) => p.ticker)).toEqual(['EQQQ', 'CSPX'])
    expect(body.account.totalValue).toBe(500)
    expect(body.stale).toBeUndefined()
  })

  it('serves the remembered summary when Trading 212 throttles it, flagged stale', async () => {
    respond([position('CSPXl_EQ', 197)], summary)
    await handler(event, {} as never)

    respond([position('CSPXl_EQ', 199)], new Trading212Error(429, 'Trading 212 rate limit exceeded'))
    const res = await handler(event, {} as never)
    const body = JSON.parse(res?.body ?? '{}') as StockPositionsResponse
    expect(res?.statusCode).toBe(200)
    expect(body.stale).toBe(true)
    expect(body.positions[0]?.currentPrice).toBe(199)
    expect(body.account.totalValue).toBe(500)
  })

  it('serves both halves from memory when everything is throttled', async () => {
    respond([position('CSPXl_EQ', 197)], summary)
    await handler(event, {} as never)

    const limit = new Trading212Error(429, 'Trading 212 rate limit exceeded')
    respond(limit, limit)
    const res = await handler(event, {} as never)
    const body = JSON.parse(res?.body ?? '{}') as StockPositionsResponse
    expect(res?.statusCode).toBe(200)
    expect(body.stale).toBe(true)
    expect(body.positions).toHaveLength(1)
  })

  it('still fails when throttled with nothing remembered', async () => {
    const limit = new Trading212Error(429, 'Trading 212 rate limit exceeded')
    respond(limit, summary)
    const res = await handler(event, {} as never)
    expect(res?.statusCode).toBe(502)
    expect(JSON.parse(res?.body ?? '{}')).toMatchObject({ error: 'trading212_error', code: 429 })
  })

  it('does not paper over a rejected key with cached data', async () => {
    respond([position('CSPXl_EQ', 197)], summary)
    await handler(event, {} as never)
    respond([position('CSPXl_EQ', 197)], new Trading212Error(401, 'Trading 212 rejected the API key'))
    const res = await handler(event, {} as never)
    expect(res?.statusCode).toBe(502)
    expect(JSON.parse(res?.body ?? '{}')).toMatchObject({ code: 401 })
  })
})
