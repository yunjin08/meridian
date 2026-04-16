import type { Handler } from '@netlify/functions'
import { binancePublicFetch, BinanceError } from './utils/binance-client.ts'
import { preflight, ok, badGateway, internalError } from './utils/http.ts'
import type { BinanceTicker24h } from '../../src/types/binance.ts'

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()

  const params = event.queryStringParameters ?? {}
  const symbol = (params['symbol'] ?? 'BTCUSDT').toUpperCase()

  try {
    const ticker = await binancePublicFetch<BinanceTicker24h>('/api/v3/ticker/24hr', { symbol })

    return ok({
      price: parseFloat(ticker.lastPrice),
      priceChangePercent: parseFloat(ticker.priceChangePercent),
      high24h: parseFloat(ticker.highPrice),
      low24h: parseFloat(ticker.lowPrice),
      volume24h: parseFloat(ticker.volume),
      fetchedAt: Date.now(),
    })
  } catch (err) {
    if (err instanceof BinanceError) {
      return badGateway('binance_error', { code: err.code, msg: err.message })
    }
    console.error('[ticker] unexpected error:', err)
    return internalError('internal_error')
  }
}
