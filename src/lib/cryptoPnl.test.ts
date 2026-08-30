import { describe, expect, it } from 'vitest'
import {
  buildFiatRateLookup,
  computeAssetPnl,
  summariseFunding,
  totalCryptoPnl,
} from '@/lib/cryptoPnl'
import type { FiatOrder, SpotFill } from '@/types/pnl'

const T0 = 1_700_000_000_000

function buy(qty: number, quoteQty: number, extra: Partial<SpotFill> = {}): SpotFill {
  return { side: 'BUY', qty, quoteQty, commission: 0, commissionAsset: 'BNB', time: T0, ...extra }
}
function sell(qty: number, quoteQty: number, extra: Partial<SpotFill> = {}): SpotFill {
  return { side: 'SELL', qty, quoteQty, commission: 0, commissionAsset: 'BNB', time: T0, ...extra }
}
function fiat(side: 'BUY' | 'SELL', fiatAmount: number, cryptoCurrency: string, cryptoAmount: number, time = T0): FiatOrder {
  return { source: 'fiat', side, fiatCurrency: 'PHP', fiatAmount, cryptoCurrency, cryptoAmount, time }
}

const noRate = () => null

describe('buildFiatRateLookup', () => {
  it('derives USDT per fiat unit from the nearest USDT purchase', () => {
    const lookup = buildFiatRateLookup([
      fiat('BUY', 5_600, 'USDT', 100, T0),               // 0.017857 USDT per PHP
      fiat('BUY', 5_800, 'USDT', 100, T0 + 10_000_000),  // 0.017241 USDT per PHP
      fiat('BUY', 1_000, 'BTC', 0.0002, T0),             // ignored: not USDT
    ])
    expect(lookup('PHP', T0 + 1)).toBeCloseTo(100 / 5_600, 10)
    expect(lookup('PHP', T0 + 9_000_000)).toBeCloseTo(100 / 5_800, 10)
    expect(lookup('USD', T0)).toBe(1)
    expect(lookup('EUR', T0)).toBeNull()
  })
})

describe('computeAssetPnl', () => {
  it('matches the trade-history panel formula: value + received - spent', () => {
    const pnl = computeAssetPnl({
      asset: 'ETH',
      heldQty: 0.1817,
      priceUsdt: 2_454,
      fills: [buy(0.1, 200), buy(0.0817, 22.76)],
      fiatOrders: [],
      usdPerFiat: noRate,
    })
    expect(pnl.spentUsdt).toBeCloseTo(222.76)
    expect(pnl.boughtQty).toBeCloseTo(0.1817)
    expect(pnl.currentValueUsdt).toBeCloseTo(0.1817 * 2_454)
    expect(pnl.netUsdt).toBeCloseTo(0.1817 * 2_454 - 222.76)
    expect(pnl.avgBuyPriceUsdt).toBeCloseTo(222.76 / 0.1817)
    expect(pnl.untrackedQty).toBe(0)
    expect(pnl.unknownCostQty).toBe(0)
  })

  it('accounts for fees in the base asset and in USDT', () => {
    const pnl = computeAssetPnl({
      asset: 'BTC',
      heldQty: 0.0099,
      priceUsdt: 100_000,
      fills: [
        buy(0.01, 500, { commission: 0.0001, commissionAsset: 'BTC' }),   // wallet receives 0.0099
        sell(0.0, 0, { commission: 0, commissionAsset: 'USDT' }),
      ],
      fiatOrders: [],
      usdPerFiat: noRate,
    })
    expect(pnl.boughtQty).toBeCloseTo(0.0099)
    expect(pnl.untrackedQty).toBe(0)

    const usdtFee = computeAssetPnl({
      asset: 'BTC',
      heldQty: 0,
      priceUsdt: 100_000,
      fills: [
        buy(0.01, 500, { commission: 0.5, commissionAsset: 'USDT' }),
        sell(0.01, 600, { commission: 0.6, commissionAsset: 'USDT' }),
      ],
      fiatOrders: [],
      usdPerFiat: noRate,
    })
    expect(usdtFee.spentUsdt).toBeCloseTo(500.5)
    expect(usdtFee.receivedUsdt).toBeCloseTo(599.4)
    expect(usdtFee.netUsdt).toBeCloseTo(98.9)
    expect(usdtFee.ignoredFeeAssets).toEqual([])
  })

  it('reports fee currencies it cannot price instead of dropping them silently', () => {
    const pnl = computeAssetPnl({
      asset: 'BTC',
      heldQty: 0.01,
      priceUsdt: 100_000,
      fills: [buy(0.01, 500, { commission: 0.001, commissionAsset: 'BNB' })],
      fiatOrders: [],
      usdPerFiat: noRate,
    })
    expect(pnl.spentUsdt).toBe(500)
    expect(pnl.ignoredFeeAssets).toEqual(['BNB'])
    expect(totalCryptoPnl([pnl]).hasIgnoredFees).toBe(true)
  })

  it('costs direct fiat buys through the fiat rate and flags unknown rates', () => {
    const lookup = buildFiatRateLookup([fiat('BUY', 5_600, 'USDT', 100)])
    const known = computeAssetPnl({
      asset: 'BTC',
      heldQty: 0.001,
      priceUsdt: 100_000,
      fills: [],
      fiatOrders: [fiat('BUY', 5_600, 'BTC', 0.001), fiat('BUY', 5_600, 'USDT', 100)],
      usdPerFiat: lookup,
    })
    expect(known.boughtQty).toBeCloseTo(0.001)
    expect(known.spentUsdt).toBeCloseTo(100)          // 5,600 PHP at 100/5,600 USDT per PHP
    expect(known.netUsdt).toBeCloseTo(0)
    expect(known.unknownCostQty).toBe(0)

    const unknown = computeAssetPnl({
      asset: 'BTC',
      heldQty: 0.001,
      priceUsdt: 100_000,
      fills: [],
      fiatOrders: [fiat('BUY', 5_600, 'BTC', 0.001)],
      usdPerFiat: noRate,
    })
    expect(unknown.unknownCostQty).toBeCloseTo(0.001)
    expect(unknown.spentUsdt).toBe(0)
    expect(unknown.avgBuyPriceUsdt).toBeNull()
    expect(unknown.untrackedQty).toBe(0)              // acquisition is explained, only its cost is unknown
  })

  it('flags holdings the history does not explain and tolerates rounding', () => {
    const transferred = computeAssetPnl({
      asset: 'SOL',
      heldQty: 1,
      priceUsdt: 100,
      fills: [buy(0.4, 40)],
      fiatOrders: [],
      usdPerFiat: noRate,
    })
    expect(transferred.untrackedQty).toBeCloseTo(0.6)

    const dust = computeAssetPnl({
      asset: 'SOL',
      heldQty: 1.005,
      priceUsdt: 100,
      fills: [buy(1, 100)],
      fiatOrders: [],
      usdPerFiat: noRate,
    })
    expect(dust.untrackedQty).toBe(0)
  })

  it('returns null value and net when there is no price', () => {
    const pnl = computeAssetPnl({ asset: 'X', heldQty: 5, priceUsdt: null, fills: [buy(5, 50)], fiatOrders: [], usdPerFiat: noRate })
    expect(pnl.currentValueUsdt).toBeNull()
    expect(pnl.netUsdt).toBeNull()
    expect(pnl.spentUsdt).toBe(50)
  })
})

describe('summariseFunding', () => {
  it('totals fiat in and out per currency and tracks USDT bought and sold', () => {
    const funding = summariseFunding([
      fiat('BUY', 5_600, 'USDT', 100),
      fiat('BUY', 1_000, 'BTC', 0.0002),
      fiat('SELL', 2_800, 'USDT', 50),
      { source: 'p2p', side: 'BUY', fiatCurrency: 'USD', fiatAmount: 20, cryptoCurrency: 'USDT', cryptoAmount: 20, time: T0 },
    ])
    expect(funding).toEqual([
      { currency: 'PHP', totalIn: 6_600, totalOut: 2_800, usdtBought: 100, usdtSold: 50 },
      { currency: 'USD', totalIn: 20, totalOut: 0, usdtBought: 20, usdtSold: 0 },
    ])
  })
})

describe('totalCryptoPnl', () => {
  it('sums known nets and raises the flags', () => {
    const a = computeAssetPnl({ asset: 'A', heldQty: 1, priceUsdt: 10, fills: [buy(1, 8)], fiatOrders: [], usdPerFiat: noRate })
    const b = computeAssetPnl({ asset: 'B', heldQty: 2, priceUsdt: null, fills: [buy(2, 5)], fiatOrders: [], usdPerFiat: noRate })
    const c = computeAssetPnl({ asset: 'C', heldQty: 3, priceUsdt: 1, fills: [], fiatOrders: [], usdPerFiat: noRate })
    const totals = totalCryptoPnl([a, b, c])
    expect(totals.netUsdt).toBeCloseTo(2 + 3)
    expect(totals.currentValueUsdt).toBeCloseTo(13)
    expect(totals.spentUsdt).toBeCloseTo(13)
    expect(totals.hasUnknownCost).toBe(false)
    expect(totals.hasUntracked).toBe(true)
    expect(totals.hasIgnoredFees).toBe(false)
  })
})
