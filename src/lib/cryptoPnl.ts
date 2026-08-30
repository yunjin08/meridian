// Crypto profit-and-loss math. This module is bundled into a Netlify Function,
// so it must stay free of `@/` imports (esbuild there has no path alias).
import type { HistoryEvent } from './portfolioHistory.ts'
import type {
  CryptoAssetPnl,
  CryptoPnlTotals,
  FiatFunding,
  FiatOrder,
  SpotFill,
} from '../types/pnl.ts'

/** Held quantity may exceed acquisitions by this fraction before it counts as untracked (rounding, dust). */
export const UNTRACKED_TOLERANCE = 0.01

export type UsdPerFiat = (currency: string, time: number) => number | null

/**
 * Build a lookup from fiat currency to USDT per unit, derived from the user's own
 * fiat -> USDT purchases (nearest in time). USD is 1:1 with USDT here.
 */
export function buildFiatRateLookup(orders: readonly FiatOrder[]): UsdPerFiat {
  const byCurrency = new Map<string, Array<{ time: number; rate: number }>>()
  for (const o of orders) {
    if (o.cryptoCurrency !== 'USDT' || o.fiatAmount <= 0 || o.cryptoAmount <= 0) continue
    const list = byCurrency.get(o.fiatCurrency) ?? []
    list.push({ time: o.time, rate: o.cryptoAmount / o.fiatAmount })
    byCurrency.set(o.fiatCurrency, list)
  }

  return (currency, time) => {
    if (currency === 'USD' || currency === 'USDT') return 1
    const list = byCurrency.get(currency)
    if (list === undefined || list.length === 0) return null
    let best = list[0]
    if (best === undefined) return null
    for (const candidate of list) {
      if (Math.abs(candidate.time - time) < Math.abs(best.time - time)) best = candidate
    }
    return best.rate
  }
}

export interface AssetPnlInput {
  asset: string
  heldQty: number
  priceUsdt: number | null
  fills: readonly SpotFill[]
  fiatOrders: readonly FiatOrder[]    // all orders; filtered to this asset here
  usdPerFiat: UsdPerFiat
}

/**
 * What one trade did to a coin's position: quantity in or out, and money out or
 * back. Both the totals and the daily history are built from this, so fee
 * handling cannot drift between the two.
 */
export interface TradeDelta {
  qty: number                     // positive when coins arrive, negative when they leave
  cost: number                    // positive when money is spent, negative when it comes back
  ignoredFeeAsset: string | null  // fee currency that could not be priced
  unknownCostQty: number          // acquired quantity whose cost could not be established
}

export function fillDelta(fill: SpotFill, asset: string): TradeDelta {
  const delta: TradeDelta = { qty: 0, cost: 0, ignoredFeeAsset: null, unknownCostQty: 0 }
  const feeInAsset = fill.commissionAsset === asset
  const feeInQuote = fill.commissionAsset === 'USDT'

  if (fill.side === 'BUY') {
    // A fee charged in the coin just bought reduces what landed in the wallet,
    // and a fee in USDT is part of what the purchase cost. Anything else (BNB
    // with the fee discount) has no price here, so it is reported not guessed.
    delta.qty = feeInAsset ? fill.qty - fill.commission : fill.qty
    delta.cost = feeInQuote ? fill.quoteQty + fill.commission : fill.quoteQty
    if (!feeInAsset && !feeInQuote && fill.commission > 0) delta.ignoredFeeAsset = fill.commissionAsset
    return delta
  }

  // A sale's fee only shows up in the proceeds when it is charged in USDT.
  // Charged in anything else, including the coin being sold, it goes unpriced.
  delta.qty = -fill.qty
  delta.cost = feeInQuote ? -(fill.quoteQty - fill.commission) : -fill.quoteQty
  if (!feeInQuote && fill.commission > 0) delta.ignoredFeeAsset = fill.commissionAsset
  return delta
}

export function fiatDelta(order: FiatOrder, usdPerFiat: UsdPerFiat): TradeDelta {
  const rate = usdPerFiat(order.fiatCurrency, order.time)
  const usd = rate === null ? 0 : order.fiatAmount * rate
  if (order.side === 'BUY') {
    return {
      qty: order.cryptoAmount,
      cost: usd,
      ignoredFeeAsset: null,
      unknownCostQty: rate === null ? order.cryptoAmount : 0,
    }
  }
  return { qty: -order.cryptoAmount, cost: -usd, ignoredFeeAsset: null, unknownCostQty: 0 }
}

export function computeAssetPnl(input: AssetPnlInput): CryptoAssetPnl {
  const { asset, heldQty, priceUsdt } = input
  let boughtQty = 0
  let soldQty = 0
  let spentUsdt = 0
  let receivedUsdt = 0
  let unknownCostQty = 0
  const ignoredFeeAssets = new Set<string>()

  function apply(delta: TradeDelta): void {
    if (delta.qty >= 0) {
      boughtQty += delta.qty
      spentUsdt += delta.cost
    } else {
      soldQty += -delta.qty
      receivedUsdt += -delta.cost
    }
    unknownCostQty += delta.unknownCostQty
    if (delta.ignoredFeeAsset !== null) ignoredFeeAssets.add(delta.ignoredFeeAsset)
  }

  for (const f of input.fills) apply(fillDelta(f, asset))
  for (const o of input.fiatOrders) {
    if (o.cryptoCurrency !== asset) continue
    apply(fiatDelta(o, input.usdPerFiat))
  }

  const explainedQty = boughtQty - soldQty
  const untrackedQty = heldQty > explainedQty * (1 + UNTRACKED_TOLERANCE) + 1e-9
    ? heldQty - Math.max(explainedQty, 0)
    : 0

  const currentValueUsdt = priceUsdt === null ? null : heldQty * priceUsdt
  const netUsdt = currentValueUsdt === null ? null : currentValueUsdt + receivedUsdt - spentUsdt
  const costedQty = boughtQty - unknownCostQty
  const avgBuyPriceUsdt = costedQty > 0 ? spentUsdt / costedQty : null

  return {
    asset,
    heldQty,
    priceUsdt,
    currentValueUsdt,
    boughtQty,
    soldQty,
    spentUsdt,
    receivedUsdt,
    avgBuyPriceUsdt,
    netUsdt,
    unknownCostQty,
    untrackedQty,
    ignoredFeeAssets: [...ignoredFeeAssets].sort(),
  }
}

/** Every acquisition and disposal as a dated event, for the daily since-inception curve. */
export function buildHistoryEvents(
  assets: ReadonlyArray<{ asset: string; fills: readonly SpotFill[] }>,
  fiatOrders: readonly FiatOrder[],
  usdPerFiat: UsdPerFiat,
): HistoryEvent[] {
  const events: HistoryEvent[] = []

  for (const { asset, fills } of assets) {
    for (const fill of fills) {
      const delta = fillDelta(fill, asset)
      events.push({ time: fill.time, asset, qtyDelta: delta.qty, costDelta: delta.cost })
    }
  }

  for (const order of fiatOrders) {
    // Buying USDT with pesos funds the account; it only becomes an investment
    // when that USDT buys a coin, which the spot fills above already record.
    if (order.cryptoCurrency === 'USDT') continue
    const delta = fiatDelta(order, usdPerFiat)
    events.push({
      time: order.time,
      asset: order.cryptoCurrency,
      qtyDelta: delta.qty,
      costDelta: delta.cost,
    })
  }

  return events
}

export function summariseFunding(orders: readonly FiatOrder[]): FiatFunding[] {
  const byCurrency = new Map<string, FiatFunding>()
  for (const o of orders) {
    const entry = byCurrency.get(o.fiatCurrency) ?? {
      currency: o.fiatCurrency,
      totalIn: 0,
      totalOut: 0,
      usdtBought: 0,
      usdtSold: 0,
    }
    if (o.side === 'BUY') {
      entry.totalIn += o.fiatAmount
      if (o.cryptoCurrency === 'USDT') entry.usdtBought += o.cryptoAmount
    } else {
      entry.totalOut += o.fiatAmount
      if (o.cryptoCurrency === 'USDT') entry.usdtSold += o.cryptoAmount
    }
    byCurrency.set(o.fiatCurrency, entry)
  }
  return [...byCurrency.values()].sort((a, b) => a.currency.localeCompare(b.currency))
}

export function totalCryptoPnl(assets: readonly CryptoAssetPnl[]): CryptoPnlTotals {
  const totals: CryptoPnlTotals = {
    currentValueUsdt: 0,
    spentUsdt: 0,
    receivedUsdt: 0,
    netUsdt: 0,
    hasUnknownCost: false,
    hasUntracked: false,
    hasIgnoredFees: false,
  }
  for (const a of assets) {
    totals.spentUsdt += a.spentUsdt
    totals.receivedUsdt += a.receivedUsdt
    if (a.currentValueUsdt !== null) totals.currentValueUsdt += a.currentValueUsdt
    if (a.netUsdt !== null) totals.netUsdt += a.netUsdt
    if (a.unknownCostQty > 0) totals.hasUnknownCost = true
    if (a.untrackedQty > 0) totals.hasUntracked = true
    if (a.ignoredFeeAssets.length > 0) totals.hasIgnoredFees = true
  }
  return totals
}
