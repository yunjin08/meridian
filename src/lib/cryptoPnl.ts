// Crypto profit-and-loss math. This module is bundled into a Netlify Function,
// so it must stay free of `@/` imports (esbuild there has no path alias).
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

export function computeAssetPnl(input: AssetPnlInput): CryptoAssetPnl {
  const { asset, heldQty, priceUsdt } = input
  let boughtQty = 0
  let soldQty = 0
  let spentUsdt = 0
  let receivedUsdt = 0
  let unknownCostQty = 0
  const ignoredFeeAssets = new Set<string>()

  for (const f of input.fills) {
    if (f.side === 'BUY') {
      boughtQty += f.qty
      spentUsdt += f.quoteQty
      // A fee taken in the bought asset reduces what landed in the wallet and a fee
      // in USDT is part of the cost. A fee in a third asset (BNB with the fee
      // discount) has no USDT price here, so it is reported rather than guessed.
      if (f.commissionAsset === asset) boughtQty -= f.commission
      else if (f.commissionAsset === 'USDT') spentUsdt += f.commission
      else if (f.commission > 0) ignoredFeeAssets.add(f.commissionAsset)
    } else {
      soldQty += f.qty
      receivedUsdt += f.quoteQty
      if (f.commissionAsset === 'USDT') receivedUsdt -= f.commission
      else if (f.commission > 0) ignoredFeeAssets.add(f.commissionAsset)
    }
  }

  for (const o of input.fiatOrders) {
    if (o.cryptoCurrency !== asset) continue
    const rate = input.usdPerFiat(o.fiatCurrency, o.time)
    if (o.side === 'BUY') {
      boughtQty += o.cryptoAmount
      if (rate === null) unknownCostQty += o.cryptoAmount
      else spentUsdt += o.fiatAmount * rate
    } else {
      soldQty += o.cryptoAmount
      if (rate !== null) receivedUsdt += o.fiatAmount * rate
    }
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
