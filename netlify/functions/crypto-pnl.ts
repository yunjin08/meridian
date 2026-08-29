import type { Handler } from '@netlify/functions'
import { binanceFetch, BinanceError } from './utils/binance-client.ts'
import { fetchAssetTotals, fetchPriceMap, getAssetUsdtPrice } from './utils/binance-holdings.ts'
import { preflight, ok, badGateway, internalError } from './utils/http.ts'
import { requireAuth } from './utils/auth.ts'
import {
  buildFiatRateLookup,
  computeAssetPnl,
  summariseFunding,
  totalCryptoPnl,
} from '../../src/lib/cryptoPnl.ts'
import type { BinanceFiatPayment, BinanceFiatPaymentsResponse, BinanceMyTrade } from '../../src/types/binance.ts'
import type { CryptoPnlResponse, FiatOrder, SpotFill } from '../../src/types/pnl.ts'

const MIN_USDT_VALUE = 1                 // same dust threshold as balance.ts
const MY_TRADES_LIMIT = 1000             // Binance maximum per call
const FIAT_HISTORY_LOOKBACK_DAYS = 730
const FIAT_WINDOW_DAYS = 90              // sapi history endpoints default to 30 days; 90-day windows keep the call count low
const FIAT_ROWS = 500                    // Binance maximum per page
const FIAT_MAX_PAGES = 10                // a window with more than 5,000 fiat orders is not a personal account
const RETRY_ATTEMPTS = 2                 // one retry on a transient Binance failure
const RETRY_DELAY_MS = 300
const CONCURRENCY = 6
const MS_PER_DAY = 86_400_000
const INVALID_SYMBOL_CODE = -1121

function isTransient(err: unknown): boolean {
  if (err instanceof BinanceError) return err.code === 429 || err.code === -1003 || err.code >= 500
  return err instanceof TypeError   // fetch network failure
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= RETRY_ATTEMPTS || !isTransient(err)) throw err
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * attempt))
    }
  }
}

async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next
      next += 1
      const item = items[index]
      if (item === undefined) continue
      results[index] = await fn(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

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

async function fetchFills(asset: string): Promise<SpotFill[]> {
  try {
    const raw = await withRetry(() => binanceFetch<BinanceMyTrade[]>('/api/v3/myTrades', {
      symbol: `${asset}USDT`,
      limit: MY_TRADES_LIMIT,
    }))
    return raw.map(toFill)
  } catch (err) {
    // Assets without a USDT pair have no spot history to read.
    if (err instanceof BinanceError && err.code === INVALID_SYMBOL_CODE) return []
    throw err
  }
}

// For a buy, sourceAmount is the full fiat charge (fee included) and obtainAmount
// the crypto credited; for a sell, sourceAmount is the crypto debited and
// obtainAmount the fiat received net of fee. totalFee is therefore already inside
// the amounts we use and must not be added again.
function toFiatOrder(raw: BinanceFiatPayment, side: 'BUY' | 'SELL'): FiatOrder {
  const source = Number.parseFloat(raw.sourceAmount)
  const obtain = Number.parseFloat(raw.obtainAmount)
  return {
    side,
    fiatCurrency: raw.fiatCurrency,
    cryptoCurrency: raw.cryptoCurrency,
    fiatAmount: side === 'BUY' ? source : obtain,
    cryptoAmount: side === 'BUY' ? obtain : source,
    time: raw.createTime,
  }
}

async function fetchFiatWindow(transactionType: '0' | '1', beginTime: number, endTime: number): Promise<BinanceFiatPayment[]> {
  const rows: BinanceFiatPayment[] = []
  for (let page = 1; page <= FIAT_MAX_PAGES; page += 1) {
    const res = await withRetry(() => binanceFetch<BinanceFiatPaymentsResponse>('/sapi/v1/fiat/payments', {
      transactionType,
      beginTime,
      endTime,
      page,
      rows: FIAT_ROWS,
    }))
    const data = res.data ?? []
    rows.push(...data)
    if (data.length < FIAT_ROWS || rows.length >= res.total) break
  }
  return rows
}

interface FiatHistory {
  orders: FiatOrder[]
  warnings: string[]
}

/**
 * Fiat Buy/Sell Crypto orders over the lookback. A failure here degrades to
 * spot-only P&L with a warning instead of failing the whole request, because
 * the fiat endpoint is the flakiest call in this handler and the least essential.
 */
async function fetchFiatOrders(now: number): Promise<FiatHistory> {
  const windows: Array<{ type: '0' | '1'; begin: number; end: number }> = []
  const start = now - FIAT_HISTORY_LOOKBACK_DAYS * MS_PER_DAY
  for (let end = now; end > start; end -= FIAT_WINDOW_DAYS * MS_PER_DAY) {
    const begin = Math.max(start, end - FIAT_WINDOW_DAYS * MS_PER_DAY)
    windows.push({ type: '0', begin, end })
    windows.push({ type: '1', begin, end })
  }

  try {
    const pages = await mapWithConcurrency(windows, CONCURRENCY, (w) => fetchFiatWindow(w.type, w.begin, w.end))
    const orders: FiatOrder[] = []
    const seen = new Set<string>()
    windows.forEach((w, i) => {
      for (const raw of pages[i] ?? []) {
        const key = `${w.type}:${raw.orderNo}`
        if (raw.status !== 'Completed' || seen.has(key)) continue
        seen.add(key)
        orders.push(toFiatOrder(raw, w.type === '0' ? 'BUY' : 'SELL'))
      }
    })
    return { orders, warnings: [] }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    console.error('[crypto-pnl] fiat history unavailable:', msg)
    return {
      orders: [],
      warnings: [`Fiat purchase history unavailable (${msg}); cost basis uses spot fills only.`],
    }
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return preflight()
  const unauthorizedResponse = requireAuth(event)
  if (unauthorizedResponse) return unauthorizedResponse

  try {
    const now = Date.now()
    const [totals, priceMap, fiat] = await Promise.all([
      fetchAssetTotals(),
      fetchPriceMap(),
      fetchFiatOrders(now),
    ])
    const fiatOrders = fiat.orders

    // Same set the Crypto tab shows: priced, non-dust, and not the quote currency itself.
    const held: Array<{ asset: string; qty: number; price: number }> = []
    for (const [asset, amount] of totals.entries()) {
      if (asset === 'USDT') continue
      const qty = amount.free + amount.locked
      const price = getAssetUsdtPrice(asset, priceMap)
      if (price === null || qty * price < MIN_USDT_VALUE) continue
      held.push({ asset, qty, price })
    }

    const fills = await mapWithConcurrency(held, CONCURRENCY, (h) => fetchFills(h.asset))
    const usdPerFiat = buildFiatRateLookup(fiatOrders)

    const assets = held.map((h, i) =>
      computeAssetPnl({
        asset: h.asset,
        heldQty: h.qty,
        priceUsdt: h.price,
        fills: fills[i] ?? [],
        fiatOrders,
        usdPerFiat,
      }),
    )
    assets.sort((a, b) => (b.currentValueUsdt ?? 0) - (a.currentValueUsdt ?? 0))

    const response: CryptoPnlResponse = {
      assets,
      totals: totalCryptoPnl(assets),
      funding: summariseFunding(fiatOrders),
      warnings: fiat.warnings,
      fetchedAt: now,
    }
    return ok(response)
  } catch (err) {
    if (err instanceof BinanceError) {
      return badGateway('binance_error', { code: err.code, msg: err.message })
    }
    console.error('[crypto-pnl] unexpected error:', err)
    return internalError('internal_error')
  }
}
