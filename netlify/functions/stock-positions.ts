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

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  try {
    // positions: 1 req/s, summary: 1 req/5s. One call each per poll.
    const [rawPositions, rawSummary] = await Promise.all([
      t212Fetch<Trading212Position[]>('/equity/positions'),
      t212Fetch<Trading212AccountSummary>('/equity/account/summary'),
    ])

    const positions = rawPositions
      .filter((p) => p.quantity > 0)
      .map(toStockPosition)
      .sort((a, b) => b.currentValue - a.currentValue)

    const response: StockPositionsResponse = {
      account: toAccountSummary(rawSummary),
      positions,
      fetchedAt: Date.now(),
    }
    return ok(response)
  } catch (err) {
    if (err instanceof Trading212Error) {
      return badGateway('trading212_error', { code: err.status, msg: err.message })
    }
    console.error('[stock-positions] unexpected error:', err)
    return internalError('internal_error')
  }
}
