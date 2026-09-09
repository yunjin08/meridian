import type { Handler } from '@netlify/functions'
import { BinanceError } from './utils/binance-client.ts'
import { EmptyKlinesError, fetchCandlesWithIndicators, VALID_INTERVALS } from './utils/klines.ts'
import { preflight, ok, badRequest, badGateway, internalError, unauthorized } from './utils/http.ts'
import { isAuthorized, isPublicMarketRequest } from './utils/auth.ts'

const MAX_LIMIT = 1000
// Anonymous landing-page traffic gets enough history for the indicators but
// not the full window, so a public visitor costs less Binance weight than the owner.
export const PUBLIC_CANDLE_LIMIT = 200

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const authorized = isAuthorized(event)
  if (!authorized && !isPublicMarketRequest(event)) return unauthorized('unauthorized')

  const params = event.queryStringParameters ?? {}
  const symbol = (params['symbol'] ?? 'BTCUSDT').toUpperCase()
  const interval = params['interval'] ?? '1h'
  const maxLimit = authorized ? MAX_LIMIT : PUBLIC_CANDLE_LIMIT
  const limit = Math.min(Math.max(Number.parseInt(params['limit'] ?? '500', 10), 50), maxLimit)

  if (!VALID_INTERVALS.has(interval)) return badRequest('Invalid interval')

  try {
    return ok(await fetchCandlesWithIndicators(symbol, interval, limit))
  } catch (err) {
    if (err instanceof EmptyKlinesError) return badGateway(err.message)
    if (err instanceof BinanceError) {
      return badGateway('binance_error', { code: err.code, msg: err.message })
    }
    console.error('[candles] unexpected error:', err)
    return internalError('internal_error')
  }
}
