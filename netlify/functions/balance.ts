import type { Handler } from '@netlify/functions'
import { binanceFetch, binancePublicFetch, BinanceError } from './utils/binance-client.ts'
import { preflight, ok, badGateway, internalError } from './utils/http.ts'
import type { BinanceAccountResponse, BinanceSpotPrice } from '../../src/types/binance.ts'
import type { AccountBalance } from '../../src/types/account.ts'
import type { CryptoHolding } from '../../src/types/portfolio.ts'

const MIN_USDT_VALUE = 1  // ignore dust below $1

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()

  try {
    // Fetch account (weight: 10, HMAC signed)
    const account = await binanceFetch<BinanceAccountResponse>('/api/v3/account')

    // Fetch all spot prices in one call (weight: 4, public)
    const allPrices = await binancePublicFetch<BinanceSpotPrice[]>('/api/v3/ticker/price')

    // Build a price map: symbol → price
    const priceMap = new Map<string, number>()
    for (const sp of allPrices) {
      priceMap.set(sp.symbol, parseFloat(sp.price))
    }

    const holdings: CryptoHolding[] = []
    let totalUsdtValue = 0

    for (const b of account.balances) {
      const free = parseFloat(b.free)
      const locked = parseFloat(b.locked)
      const total = free + locked
      if (total === 0) continue

      let usdtValue: number | null = null
      let symbol: string

      if (b.asset === 'USDT') {
        // USDT is already in USDT
        usdtValue = total
        symbol = 'USDT'
      } else {
        symbol = `${b.asset}USDT`
        const spotPrice = priceMap.get(symbol)
        if (spotPrice !== undefined) {
          usdtValue = total * spotPrice
        }
      }

      // Filter dust
      if (usdtValue === null || usdtValue < MIN_USDT_VALUE) continue

      holdings.push({ asset: b.asset, symbol, free, locked, usdtValue })
      totalUsdtValue += usdtValue
    }

    // Sort by USDT value descending
    holdings.sort((a, b) => (b.usdtValue ?? 0) - (a.usdtValue ?? 0))

    const response: AccountBalance = {
      holdings,
      totalUsdtValue,
      fetchedAt: Date.now(),
    }

    return ok(response)
  } catch (err) {
    if (err instanceof BinanceError) {
      return badGateway('binance_error', { code: err.code, msg: err.message })
    }
    console.error('[balance] unexpected error:', err)
    return internalError('internal_error')
  }
}
