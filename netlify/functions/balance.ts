import type { Handler } from '@netlify/functions'
import { BinanceError } from './utils/binance-client.ts'
import { fetchAssetTotals, fetchPriceMap, getAssetUsdtPrice } from './utils/binance-holdings.ts'
import { preflight, ok, badGateway, internalError } from './utils/http.ts'
import { requireAuth } from './utils/auth.ts'
import type { AccountBalance } from '../../src/types/account.ts'
import type { CryptoHolding } from '../../src/types/portfolio.ts'

const MIN_USDT_VALUE = 1  // ignore dust below $1

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  try {
    const [totalsByAsset, priceMap] = await Promise.all([fetchAssetTotals(), fetchPriceMap()])

    const holdings: CryptoHolding[] = []
    let totalUsdtValue = 0

    for (const [asset, amount] of totalsByAsset.entries()) {
      const free = amount.free
      const locked = amount.locked
      const total = free + locked
      if (total === 0) continue

      const symbol = asset === 'USDT' ? 'USDT' : `${asset}USDT`
      const usdtPrice = getAssetUsdtPrice(asset, priceMap)
      if (usdtPrice === null) continue

      const usdtValue = total * usdtPrice
      if (usdtValue < MIN_USDT_VALUE) continue

      holdings.push({ asset, symbol, free, locked, usdtValue })
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
