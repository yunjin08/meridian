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
import type {
  BinanceC2cHistoryResponse,
  BinanceC2cOrder,
  BinanceFiatPayment,
  BinanceFiatPaymentsResponse,
  BinanceMyTrade,
} from '../../src/types/binance.ts'
import type { CryptoPnlResponse, FiatOrder, SpotFill } from '../../src/types/pnl.ts'

const MIN_USDT_VALUE = 1                 // same dust threshold as balance.ts
const MY_TRADES_LIMIT = 1000             // Binance maximum per call
const HISTORY_LOOKBACK_DAYS = 730
const FIAT_WINDOW_DAYS = 90              // fiat payments: no documented cap, 30-day default; 90 keeps the call count low
const FIAT_ROWS = 500                    // Binance maximum per page
const P2P_WINDOW_DAYS = 30               // c2c history: documented 30-day maximum interval
const P2P_ROWS = 100                     // Binance maximum per page
const MAX_PAGES = 10                     // a window with thousands of orders is not a personal account
const RETRY_ATTEMPTS = 2                 // one retry on a transient Binance failure
const RETRY_DELAY_MS = 300
const CONCURRENCY = 8
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
    source: 'fiat',
    side,
    fiatCurrency: raw.fiatCurrency,
    cryptoCurrency: raw.cryptoCurrency,
    fiatAmount: side === 'BUY' ? source : obtain,
    cryptoAmount: side === 'BUY' ? obtain : source,
    time: raw.createTime,
  }
}

// P2P: amount is the crypto quantity and totalPrice the fiat that changed hands.
function toP2pOrder(raw: BinanceC2cOrder): FiatOrder {
  return {
    source: 'p2p',
    side: raw.tradeType,
    fiatCurrency: raw.fiat,
    cryptoCurrency: raw.asset,
    fiatAmount: Number.parseFloat(raw.totalPrice),
    cryptoAmount: Number.parseFloat(raw.amount),
    time: raw.createTime,
  }
}

interface Window {
  side: 'BUY' | 'SELL'
  begin: number
  end: number
}

function buildWindows(now: number, windowDays: number): Window[] {
  const windows: Window[] = []
  const start = now - HISTORY_LOOKBACK_DAYS * MS_PER_DAY
  for (let end = now; end > start; end -= windowDays * MS_PER_DAY) {
    const begin = Math.max(start, end - windowDays * MS_PER_DAY)
    windows.push({ side: 'BUY', begin, end })
    windows.push({ side: 'SELL', begin, end })
  }
  return windows
}

/** Page through one history window. `fetchPage` returns the rows and the total for that window. */
async function fetchPaged<T>(
  rowsPerPage: number,
  fetchPage: (page: number) => Promise<{ data: T[]; total: number }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await withRetry(() => fetchPage(page))
    rows.push(...res.data)
    if (res.data.length < rowsPerPage || rows.length >= res.total) break
  }
  return rows
}

async function fetchFiatWindow(w: Window): Promise<FiatOrder[]> {
  const raw = await fetchPaged<BinanceFiatPayment>(FIAT_ROWS, async (page) => {
    const res = await binanceFetch<BinanceFiatPaymentsResponse>('/sapi/v1/fiat/payments', {
      transactionType: w.side === 'BUY' ? '0' : '1',
      beginTime: w.begin,
      endTime: w.end,
      page,
      rows: FIAT_ROWS,
    })
    return { data: res.data ?? [], total: res.total }
  })
  return raw.filter((r) => r.status === 'Completed').map((r) => toFiatOrder(r, w.side))
}

async function fetchP2pWindow(w: Window): Promise<FiatOrder[]> {
  const raw = await fetchPaged<BinanceC2cOrder>(P2P_ROWS, async (page) => {
    const res = await binanceFetch<BinanceC2cHistoryResponse>('/sapi/v1/c2c/orderMatch/listUserOrderHistory', {
      tradeType: w.side,
      startTimestamp: w.begin,
      endTimestamp: w.end,
      page,
      rows: P2P_ROWS,
    })
    return { data: res.data ?? [], total: res.total }
  })
  return raw.filter((r) => r.orderStatus === 'COMPLETED').map(toP2pOrder)
}

interface HistorySource {
  orders: FiatOrder[]
  warnings: string[]
}

/**
 * One fiat-side history source over the whole lookback. A failure degrades to a
 * warning instead of failing the request: these endpoints are the flakiest calls
 * here and spot-only P&L is still useful.
 */
async function fetchHistorySource(
  label: string,
  windows: Window[],
  fetchWindow: (w: Window) => Promise<FiatOrder[]>,
): Promise<HistorySource> {
  try {
    const pages = await mapWithConcurrency(windows, CONCURRENCY, fetchWindow)
    // Adjacent windows share their boundary instant, so an order created exactly
    // on it can appear twice; key by every field that identifies the trade.
    const seen = new Set<string>()
    const orders: FiatOrder[] = []
    for (const o of pages.flat()) {
      const key = `${o.side}:${o.time}:${o.cryptoCurrency}:${o.cryptoAmount}:${o.fiatAmount}`
      if (seen.has(key)) continue
      seen.add(key)
      orders.push(o)
    }
    return { orders, warnings: [] }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error'
    console.error(`[crypto-pnl] ${label} history unavailable:`, msg)
    return { orders: [], warnings: [`${label} history unavailable (${msg}); its purchases are missing from the cost basis.`] }
  }
}

async function fetchFiatOrders(now: number): Promise<HistorySource> {
  const [fiat, p2p] = await Promise.all([
    fetchHistorySource('Fiat Buy Crypto', buildWindows(now, FIAT_WINDOW_DAYS), fetchFiatWindow),
    fetchHistorySource('P2P', buildWindows(now, P2P_WINDOW_DAYS), fetchP2pWindow),
  ])
  return { orders: [...fiat.orders, ...p2p.orders], warnings: [...fiat.warnings, ...p2p.warnings] }
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
