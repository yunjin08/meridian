import type { AccountBalance } from '@/types/account'
import type { CryptoHolding, StockAccountSummary, StockHolding, StockPosition, StockQuote } from '@/types/portfolio'
import type { SymbolPrice } from '@/store/priceStore'

export const TOP_HOLDINGS_LIMIT = 8

export type SummaryClass = 'crypto' | 'stock' | 'reit'

export interface ClassSummary {
  value: number
  currency: string
  change24hUsd: number        // in the class currency; named for parity with crypto
  change24hPercent: number | null
  holdingCount: number
  unpricedCount: number       // no Trading 212 position and no (quote x shares)
}

export interface HoldingSummary {
  assetClass: SummaryClass
  symbol: string
  value: number
  currency: string
  changePercent: number | null
}

export interface PortfolioSummary {
  total: number
  totalCurrency: string
  isMixedCurrency: boolean
  change24hUsd: number
  change24hPercent: number | null
  asOf: number | null
  classes: Record<SummaryClass, ClassSummary>
  topHoldings: HoldingSummary[]
}

export interface PortfolioSummaryInput {
  balance: AccountBalance | null
  cryptoHoldings: CryptoHolding[]
  prices: Record<string, SymbolPrice>
  stocks: StockHolding[]
  quotes: Record<string, StockQuote>
  positions: Record<string, StockPosition>
  account: StockAccountSummary | null
  positionsFetchedAt: number | null
}

const USD = 'USD'

function percentChange(value: number, change: number): number | null {
  const previous = value - change
  if (previous <= 0) return null
  return (change / previous) * 100
}

function emptyClass(currency: string): ClassSummary {
  return { value: 0, currency, change24hUsd: 0, change24hPercent: null, holdingCount: 0, unpricedCount: 0 }
}

function summariseCrypto(input: PortfolioSummaryInput): { summary: ClassSummary; holdings: HoldingSummary[] } {
  const summary = emptyClass(USD)
  const holdings: HoldingSummary[] = []

  for (const h of input.cryptoHoldings) {
    const value = h.usdtValue ?? 0
    const changePercent = input.prices[h.symbol]?.changePercent ?? null
    summary.holdingCount += 1
    summary.change24hUsd += changePercent === null ? 0 : (value * changePercent) / 100
    holdings.push({ assetClass: 'crypto', symbol: h.asset, value, currency: USD, changePercent })
  }

  // The balance endpoint already sums holdings; prefer it so the hero matches the Crypto tab.
  summary.value = input.balance?.totalUsdtValue ?? holdings.reduce((sum, h) => sum + h.value, 0)
  summary.change24hPercent = percentChange(summary.value, summary.change24hUsd)
  return { summary, holdings }
}

// Trading 212 reports value in the account currency; quote x shares is the
// fallback for watchlist tickers with a manual share count.
function equityValue(h: StockHolding, input: PortfolioSummaryInput): number | null {
  const p = input.positions[h.ticker]
  if (p !== undefined) return p.currentValue
  const q = input.quotes[h.ticker]
  if (q === undefined || h.shares === undefined || h.shares <= 0) return null
  return q.price * h.shares
}

function summariseEquities(
  input: PortfolioSummaryInput,
  assetClass: 'stock' | 'reit',
  currency: string,
): { summary: ClassSummary; holdings: HoldingSummary[] } {
  const summary = emptyClass(currency)
  const holdings: HoldingSummary[] = []

  for (const s of input.stocks) {
    if (s.assetClass !== assetClass) continue
    summary.holdingCount += 1
    const value = equityValue(s, input)
    if (value === null) {
      summary.unpricedCount += 1
      continue
    }
    const changePercent = input.quotes[s.ticker]?.changePercent ?? null
    summary.value += value
    summary.change24hUsd += changePercent === null ? 0 : (value * changePercent) / 100
    holdings.push({ assetClass, symbol: s.ticker, value, currency, changePercent })
  }

  summary.change24hPercent = percentChange(summary.value, summary.change24hUsd)
  return { summary, holdings }
}

function latestTimestamp(input: PortfolioSummaryInput): number | null {
  let latest: number | null = input.balance?.fetchedAt ?? null
  const consider = (ts: number | null) => {
    if (ts !== null && (latest === null || ts > latest)) latest = ts
  }
  for (const q of Object.values(input.quotes)) consider(q.fetchedAt)
  consider(input.positionsFetchedAt)
  return latest
}

export function summarisePortfolio(input: PortfolioSummaryInput): PortfolioSummary {
  const stockCurrency = input.account?.currency ?? USD
  const crypto = summariseCrypto(input)
  const stock = summariseEquities(input, 'stock', stockCurrency)
  const reit = summariseEquities(input, 'reit', stockCurrency)

  const total = crypto.summary.value + stock.summary.value + reit.summary.value
  const change24hUsd = crypto.summary.change24hUsd + stock.summary.change24hUsd + reit.summary.change24hUsd

  // With no crypto the total is purely in the Trading 212 currency; otherwise
  // it is a USD-labelled mix and the UI shows a note.
  const totalCurrency = crypto.summary.value === 0 ? stockCurrency : USD
  const isMixedCurrency = crypto.summary.value > 0 && input.account !== null && stockCurrency !== USD

  const topHoldings = [...crypto.holdings, ...stock.holdings, ...reit.holdings]
    .filter((h) => h.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_HOLDINGS_LIMIT)

  return {
    total,
    totalCurrency,
    isMixedCurrency,
    change24hUsd,
    change24hPercent: percentChange(total, change24hUsd),
    asOf: latestTimestamp(input),
    classes: { crypto: crypto.summary, stock: stock.summary, reit: reit.summary },
    topHoldings,
  }
}
