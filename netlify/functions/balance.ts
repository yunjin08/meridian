import type { Handler } from '@netlify/functions'
import { binanceFetch, binancePublicFetch, BinanceError } from './_binance-client.ts'
import type { BinanceAccountResponse, BinanceSpotPrice } from '../../src/types/binance.ts'
import type { AccountBalance } from '../../src/types/account.ts'

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
  // Accept live price from frontend to avoid an extra Binance call
  const frontendPrice = params['price'] ? parseFloat(params['price']) : null

  try {
    // Fetch account (weight: 10, HMAC signed)
    const account = await binanceFetch<BinanceAccountResponse>('/api/v3/account')

    const btcAsset = account.balances.find((b) => b.asset === 'BTC')
    const usdtAsset = account.balances.find((b) => b.asset === 'USDT')

    const btc = parseFloat(btcAsset?.free ?? '0')
    const usdt = parseFloat(usdtAsset?.free ?? '0')

    // Get current BTC price — use frontend-supplied value if available (saves weight)
    let btcPrice = frontendPrice
    if (btcPrice === null || isNaN(btcPrice)) {
      const spot = await binancePublicFetch<BinanceSpotPrice>('/api/v3/ticker/price', {
        symbol: 'BTCUSDT',
      })
      btcPrice = parseFloat(spot.price)
    }

    const response: AccountBalance = {
      btc,
      usdt,
      btcInUsdt: btc * btcPrice,
      fetchedAt: Date.now(),
    }

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify(response),
    }
  } catch (err) {
    if (err instanceof BinanceError) {
      return {
        statusCode: 502,
        headers: corsHeaders(),
        body: JSON.stringify({ error: 'binance_error', code: err.code, msg: err.message }),
      }
    }
    console.error('[balance] unexpected error:', err)
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'internal_error' }),
    }
  }
}
