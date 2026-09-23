// Stock side of the since-inception curve: Trading 212 order history for the
// cost line, Finnhub daily closes for the value line, reduced to the same
// generic events + per-asset closes the crypto side produces so both merge into
// one chart.
import { finnhubFetch, FinnhubError } from './finnhub-client.ts'
import { t212Fetch, toDashboardTicker, fetchOrderHistory, Trading212Error } from './trading212-client.ts'
import { buildStockHistoryEvents, stockQtyByTicker } from '../../../src/lib/stockHistory.ts'
import { toIsoDate } from '../../../src/lib/isoDate.ts'
import type { HistoryEvent } from '../../../src/lib/portfolioHistory.ts'
import type { Trading212HistoricalOrder, Trading212Position } from '../../../src/types/trading212.ts'
import type { StockFill } from '../../../src/types/pnl.ts'

const MS_PER_DAY = 86_400_000
const ACCOUNT_CURRENCY = 'USD'   // the crypto side is USD/USDT; a non-USD wallet can't be mixed in without daily FX

export interface StockHistoryParts {
  events: HistoryEvent[]
  closes: Map<string, Map<string, number>>   // ticker -> date -> close in account currency
  offset: Map<string, number>                 // ticker -> shares the fills cannot explain
  warnings: string[]
}

const EMPTY: StockHistoryParts = { events: [], closes: new Map(), offset: new Map(), warnings: [] }

function toStockFill(raw: Trading212HistoricalOrder): StockFill | null {
  const time = Date.parse(raw.fill.filledAt)
  const qty = Math.abs(raw.fill.quantity)
  if (Number.isNaN(time) || qty === 0) return null
  return {
    ticker: toDashboardTicker(raw.order.ticker),
    side: raw.order.side,
    qty,
    netValue: Math.abs(raw.fill.walletImpact.netValue),
    instrumentCurrency: raw.order.currency,
    fxRate: raw.fill.walletImpact.fxRate,
    isTrade: raw.fill.type === 'TRADE',
    time,
  }
}

/** Daily closes for one US-listed ticker, keyed by UTC date, from Finnhub. */
async function fetchDailyCloses(ticker: string, startSec: number, nowSec: number): Promise<Map<string, number>> {
  const closes = new Map<string, number>()
  const raw = await finnhubFetch<{ s: string; t: number[]; c: number[] }>('/stock/candle', {
    symbol: ticker,
    resolution: 'D',
    from: startSec,
    to: nowSec,
  })
  if (raw.s !== 'ok') return closes
  for (let i = 0; i < raw.t.length; i += 1) {
    const t = raw.t[i]
    const c = raw.c[i]
    if (t === undefined || c === undefined) continue
    closes.set(toIsoDate(new Date(t * 1000)), c)
  }
  return closes
}

interface Held {
  quantity: number
  instrumentCurrency: string
  usdPerShare: number | null   // today's mark, used as a flat fallback when Finnhub history is unusable
}

/**
 * The value line reprices held shares at each day's close. That is only honest
 * when Finnhub's price is in the same currency as the wallet, so it applies to
 * US-listed (USD) instruments and Finnhub actually returning history. Anything
 * else (a GBP/EUR listing, or a ticker Finnhub will not serve) falls back to a
 * flat line at today's per-share value and is flagged, rather than risking a
 * currency-scale error on the chart.
 */
async function buildCloses(
  tickers: readonly string[],
  held: ReadonlyMap<string, Held>,
  firstEventMs: number,
  nowMs: number,
): Promise<{ closes: Map<string, Map<string, number>>; warnings: string[] }> {
  const closes = new Map<string, Map<string, number>>()
  const warnings: string[] = []
  const startSec = Math.floor((firstEventMs - MS_PER_DAY) / 1000)
  const nowSec = Math.floor(nowMs / 1000)
  // buildPortfolioHistory carries a close forward, never backward, so a flat
  // price has to be anchored at the first day for it to cover the whole curve.
  // Before the ticker's own trades the held quantity is zero, so its value stays
  // zero until purchase regardless; from purchase on it reads flat at this mark.
  const startDate = toIsoDate(new Date(firstEventMs))

  for (const ticker of tickers) {
    const info = held.get(ticker)
    const flat = (): void => {
      if (info?.usdPerShare == null) {
        warnings.push(`${ticker} has no usable price history; it is missing from the value line.`)
        return
      }
      closes.set(ticker, new Map([[startDate, info.usdPerShare]]))
      warnings.push(`${ticker} priced flat at today's value (no matching daily history).`)
    }

    if (info === undefined || info.instrumentCurrency !== ACCOUNT_CURRENCY) {
      flat()
      continue
    }
    try {
      const series = await fetchDailyCloses(ticker, startSec, nowSec)
      if (series.size === 0) flat()
      else closes.set(ticker, series)
    } catch (err) {
      if (err instanceof FinnhubError) flat()
      else throw err
    }
  }

  return { closes, warnings }
}

/**
 * Gather the stock contribution to the portfolio curve. Any Trading 212 or
 * Finnhub failure degrades to a warning: a crypto-only curve is still useful,
 * and the crypto P&L this shares an endpoint with must not fail over stocks.
 */
export async function buildStockHistory(nowMs: number): Promise<StockHistoryParts> {
  let positions: Trading212Position[] = []
  let orders: Trading212HistoricalOrder[]
  const warnings: string[] = []

  const [positionsRes, historyRes] = await Promise.allSettled([
    t212Fetch<Trading212Position[]>('/equity/positions'),
    fetchOrderHistory(),
  ])

  if (historyRes.status === 'rejected') {
    const msg = historyRes.reason instanceof Trading212Error ? historyRes.reason.message : 'unknown error'
    console.error('[stock-history] order history unavailable:', msg)
    return { ...EMPTY, warnings: [`Stock history unavailable (${msg}); the curve shows crypto only.`] }
  }
  orders = historyRes.value.orders
  if (historyRes.value.truncated) {
    warnings.push('Stock history is long; older trades beyond the most recent 300 are not on the curve.')
  }
  if (positionsRes.status === 'fulfilled') positions = positionsRes.value
  else warnings.push('Stock positions unavailable; the value line falls back to trade history alone.')

  // A non-USD wallet would need daily FX to sit on the same axis as crypto.
  const accountCurrency = orders[0]?.fill.walletImpact.currency ?? positions[0]?.walletImpact.currency
  if (accountCurrency !== undefined && accountCurrency !== ACCOUNT_CURRENCY) {
    return { ...EMPTY, warnings: [`Trading 212 account is in ${accountCurrency}; stock history needs a USD account to join the curve.`] }
  }

  const fills = orders.map(toStockFill).filter((f): f is StockFill => f !== null)
  if (fills.length === 0) return EMPTY

  const events = buildStockHistoryEvents(fills)
  const summed = stockQtyByTicker(fills)

  const held = new Map<string, Held>()
  for (const p of positions) {
    if (p.quantity <= 0) continue
    const ticker = toDashboardTicker(p.instrument.ticker)
    held.set(ticker, {
      quantity: p.quantity,
      instrumentCurrency: p.instrument.currency,
      usdPerShare: p.quantity > 0 ? p.walletImpact.currentValue / p.quantity : null,
    })
  }

  // Whatever the trades cannot explain (transfers in, actions we skipped),
  // applied from day one so the final point equals the real position today.
  const offset = new Map<string, number>()
  for (const ticker of new Set(fills.map((f) => f.ticker))) {
    const unexplained = (held.get(ticker)?.quantity ?? 0) - (summed.get(ticker) ?? 0)
    if (Math.abs(unexplained) > 1e-9) offset.set(ticker, unexplained)
  }

  const firstEventMs = Math.min(...events.map((e) => e.time))
  const tickers = [...new Set(events.map((e) => e.asset))]
  const { closes, warnings: closeWarnings } = await buildCloses(tickers, held, firstEventMs, nowMs)

  return { events, closes, offset, warnings: [...warnings, ...closeWarnings] }
}
