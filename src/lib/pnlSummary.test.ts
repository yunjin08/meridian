import { describe, expect, it } from 'vitest'
import { summarisePnl } from '@/lib/pnlSummary'
import type { StockAccountSummary, StockHolding, StockPosition } from '@/types/portfolio'
import type { CryptoAssetPnl, CryptoPnlResponse } from '@/types/pnl'

function asset(name: string, netUsdt: number | null, spent = 100): CryptoAssetPnl {
  return {
    asset: name, heldQty: 1, priceUsdt: 1, currentValueUsdt: netUsdt === null ? null : spent + netUsdt,
    boughtQty: 1, soldQty: 0, spentUsdt: spent, receivedUsdt: 0, avgBuyPriceUsdt: spent,
    netUsdt, unknownCostQty: 0, untrackedQty: 0, ignoredFeeAssets: [],
  }
}
function cryptoResponse(assets: CryptoAssetPnl[]): CryptoPnlResponse {
  const known = assets.filter((a) => a.netUsdt !== null)
  return {
    assets,
    totals: {
      currentValueUsdt: known.reduce((s, a) => s + (a.currentValueUsdt ?? 0), 0),
      spentUsdt: assets.reduce((s, a) => s + a.spentUsdt, 0),
      receivedUsdt: 0,
      netUsdt: known.reduce((s, a) => s + (a.netUsdt ?? 0), 0),
      hasUnknownCost: false,
      hasUntracked: false,
      hasIgnoredFees: false,
    },
    funding: [{ currency: 'PHP', totalIn: 20_000, totalOut: 0, usdtBought: 350, usdtSold: 0 }],
    warnings: [],
    fetchedAt: 1,
  }
}
function position(ticker: string, unrealizedPnl: number, totalCost = 100): StockPosition {
  return {
    ticker, t212Ticker: `${ticker}_US_EQ`, name: ticker, quantity: 1, avgPrice: totalCost, currentPrice: totalCost + unrealizedPnl,
    currency: 'USD', currentValue: totalCost + unrealizedPnl, totalCost, unrealizedPnl, fxImpact: 0, openedAt: 1,
  }
}
const account: StockAccountSummary = {
  currency: 'GBP', totalValue: 0, cashAvailable: 0, cashInPies: 0, cashReserved: 0,
  invested: 0, investedCost: 0, unrealizedPnl: 30, realizedPnl: -5,
}
const watchlist: StockHolding[] = [
  { ticker: 'AAPL', assetClass: 'stock', shares: 1, source: 'trading212' },
  { ticker: 'O', assetClass: 'reit', shares: 1, source: 'trading212' },
]

describe('summarisePnl', () => {
  it('is null until something has loaded', () => {
    const s = summarisePnl({ cryptoPnl: null, positions: {}, account: null, stocks: [] })
    expect(s.total).toBeNull()
    expect(s.crypto).toBeNull()
    expect(s.equities).toBeNull()
  })

  it('summarises crypto with percent on spend and sorts assets by absolute net', () => {
    const s = summarisePnl({
      cryptoPnl: cryptoResponse([asset('ETH', 20), asset('BTC', -50), asset('X', null)]),
      positions: {}, account: null, stocks: [],
    })
    expect(s.crypto?.net).toBe(-30)
    expect(s.crypto?.spent).toBe(300)
    expect(s.crypto?.netPercent).toBeCloseTo(-10)
    expect(s.crypto?.assets.map((a) => a.asset)).toEqual(['BTC', 'ETH', 'X'])
    expect(s.total).toBe(-30)
    expect(s.totalCurrency).toBe('USD')
    expect(s.isMixedCurrency).toBe(false)
  })

  it('splits Trading 212 unrealized by stock and REIT and keeps realized at account level', () => {
    const s = summarisePnl({
      cryptoPnl: null,
      positions: { AAPL: position('AAPL', 25), O: position('O', 5), MSFT: position('MSFT', -3) },
      account,
      stocks: watchlist,
    })
    expect(s.equities?.currency).toBe('GBP')
    expect(s.equities?.unrealized).toBe(30)
    expect(s.equities?.realized).toBe(-5)
    expect(s.equities?.net).toBe(25)
    expect(s.equities?.stocks.unrealized).toBe(22)           // AAPL 25, MSFT (unclassified -> stock) -3
    expect(s.equities?.stocks.positions.map((p) => p.ticker)).toEqual(['AAPL', 'MSFT'])
    expect(s.equities?.stocks.positions[0]?.unrealizedPercent).toBeCloseTo(25)
    expect(s.equities?.reits.unrealized).toBe(5)
    expect(s.total).toBe(25)
    expect(s.totalCurrency).toBe('GBP')
    expect(s.isMixedCurrency).toBe(false)
  })

  it('adds both sources and flags a currency mix', () => {
    const s = summarisePnl({
      cryptoPnl: cryptoResponse([asset('ETH', 20)]),
      positions: { AAPL: position('AAPL', 25) },
      account,
      stocks: watchlist,
    })
    expect(s.total).toBe(20 + 25)
    expect(s.totalCurrency).toBe('USD')
    expect(s.isMixedCurrency).toBe(true)
  })
})
