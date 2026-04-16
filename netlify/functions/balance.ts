import type { Handler } from '@netlify/functions'
import { binanceFetch, binancePublicFetch, binanceSignedFetch, BinanceError } from './utils/binance-client.ts'
import { preflight, ok, badGateway, internalError } from './utils/http.ts'
import { requireAuth } from './utils/auth.ts'
import type { BinanceAccountResponse, BinanceFundingAsset, BinanceSpotPrice } from '../../src/types/binance.ts'
import type { AccountBalance } from '../../src/types/account.ts'
import type { CryptoHolding } from '../../src/types/portfolio.ts'

const MIN_USDT_VALUE = 1  // ignore dust below $1
const BRIDGE_QUOTES = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'BTC', 'ETH', 'BNB'] as const

function getPairPrice(base: string, quote: string, priceMap: ReadonlyMap<string, number>): number | null {
  const direct = priceMap.get(`${base}${quote}`)
  if (direct !== undefined) return direct

  const inverse = priceMap.get(`${quote}${base}`)
  if (inverse !== undefined && inverse > 0) return 1 / inverse

  return null
}

function getAssetUsdtPrice(asset: string, priceMap: ReadonlyMap<string, number>): number | null {
  if (asset === 'USDT') return 1

  const direct = getPairPrice(asset, 'USDT', priceMap)
  if (direct !== null) return direct

  // Fall back to one-hop conversions for assets without direct USDT pairs.
  for (const bridge of BRIDGE_QUOTES) {
    if (bridge === asset || bridge === 'USDT') continue

    const assetToBridge = getPairPrice(asset, bridge, priceMap)
    if (assetToBridge === null) continue

    const bridgeToUsdt = getPairPrice(bridge, 'USDT', priceMap)
    if (bridgeToUsdt === null) continue

    return assetToBridge * bridgeToUsdt
  }

  return null
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  try {
    // Fetch account (weight: 10, HMAC signed)
    const account = await binanceFetch<BinanceAccountResponse>('/api/v3/account')
    const fundingAssets = await binanceSignedFetch<BinanceFundingAsset[]>(
      'POST',
      '/sapi/v1/asset/get-funding-asset'
    )

    // Fetch all spot prices in one call (weight: 4, public)
    const allPrices = await binancePublicFetch<BinanceSpotPrice[]>('/api/v3/ticker/price')

    // Build a price map: symbol → price
    const priceMap = new Map<string, number>()
    for (const sp of allPrices) {
      priceMap.set(sp.symbol, Number.parseFloat(sp.price))
    }

    // Merge Spot + Funding balances by asset symbol.
    const totalsByAsset = new Map<string, { free: number; locked: number }>()
    for (const b of account.balances) {
      const free = Number.parseFloat(b.free)
      const locked = Number.parseFloat(b.locked)
      if (free + locked === 0) continue

      const current = totalsByAsset.get(b.asset)
      if (current) {
        current.free += free
        current.locked += locked
      } else {
        totalsByAsset.set(b.asset, { free, locked })
      }
    }
    for (const b of fundingAssets) {
      const free = Number.parseFloat(b.free)
      // Funding endpoint can expose extra unavailable amounts, include as locked.
      const locked = Number.parseFloat(b.locked)
        + Number.parseFloat(b.freeze ?? '0')
        + Number.parseFloat(b.withdrawing ?? '0')
      if (free + locked === 0) continue

      const current = totalsByAsset.get(b.asset)
      if (current) {
        current.free += free
        current.locked += locked
      } else {
        totalsByAsset.set(b.asset, { free, locked })
      }
    }

    const holdings: CryptoHolding[] = []
    let totalUsdtValue = 0

    for (const [asset, amount] of totalsByAsset.entries()) {
      const free = amount.free
      const locked = amount.locked
      const total = free + locked
      if (total === 0) continue
      if (asset === 'BTC') {
        console.log('[balance][BTC] raw balance', { free, locked, total })
      }

      let usdtValue: number | null = null
      const symbol = asset === 'USDT' ? 'USDT' : `${asset}USDT`
      const usdtPrice = getAssetUsdtPrice(asset, priceMap)
      if (asset === 'BTC') {
        console.log('[balance][BTC] pricing', {
          symbol,
          usdtPrice,
          computedUsdtValue: usdtPrice === null ? null : total * usdtPrice,
        })
      }
      if (usdtPrice !== null) {
        usdtValue = total * usdtPrice
      }

      // Filter dust
      if (usdtValue === null || usdtValue < MIN_USDT_VALUE) continue

      holdings.push({ asset, symbol, free, locked, usdtValue })
      totalUsdtValue += usdtValue
    }

    // Sort by USDT value descending
    holdings.sort((a, b) => (b.usdtValue ?? 0) - (a.usdtValue ?? 0))
    const btcHolding = holdings.find((h) => h.asset === 'BTC')
    console.log('[balance][BTC] final holding', btcHolding ?? null)

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
