import type { Handler } from '@netlify/functions'
import { t212Fetch, toDashboardTicker, Trading212Error } from './utils/trading212-client.ts'
import { preflight, ok, badGateway, internalError } from './utils/http.ts'
import { requireAuth } from './utils/auth.ts'
import type { Trading212AccountSummary, Trading212Position } from '../../src/types/trading212.ts'
import type { StockAccountSummary, StockPosition, StockPositionsResponse } from '../../src/types/portfolio.ts'

function toStockPosition(p: Trading212Position): StockPosition {
  return {
    ticker: toDashboardTicker(p.instrument.ticker),
    t212Ticker: p.instrument.ticker,
    name: p.instrument.name,
    quantity: p.quantity,
    avgPrice: p.averagePricePaid,
    currentPrice: p.currentPrice,
    currency: p.instrument.currency,
    currentValue: p.walletImpact.currentValue,
    totalCost: p.walletImpact.totalCost,
    unrealizedPnl: p.walletImpact.unrealizedProfitLoss,
    fxImpact: p.walletImpact.fxImpact,
    openedAt: Date.parse(p.createdAt),
  }
}

function toAccountSummary(s: Trading212AccountSummary): StockAccountSummary {
  return {
    currency: s.currency,
    totalValue: s.totalValue,
    cashAvailable: s.cash.availableToTrade,
    cashInPies: s.cash.inPies,
    cashReserved: s.cash.reservedForOrders,
    invested: s.investments.currentValue,
    investedCost: s.investments.totalCost,
    unrealizedPnl: s.investments.unrealizedProfitLoss,
    realizedPnl: s.investments.realizedProfitLoss,
  }
}

// Trading 212 limits are per account (positions 1 req/s, summary 1 req/5s) and
// shared by every open tab and any other tool on the account. Two page loads
// within five seconds used to fail the whole response and leave the stocks
// unpriced until the next poll. Each half is now remembered on the warm
// instance and served in place of a throttled fetch, flagged stale.
interface Cached<T> {
  value: T
  fetchedAt: number
}

let cachedPositions: Cached<StockPosition[]> | null = null
let cachedAccount: Cached<StockAccountSummary> | null = null

export function clearPositionsCache(): void {
  cachedPositions = null
  cachedAccount = null
}

function isThrottled(err: unknown): boolean {
  return err instanceof Trading212Error && (err.status === 429 || err.status === 408)
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  const [positionsResult, summaryResult] = await Promise.allSettled([
    t212Fetch<Trading212Position[]>('/equity/positions'),
    t212Fetch<Trading212AccountSummary>('/equity/account/summary'),
  ])

  const now = Date.now()
  let stale = false

  let positions: Cached<StockPosition[]> | null
  if (positionsResult.status === 'fulfilled') {
    positions = {
      value: positionsResult.value
        .filter((p) => p.quantity > 0)
        .map(toStockPosition)
        .sort((a, b) => b.currentValue - a.currentValue),
      fetchedAt: now,
    }
    cachedPositions = positions
  } else if (isThrottled(positionsResult.reason) && cachedPositions) {
    positions = cachedPositions
    stale = true
  } else {
    return failure(positionsResult.reason, 'positions')
  }

  let account: Cached<StockAccountSummary> | null
  if (summaryResult.status === 'fulfilled') {
    account = { value: toAccountSummary(summaryResult.value), fetchedAt: now }
    cachedAccount = account
  } else if (isThrottled(summaryResult.reason) && cachedAccount) {
    account = cachedAccount
    stale = true
  } else {
    return failure(summaryResult.reason, 'summary')
  }

  const response: StockPositionsResponse = {
    account: account.value,
    positions: positions.value,
    fetchedAt: Math.min(positions.fetchedAt, account.fetchedAt),
    ...(stale ? { stale: true } : {}),
  }
  return ok(response)
}

function failure(err: unknown, part: 'positions' | 'summary') {
  if (err instanceof Trading212Error) {
    return badGateway('trading212_error', { code: err.status, msg: err.message })
  }
  console.error(`[stock-positions] unexpected error fetching ${part}:`, err)
  return internalError('internal_error')
}
