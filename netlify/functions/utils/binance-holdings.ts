import { binanceFetch, binancePublicFetch, binanceSignedFetch } from './binance-client.ts'
import type { BinanceAccountResponse, BinanceFundingAsset, BinanceSpotPrice } from '../../../src/types/binance.ts'

// Shared by balance.ts and crypto-pnl.ts so both see the same wallet totals and prices.

export interface AssetTotal {
  free: number
  locked: number
}

const BRIDGE_QUOTES = ['USDT', 'USDC', 'FDUSD', 'BUSD', 'BTC', 'ETH', 'BNB'] as const

function addTotal(totals: Map<string, AssetTotal>, asset: string, free: number, locked: number): void {
  if (free + locked === 0) return
  const current = totals.get(asset)
  if (current) {
    current.free += free
    current.locked += locked
  } else {
    totals.set(asset, { free, locked })
  }
}

/** Spot plus Funding wallet balances merged by asset. Two signed calls. */
export async function fetchAssetTotals(): Promise<Map<string, AssetTotal>> {
  const account = await binanceFetch<BinanceAccountResponse>('/api/v3/account')
  const fundingAssets = await binanceSignedFetch<BinanceFundingAsset[]>(
    'POST',
    '/sapi/v1/asset/get-funding-asset',
  )

  const totals = new Map<string, AssetTotal>()
  for (const b of account.balances) {
    addTotal(totals, b.asset, Number.parseFloat(b.free), Number.parseFloat(b.locked))
  }
  for (const b of fundingAssets) {
    // Funding endpoint can expose extra unavailable amounts, include as locked.
    const locked = Number.parseFloat(b.locked)
      + Number.parseFloat(b.freeze ?? '0')
      + Number.parseFloat(b.withdrawing ?? '0')
    addTotal(totals, b.asset, Number.parseFloat(b.free), locked)
  }
  return totals
}

/** All spot prices in one public call (weight 4): symbol -> price. */
export async function fetchPriceMap(): Promise<Map<string, number>> {
  const allPrices = await binancePublicFetch<BinanceSpotPrice[]>('/api/v3/ticker/price')
  const priceMap = new Map<string, number>()
  for (const sp of allPrices) {
    priceMap.set(sp.symbol, Number.parseFloat(sp.price))
  }
  return priceMap
}

function getPairPrice(base: string, quote: string, priceMap: ReadonlyMap<string, number>): number | null {
  const direct = priceMap.get(`${base}${quote}`)
  if (direct !== undefined) return direct

  const inverse = priceMap.get(`${quote}${base}`)
  if (inverse !== undefined && inverse > 0) return 1 / inverse

  return null
}

/** USDT price of an asset, falling back to one-hop conversions through common quote assets. */
export function getAssetUsdtPrice(asset: string, priceMap: ReadonlyMap<string, number>): number | null {
  if (asset === 'USDT') return 1

  const direct = getPairPrice(asset, 'USDT', priceMap)
  if (direct !== null) return direct

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
