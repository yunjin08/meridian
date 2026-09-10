import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DashboardContext } from '../../../src/types/chat.ts'
import type { CandlesResponse } from '../../../src/types/candle.ts'

vi.mock('./market-data.ts', () => {
  class MarketDataError extends Error {}
  class MissingFredKeyError extends MarketDataError {}
  return {
    MarketDataError,
    MissingFredKeyError,
    fetchMacroSnapshot: vi.fn(),
    fetchCryptoMarket: vi.fn(),
  }
})

vi.mock('./klines.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./klines.ts')>()
  return { ...actual, fetchCandlesWithIndicators: vi.fn() }
})

vi.mock('./finnhub-client.ts', () => {
  class FinnhubError extends Error {
    constructor(public readonly status: number, message: string) {
      super(message)
    }
  }
  return { FinnhubError, finnhubFetch: vi.fn() }
})

vi.mock('./binance-client.ts', () => {
  class BinanceError extends Error {
    constructor(public readonly code: number, message: string) {
      super(message)
    }
  }
  return { BinanceError, binancePublicFetch: vi.fn() }
})

import { fetchCryptoMarket, fetchMacroSnapshot, MissingFredKeyError } from './market-data.ts'
import { fetchCandlesWithIndicators } from './klines.ts'
import { BinanceError } from './binance-client.ts'
import { finnhubFetch, FinnhubError } from './finnhub-client.ts'
import { CHAT_TOOLS, executeReadTool, formatCandlesSummary, isReadTool, READ_TOOL_NAMES } from './chat-tools.ts'

const ctx = { activeSymbol: 'ETHUSDT' } as DashboardContext

beforeEach(() => {
  vi.mocked(fetchMacroSnapshot).mockReset()
  vi.mocked(fetchCryptoMarket).mockReset()
  vi.mocked(fetchCandlesWithIndicators).mockReset()
  vi.mocked(finnhubFetch).mockReset()
})

describe('tool registry', () => {
  it('exposes every read tool to the model and classifies names', () => {
    const names = CHAT_TOOLS.map((t) => t.name)
    for (const read of READ_TOOL_NAMES) expect(names).toContain(read)
    expect(names).toContain('add_alert')
    expect(isReadTool('get_candles')).toBe(true)
    expect(isReadTool('add_alert')).toBe(false)
  })
})

describe('get_macro_snapshot', () => {
  it('formats each series with value, previous and date', async () => {
    vi.mocked(fetchMacroSnapshot).mockResolvedValue({
      series: [
        { id: 'FEDFUNDS', label: 'Fed funds effective rate', unit: '%', value: 4.33, previous: 4.3, date: '2026-08-01' },
        { id: 'DGS10', label: '10y Treasury yield', unit: '%', value: null, previous: null, date: null },
      ],
      cpiYoY: { id: 'CPIAUCSL', label: 'CPI year on year', unit: '%', value: 2.9, previous: 3.1, date: '2026-08-01' },
      fetchedAt: 0,
    })
    const out = await executeReadTool('get_macro_snapshot', {}, ctx)
    expect(out.content).toContain('CPI year on year: 2.90% (previous 3.10%), as of 2026-08-01')
    expect(out.content).toContain('Fed funds effective rate: 4.33% (previous 4.30%)')
    expect(out.content).toContain('10y Treasury yield: unavailable')
    expect(out.lookup).toEqual({ name: 'get_macro_snapshot', summary: 'US macro snapshot' })
  })

  it('shows index levels as a move, not a bare number', async () => {
    vi.mocked(fetchMacroSnapshot).mockResolvedValue({
      series: [
        { id: 'SP500', label: 'S&P 500', unit: 'index', value: 6400, previous: 6500, date: '2026-09-09' },
        { id: 'VIXCLS', label: 'VIX volatility index', unit: 'index', value: 22, previous: 18, date: '2026-09-09' },
      ],
      cpiYoY: { id: 'CPIAUCSL', label: 'CPI year on year', unit: '%', value: null, previous: null, date: null },
      fetchedAt: 0,
    })
    const out = await executeReadTool('get_macro_snapshot', {}, ctx)
    expect(out.content).toContain('S&P 500: 6400.00 (previous 6500.00, -1.54%), as of 2026-09-09')
    expect(out.content).toContain('VIX volatility index: 22.00 (previous 18.00, +22.22%)')
  })

  it('tells the model macro data is not configured instead of throwing', async () => {
    vi.mocked(fetchMacroSnapshot).mockRejectedValue(new MissingFredKeyError())
    const out = await executeReadTool('get_macro_snapshot', {}, ctx)
    expect(out.content).toMatch(/not configured/)
    expect(out.content).toMatch(/do not guess/)
  })
})

describe('get_crypto_market', () => {
  it('defaults the funding symbol to the active chart symbol', async () => {
    vi.mocked(fetchCryptoMarket).mockResolvedValue({
      symbol: 'ETHUSDT',
      totalMarketCapUsd: 2.69e12,
      marketCapChange24hPct: -1.5,
      btcDominancePct: 58.12,
      ethDominancePct: 12.4,
      fearGreed: { value: 66, label: 'Greed', previous: 69 },
      funding: { markPrice: 4321.5, lastFundingRatePct: 0.01, nextFundingTime: 0, openInterest: 123456 },
      fetchedAt: 0,
    })
    const out = await executeReadTool('get_crypto_market', {}, ctx)
    expect(fetchCryptoMarket).toHaveBeenCalledWith('ETHUSDT')
    expect(out.content).toContain('$2.69T (-1.50% 24h)')
    expect(out.content).toContain('Fear & Greed: 66 (Greed), yesterday 69')
    expect(out.content).toContain('ETHUSDT perp: mark $4,321.50, last funding 0.0100% per funding interval, open interest 123,456 (base asset units)')
  })

  it('honours an explicit symbol', async () => {
    vi.mocked(fetchCryptoMarket).mockResolvedValue({
      symbol: 'SOLUSDT', totalMarketCapUsd: null, marketCapChange24hPct: null, btcDominancePct: null,
      ethDominancePct: null, fearGreed: null, funding: null, fetchedAt: 0,
    })
    const out = await executeReadTool('get_crypto_market', { symbol: ' solusdt ' }, ctx)
    expect(fetchCryptoMarket).toHaveBeenCalledWith('SOLUSDT')
    expect(out.content).toContain('SOLUSDT perp funding: unavailable')
    expect(out.lookup.summary).toBe('crypto market, SOLUSDT funding')
  })
})

function candles(n: number): CandlesResponse {
  const list = Array.from({ length: n }, (_, i) => ({
    time: 1_700_000_000 + i * 3600,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100.5 + i,
    volume: 1,
  }))
  const flat = (v: number) => Array.from({ length: n }, () => v)
  return {
    candles: list,
    indicators: {
      rsi: [Number.NaN, ...flat(55).slice(1)],
      macd: { macdLine: flat(1.2), signalLine: flat(1), histogram: flat(0.2) },
      bollingerBands: { upper: flat(160), middle: flat(150), lower: flat(140) },
    },
    interval: '4h',
    fetchedAt: 0,
  }
}

describe('get_stock_quote', () => {
  it('quotes several tickers and names the ones Finnhub has no data for', async () => {
    vi.mocked(finnhubFetch).mockImplementation(async (_path, params) => {
      const symbol = String((params as { symbol: string }).symbol)
      if (symbol === 'SPY') return { c: 640.12, d: -6.4, dp: -0.99, h: 648, l: 638.5, o: 647, pc: 646.52, t: 0 }
      return { c: 0, d: 0, dp: 0, h: 0, l: 0, o: 0, pc: 0, t: 0 }
    })
    const out = await executeReadTool('get_stock_quote', { tickers: [' spy ', 'NOPE', 'spy'] }, ctx)
    expect(finnhubFetch).toHaveBeenCalledTimes(2)
    expect(out.content).toContain('SPY: $640.12 (-6.40 / -0.99% today), day range $638.50 to $648.00')
    expect(out.content).toContain('No data for: NOPE')
    expect(out.lookup.summary).toBe('quotes: SPY, NOPE')
  })

  it('caps the request at five tickers and rejects an empty list', async () => {
    vi.mocked(finnhubFetch).mockResolvedValue({ c: 1, d: 0, dp: 0, h: 1, l: 1, o: 1, pc: 1, t: 0 })
    await executeReadTool('get_stock_quote', { tickers: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }, ctx)
    expect(finnhubFetch).toHaveBeenCalledTimes(5)
    const empty = await executeReadTool('get_stock_quote', { tickers: [] }, ctx)
    expect(empty.content).toMatch(/needs at least one ticker/)
  })

  it('tells the model when Finnhub is not configured or unavailable', async () => {
    vi.mocked(finnhubFetch).mockRejectedValue(new Error('FINNHUB_API_KEY environment variable is not set'))
    const out = await executeReadTool('get_stock_quote', { tickers: ['SPY'] }, ctx)
    expect(out.content).toMatch(/not configured/)
    vi.mocked(finnhubFetch).mockRejectedValue(new FinnhubError(429, 'Finnhub HTTP 429'))
    const limited = await executeReadTool('get_stock_quote', { tickers: ['SPY'] }, ctx)
    expect(limited.content).toContain('HTTP 429')
  })
})

describe('get_candles', () => {
  it('summarises the window instead of returning raw candles', () => {
    const text = formatCandlesSummary('BTCUSDT', candles(60))
    expect(text).toContain('BTCUSDT 4h, 60 candles')
    expect(text).toContain('window high $160.00, low $99.00')
    expect(text).toContain('RSI(14) 55.00 (neutral)')
    expect(text).toContain('histogram 0.20 (bullish momentum)')
    expect(text).toContain('Bollinger upper $160.00, middle $150.00, lower $140.00')
    expect(text.length).toBeLessThan(1_000)
  })

  it('keeps precision for sub-dollar pairs', () => {
    const data = candles(50)
    for (const c of data.candles) {
      c.open = 0.0000123; c.high = 0.0000125; c.low = 0.000012; c.close = 0.0000124
    }
    const text = formatCandlesSummary('PEPEUSDT', data)
    expect(text).toContain('Last close $0.00001240')
    expect(text).not.toContain('$0.00,')
  })

  it('clamps the limit and uppercases the symbol', async () => {
    vi.mocked(fetchCandlesWithIndicators).mockResolvedValue(candles(50))
    const out = await executeReadTool('get_candles', { symbol: 'ethusdt', interval: '4h', limit: 5 }, ctx)
    expect(fetchCandlesWithIndicators).toHaveBeenCalledWith('ETHUSDT', '4h', 50)
    expect(out.lookup.summary).toBe('ETHUSDT 4h, 50 candles')
  })

  it('rejects an unsupported interval with the list of valid ones', async () => {
    const out = await executeReadTool('get_candles', { symbol: 'BTCUSDT', interval: '7h' }, ctx)
    expect(out.content).toMatch(/"7h" is not supported/)
    expect(out.content).toContain('1h, 2h, 4h')
    expect(fetchCandlesWithIndicators).not.toHaveBeenCalled()
  })

  it('turns a Binance rejection into actionable text', async () => {
    vi.mocked(fetchCandlesWithIndicators).mockRejectedValue(new BinanceError(-1121, 'Invalid symbol.'))
    const out = await executeReadTool('get_candles', { symbol: 'FOO', interval: '1h' }, ctx)
    expect(out.content).toContain('Binance rejected FOO: Invalid symbol.')
  })
})
