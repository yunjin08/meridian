import type { Handler } from '@netlify/functions'
import { binancePublicFetch, BinanceError } from './_binance-client.ts'
import type { BinanceTicker24h } from '../../src/types/binance.ts'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(), body: '' }
  }

  const params = event.queryStringParameters ?? {}
  const symbol = (params['symbol'] ?? 'BTCUSDT').toUpperCase()

  try {
    const ticker = await binancePublicFetch<BinanceTicker24h>('/api/v3/ticker/24hr', { symbol })

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        price: parseFloat(ticker.lastPrice),
        priceChangePercent: parseFloat(ticker.priceChangePercent),
        high24h: parseFloat(ticker.highPrice),
        low24h: parseFloat(ticker.lowPrice),
        volume24h: parseFloat(ticker.volume),
        fetchedAt: Date.now(),
      }),
    }
  } catch (err) {
    if (err instanceof BinanceError) {
      return {
        statusCode: 502,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'binance_error', code: err.code, msg: err.message }),
      }
    }
    console.error('[ticker] unexpected error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'internal_error' }),
    }
  }
}
