import type { Handler } from '@netlify/functions'
import { binanceFetch, BinanceError } from './utils/binance-client.ts'
import { preflight, ok, badRequest, badGateway, internalError } from './utils/http.ts'
import { requireAuth } from './utils/auth.ts'
import type { BinanceMyTrade } from '../../src/types/binance.ts'
import type { CryptoTrade, TradesResponse } from '../../src/types/trade.ts'

const SYMBOL_PATTERN = /^[A-Z0-9]{6,20}$/

function toCryptoTrade(raw: BinanceMyTrade): CryptoTrade {
  return {
    id: raw.id,
    orderId: raw.orderId,
    symbol: raw.symbol,
    side: raw.isBuyer ? 'BUY' : 'SELL',
    price: Number.parseFloat(raw.price),
    qty: Number.parseFloat(raw.qty),
    quoteQty: Number.parseFloat(raw.quoteQty),
    commission: Number.parseFloat(raw.commission),
    commissionAsset: raw.commissionAsset,
    time: raw.time,
    isMaker: raw.isMaker,
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  const params = event.queryStringParameters ?? {}
  const symbol = (params['symbol'] ?? 'BTCUSDT').toUpperCase()
  const limit = Math.min(Math.max(Number.parseInt(params['limit'] ?? '200', 10), 1), 1000)

  if (!SYMBOL_PATTERN.test(symbol)) {
    return badRequest('Invalid symbol')
  }

  try {
    const rawTrades = await binanceFetch<BinanceMyTrade[]>('/api/v3/myTrades', {
      symbol,
      limit,
    })
    const trades = rawTrades
      .map(toCryptoTrade)
      .sort((a, b) => b.time - a.time)

    const response: TradesResponse = {
      symbol,
      trades,
      fetchedAt: Date.now(),
    }
    return ok(response)
  } catch (err) {
    if (err instanceof BinanceError) {
      return badGateway('binance_error', { code: err.code, msg: err.message })
    }
    console.error('[trades] unexpected error:', err)
    return internalError('internal_error')
  }
}
