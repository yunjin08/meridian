import { describe, expect, it } from 'vitest'
import { summarisePortfolio, TOP_HOLDINGS_LIMIT, type PortfolioSummaryInput } from '@/lib/portfolioSummary'
import type { SymbolPrice } from '@/store/priceStore'
import type { CryptoHolding, StockAccountSummary, StockHolding, StockPosition, StockQuote } from '@/types/portfolio'

function crypto(asset: string, usdtValue: number): CryptoHolding {
  return { asset, symbol: asset === 'USDT' ? 'USDT' : `${asset}USDT`, free: 1, locked: 0, usdtValue }
}
function price(changePercent: number): SymbolPrice {
  return { price: 1, changePercent, high24h: 1, low24h: 1, volume24h: 1, lastTickAt: 1 }
}
function quote(ticker: string, p: number, changePercent: number, fetchedAt = 1_000): StockQuote {
  return { ticker, price: p, change: 0, changePercent, high: p, low: p, fetchedAt }
}
function position(ticker: string, currentValue: number): StockPosition {
  return {
    ticker, t212Ticker: `${ticker}_US_EQ`, name: ticker, quantity: 1, avgPrice: 1, currentPrice: 1,
    currency: 'USD', currentValue, totalCost: currentValue, unrealizedPnl: 0, fxImpact: 0, openedAt: 1,
  }
}
const gbpAccount: StockAccountSummary = {
  currency: 'GBP', totalValue: 0, cashAvailable: 0, cashInPies: 0, cashReserved: 0,
  invested: 0, investedCost: 0, unrealizedPnl: 0, realizedPnl: 0,
}
const empty: PortfolioSummaryInput = {
  balance: null, cryptoHoldings: [], prices: {}, stocks: [], quotes: {}, positions: {}, account: null, positionsFetchedAt: null,
}

describe('summarisePortfolio', () => {
  it('returns zeros for empty input', () => {
    const s = summarisePortfolio(empty)
    expect(s.total).toBe(0)
    expect(s.totalCurrency).toBe('USD')
    expect(s.isMixedCurrency).toBe(false)
    expect(s.change24hPercent).toBeNull()
    expect(s.asOf).toBeNull()
    expect(s.topHoldings).toEqual([])
    expect(s.classes.crypto.holdingCount).toBe(0)
  })

  it('totals each class, preferring Trading 212 values, and aggregates 24h change', () => {
    const holdings = [crypto('BTC', 1_000), crypto('USDT', 500)]
    const stocks: StockHolding[] = [
      { ticker: 'AAPL', assetClass: 'stock', shares: 10, source: 'trading212' },
      { ticker: 'O', assetClass: 'reit', shares: 4 },
      { ticker: 'MSFT', assetClass: 'stock' },
    ]
    const s = summarisePortfolio({
      ...empty,
      balance: { holdings, totalUsdtValue: 1_500, fetchedAt: 2_000 },
      cryptoHoldings: holdings,
      prices: { BTCUSDT: price(10) },
      stocks,
      quotes: { AAPL: quote('AAPL', 20, -5, 3_000), O: quote('O', 50, 2) },
      positions: { AAPL: position('AAPL', 250) },   // wins over 10 x 20
      account: { ...gbpAccount, currency: 'USD' },
      positionsFetchedAt: 4_000,
    })

    expect(s.classes.crypto.value).toBe(1_500)
    expect(s.classes.crypto.change24hUsd).toBeCloseTo(100)   // BTC 1000 x 10%, USDT has no price entry
    expect(s.classes.stock.value).toBe(250)
    expect(s.classes.stock.change24hUsd).toBeCloseTo(-12.5)  // quote change applied to the T212 value
    expect(s.classes.stock.holdingCount).toBe(2)
    expect(s.classes.stock.unpricedCount).toBe(1)
    expect(s.classes.reit.value).toBe(200)
    expect(s.classes.reit.change24hUsd).toBeCloseTo(4)

    expect(s.total).toBe(1_950)
    expect(s.totalCurrency).toBe('USD')
    expect(s.isMixedCurrency).toBe(false)
    expect(s.change24hUsd).toBeCloseTo(91.5)
    expect(s.change24hPercent).toBeCloseTo((91.5 / (1_950 - 91.5)) * 100)
    expect(s.asOf).toBe(4_000)
  })

  it('reports the Trading 212 currency and flags a mix with crypto', () => {
    const stocks: StockHolding[] = [{ ticker: 'VUSA', assetClass: 'stock', shares: 1, source: 'trading212' }]
    const onlyStocks = summarisePortfolio({
      ...empty, stocks, positions: { VUSA: position('VUSA', 300) }, account: gbpAccount,
    })
    expect(onlyStocks.totalCurrency).toBe('GBP')
    expect(onlyStocks.isMixedCurrency).toBe(false)
    expect(onlyStocks.classes.stock.currency).toBe('GBP')
    expect(onlyStocks.topHoldings[0]?.currency).toBe('GBP')

    const holdings = [crypto('BTC', 100)]
    const mixed = summarisePortfolio({
      ...empty, balance: { holdings, totalUsdtValue: 100, fetchedAt: 1 }, cryptoHoldings: holdings,
      stocks, positions: { VUSA: position('VUSA', 300) }, account: gbpAccount,
    })
    expect(mixed.totalCurrency).toBe('USD')
    expect(mixed.isMixedCurrency).toBe(true)
  })

  it('ranks top holdings across classes and truncates', () => {
    const holdings = Array.from({ length: 6 }, (_, i) => crypto(`C${i}`, 100 + i))
    const stocks: StockHolding[] = Array.from({ length: 6 }, (_, i) => ({ ticker: `S${i}`, assetClass: 'stock', shares: 1 }))
    const quotes = Object.fromEntries(stocks.map((st, i) => [st.ticker, quote(st.ticker, 200 + i, 0)]))
    const s = summarisePortfolio({
      ...empty, balance: { holdings, totalUsdtValue: 0, fetchedAt: 1 }, cryptoHoldings: holdings, stocks, quotes,
    })
    expect(s.topHoldings).toHaveLength(TOP_HOLDINGS_LIMIT)
    expect(s.topHoldings[0]?.symbol).toBe('S5')
    expect(s.topHoldings[0]?.assetClass).toBe('stock')
    expect(s.topHoldings[7]?.value).toBe(104)
  })
})
