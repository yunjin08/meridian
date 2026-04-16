import type { Handler } from '@netlify/functions'
import { finnhubFetch, FinnhubError } from './utils/finnhub-client.ts'
import { preflight, ok, badRequest, badGateway, internalError } from './utils/http.ts'
import { requireAuth } from './utils/auth.ts'
import type { FinnhubQuote } from '../../src/types/finnhub.ts'
import type { StockQuote } from '../../src/types/portfolio.ts'

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  const params = event.queryStringParameters ?? {}
  const tickersParam = params['tickers'] ?? ''
  if (!tickersParam) return badRequest('tickers parameter is required')

  const tickers = tickersParam
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t) => t.length > 0)

  if (tickers.length === 0) return badRequest('No valid tickers provided')

  try {
    const results = await Promise.all(
      tickers.map(async (ticker): Promise<StockQuote | null> => {
        try {
          const q = await finnhubFetch<FinnhubQuote>('/quote', { symbol: ticker })
          if (!q.c) return null  // no data for this symbol
          return {
            ticker,
            price: q.c,
            change: q.d,
            changePercent: q.dp,
            high: q.h,
            low: q.l,
            fetchedAt: Date.now(),
          }
        } catch {
          return null  // skip tickers that fail individually
        }
      })
    )

    const quotes = results.filter((q): q is StockQuote => q !== null)
    return ok(quotes)
  } catch (err) {
    if (err instanceof FinnhubError) {
      return badGateway('finnhub_error', { msg: err.message })
    }
    console.error('[stock-quotes] unexpected error:', err)
    return internalError('internal_error')
  }
}
