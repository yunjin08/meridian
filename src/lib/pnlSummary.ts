import type { StockAccountSummary, StockHolding, StockPosition } from '@/types/portfolio'
import type { CryptoAssetPnl, CryptoPnlResponse, FiatFunding } from '@/types/pnl'

const USD = 'USD'

export interface EquityPositionPnl {
  ticker: string
  assetClass: 'stock' | 'reit'
  currentValue: number
  totalCost: number
  unrealized: number
  unrealizedPercent: number | null
}

export interface EquityClassPnl {
  unrealized: number
  totalCost: number
  positions: EquityPositionPnl[]   // sorted by absolute unrealized, largest first
}

export interface EquitiesPnl {
  currency: string
  unrealized: number
  realized: number                 // account level; Trading 212 does not split it per position
  net: number                      // unrealized + realized
  stocks: EquityClassPnl
  reits: EquityClassPnl
}

/** One coin reduced to the three figures that matter: money still in, what it is worth, the difference. */
export interface CryptoAssetRow {
  asset: string
  netSpent: number                 // cost of buys minus proceeds of sells already taken out
  currentValue: number | null
  net: number | null               // currentValue - netSpent
  netPercent: number | null        // null once sales have recovered the whole cost
  untrackedQty: number
  hasUnknownCost: boolean
}

export interface CryptoPnl {
  net: number
  currentValue: number
  netSpent: number                 // total still tied up, sales deducted
  netPercent: number | null
  hasUnknownCost: boolean
  hasUntracked: boolean
  hasIgnoredFees: boolean
  warnings: string[]
  assets: CryptoAssetRow[]         // sorted by absolute net, largest first
  funding: FiatFunding[]
}

export interface PnlSummary {
  total: number | null             // null until at least one source has loaded
  totalCurrency: string
  isMixedCurrency: boolean
  crypto: CryptoPnl | null
  equities: EquitiesPnl | null
}

export interface PnlSummaryInput {
  cryptoPnl: CryptoPnlResponse | null
  positions: Record<string, StockPosition>
  account: StockAccountSummary | null
  stocks: StockHolding[]
}

function percent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null
}

function toAssetRow(a: CryptoAssetPnl): CryptoAssetRow {
  // Proceeds of sells come straight off the cost, so the row reads
  // "still in" minus "worth now" rather than three competing figures.
  const netSpent = a.spentUsdt - a.receivedUsdt
  const net = a.currentValueUsdt === null ? null : a.currentValueUsdt - netSpent
  return {
    asset: a.asset,
    netSpent,
    currentValue: a.currentValueUsdt,
    net,
    netPercent: net === null ? null : percent(net, netSpent),
    untrackedQty: a.untrackedQty,
    hasUnknownCost: a.unknownCostQty > 0,
  }
}

function summariseCrypto(response: CryptoPnlResponse): CryptoPnl {
  const netSpent = response.totals.spentUsdt - response.totals.receivedUsdt
  const assets = response.assets
    .map(toAssetRow)
    .sort((a, b) => Math.abs(b.net ?? 0) - Math.abs(a.net ?? 0))
  return {
    net: response.totals.netUsdt,
    currentValue: response.totals.currentValueUsdt,
    netSpent,
    netPercent: percent(response.totals.netUsdt, netSpent),
    hasUnknownCost: response.totals.hasUnknownCost,
    hasUntracked: response.totals.hasUntracked,
    hasIgnoredFees: response.totals.hasIgnoredFees,
    warnings: response.warnings,
    assets,
    funding: response.funding,
  }
}

function emptyClass(): EquityClassPnl {
  return { unrealized: 0, totalCost: 0, positions: [] }
}

function summariseEquities(input: PnlSummaryInput): EquitiesPnl | null {
  if (input.account === null) return null

  // The user's stock/REIT classification lives on the watchlist; Trading 212 has no notion of a REIT.
  const classOf = new Map(input.stocks.map((s) => [s.ticker, s.assetClass]))
  const stocks = emptyClass()
  const reits = emptyClass()

  for (const p of Object.values(input.positions)) {
    const assetClass = classOf.get(p.ticker) ?? 'stock'
    const bucket = assetClass === 'reit' ? reits : stocks
    bucket.unrealized += p.unrealizedPnl
    bucket.totalCost += p.totalCost
    bucket.positions.push({
      ticker: p.ticker,
      assetClass,
      currentValue: p.currentValue,
      totalCost: p.totalCost,
      unrealized: p.unrealizedPnl,
      unrealizedPercent: percent(p.unrealizedPnl, p.totalCost),
    })
  }
  for (const bucket of [stocks, reits]) {
    bucket.positions.sort((a, b) => Math.abs(b.unrealized) - Math.abs(a.unrealized))
  }

  const unrealized = input.account.unrealizedPnl
  const realized = input.account.realizedPnl
  return {
    currency: input.account.currency,
    unrealized,
    realized,
    net: unrealized + realized,
    stocks,
    reits,
  }
}

export function summarisePnl(input: PnlSummaryInput): PnlSummary {
  const crypto = input.cryptoPnl === null ? null : summariseCrypto(input.cryptoPnl)
  const equities = summariseEquities(input)

  const equityCurrency = equities?.currency ?? USD
  const hasCrypto = crypto !== null && crypto.assets.length > 0
  const isMixedCurrency = hasCrypto && equities !== null && equityCurrency !== USD
  const totalCurrency = hasCrypto ? USD : equityCurrency

  let total: number | null = null
  if (crypto !== null || equities !== null) {
    total = (crypto?.net ?? 0) + (equities?.net ?? 0)
  }

  return { total, totalCurrency, isMixedCurrency, crypto, equities }
}
