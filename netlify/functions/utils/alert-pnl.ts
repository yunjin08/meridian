import { binanceFetch, BinanceError } from './binance-client.ts'
import { fetchAssetTotals } from './binance-holdings.ts'
import { computeAssetPnl } from '../../../src/lib/cryptoPnl.ts'
import type { BinanceMyTrade } from '../../../src/types/binance.ts'
import type { CryptoAssetPnl, SpotFill } from '../../../src/types/pnl.ts'

const MY_TRADES_LIMIT = 1000  // Binance maximum per call
const INVALID_SYMBOL_CODE = -1121

function toFill(raw: BinanceMyTrade): SpotFill {
  return {
    side: raw.isBuyer ? 'BUY' : 'SELL',
    qty: Number.parseFloat(raw.qty),
    quoteQty: Number.parseFloat(raw.quoteQty),
    commission: Number.parseFloat(raw.commission),
    commissionAsset: raw.commissionAsset,
    time: raw.time,
  }
}

async function fetchFills(symbol: string): Promise<SpotFill[]> {
  try {
    const raw = await binanceFetch<BinanceMyTrade[]>('/api/v3/myTrades', { symbol, limit: MY_TRADES_LIMIT })
    return raw.map(toFill)
  } catch (err) {
    if (err instanceof BinanceError && err.code === INVALID_SYMBOL_CODE) return []
    throw err
  }
}

/**
 * Cost basis and P&L for one asset, from spot trade history only — no fiat
 * purchases or P2P trades reconstructed. This is deliberately the cheap path
 * (one signed trades call plus the wallet totals) for the alert email, not
 * `crypto-pnl.ts`'s full reconstruction: that one windows 730 days of fiat
 * and P2P history across ~40 calls, too much load to run on every trigger.
 * If the position was built outside spot trading, `unknownCostQty` and/or
 * `untrackedQty` on the result come back nonzero — the caller's job to say
 * the cost basis is incomplete rather than present it as exact.
 */
export async function fetchSpotOnlyPnl(symbol: string, currentPrice: number): Promise<CryptoAssetPnl | null> {
  if (!symbol.endsWith('USDT')) return null
  const asset = symbol.slice(0, -4)

  const [totals, fills] = await Promise.all([fetchAssetTotals(), fetchFills(symbol)])
  const held = totals.get(asset)
  const heldQty = (held?.free ?? 0) + (held?.locked ?? 0)

  return computeAssetPnl({
    asset,
    heldQty,
    priceUsdt: currentPrice,
    fills,
    fiatOrders: [],
    usdPerFiat: () => null,
  })
}

export function buildBinanceTradeUrl(symbol: string): string {
  const asset = symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol
  return `https://www.binance.com/en/trade/${asset}_USDT`
}
