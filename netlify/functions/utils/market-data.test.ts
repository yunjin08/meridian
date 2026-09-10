import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cached,
  clearMarketDataCache,
  fetchCryptoMarket,
  fetchMacroSnapshot,
  MissingFredKeyError,
  parseFredObservations,
  toCpiYoYPoint,
  toFearGreed,
  toFunding,
  toGlobalStats,
} from './market-data.ts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  clearMarketDataCache()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('FRED_API_KEY', 'test-key')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('parseFredObservations', () => {
  it('skips the "." placeholder FRED uses for missing days', () => {
    const parsed = parseFredObservations([
      { date: '2026-09-08', value: '.' },
      { date: '2026-09-05', value: '4.12' },
      { date: '2026-09-04', value: 'garbage' },
      { date: '2026-09-03', value: '4.10' },
    ])
    expect(parsed).toEqual([
      { date: '2026-09-05', value: 4.12 },
      { date: '2026-09-03', value: 4.1 },
    ])
  })
})

describe('toCpiYoYPoint', () => {
  it('computes the change against the same month a year earlier', () => {
    const obs = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-${String(14 - i).padStart(2, '0')}-01`,
      value: 300 - i, // newest first: 300, 299, ... 287
    }))
    const p = toCpiYoYPoint(obs)
    expect(p.value).toBeCloseTo((300 / 288 - 1) * 100, 2)
    expect(p.previous).toBeCloseTo((299 / 287 - 1) * 100, 2)
    expect(p.date).toBe('2026-14-01')
  })

  it('is null without twelve months of history', () => {
    const p = toCpiYoYPoint([{ date: '2026-08-01', value: 300 }])
    expect(p.value).toBeNull()
    expect(p.date).toBeNull()
  })
})

describe('cached', () => {
  it('returns the stored value inside the TTL and reloads after it', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => Math.random())
    const a = await cached('k', 1_000, load)
    const b = await cached('k', 1_000, load)
    expect(b).toBe(a)
    expect(load).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1_001)
    await cached('k', 1_000, load)
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('fetchMacroSnapshot', () => {
  it('throws a typed error when FRED_API_KEY is missing', async () => {
    vi.stubEnv('FRED_API_KEY', '')
    await expect(fetchMacroSnapshot()).rejects.toBeInstanceOf(MissingFredKeyError)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('keeps the other series when one FRED request fails', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('series_id=DGS10')) return jsonResponse({ error_message: 'nope' }, 500)
      if (url.includes('series_id=CPIAUCSL')) {
        const observations = Array.from({ length: 14 }, (_, i) => ({ date: `d${i}`, value: String(300 - i) }))
        return jsonResponse({ observations })
      }
      return jsonResponse({ observations: [{ date: '2026-08-01', value: '4.33' }, { date: '2026-07-01', value: '4.30' }] })
    })

    const snap = await fetchMacroSnapshot()
    const byId = Object.fromEntries(snap.series.map((s) => [s.id, s]))
    expect(byId['FEDFUNDS']).toMatchObject({ value: 4.33, previous: 4.3, date: '2026-08-01' })
    expect(byId['DGS10']).toMatchObject({ value: null, previous: null, date: null })
    expect(snap.cpiYoY.value).toBeCloseTo((300 / 288 - 1) * 100, 2)
    // 10 regular series + CPI
    expect(fetchMock).toHaveBeenCalledTimes(11)
  })

  it('does not cache a snapshot where every series failed', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error_message: 'Bad Request. The value for variable api_key is not registered.' }, 400))
    await expect(fetchMacroSnapshot()).rejects.toThrow(/Every FRED series failed/)
    fetchMock.mockResolvedValue(jsonResponse({ observations: [{ date: '2026-08-01', value: '1' }] }))
    const snap = await fetchMacroSnapshot()
    expect(snap.series[0]?.value).toBe(1)
  })

  it('does not hit FRED again within the cache window', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ observations: [{ date: '2026-08-01', value: '1' }] }))
    await fetchMacroSnapshot()
    await fetchMacroSnapshot()
    expect(fetchMock).toHaveBeenCalledTimes(11)
  })
})

describe('crypto market mapping', () => {
  it('maps the CoinGecko global payload', () => {
    const stats = toGlobalStats({
      data: {
        total_market_cap: { usd: 2_693_043_765_043.978, btc: 1 },
        market_cap_change_percentage_24h_usd: -1.23,
        market_cap_percentage: { btc: 58.1, eth: 12.4 },
      },
    })
    expect(stats).toEqual({
      totalMarketCapUsd: 2_693_043_765_043.978,
      marketCapChange24hPct: -1.23,
      btcDominancePct: 58.1,
      ethDominancePct: 12.4,
    })
  })

  it('maps Fear & Greed with yesterday as previous', () => {
    expect(
      toFearGreed({
        data: [
          { value: '66', value_classification: 'Greed' },
          { value: '69', value_classification: 'Greed' },
        ],
      })
    ).toEqual({ value: 66, label: 'Greed', previous: 69 })
    expect(toFearGreed({ data: [] })).toBeNull()
  })

  it('converts the funding rate to a percentage', () => {
    const f = toFunding(
      { markPrice: '78418.4', lastFundingRate: '0.00006622', nextFundingTime: 1_788_998_400_000 },
      { openInterest: '105062.627' }
    )
    expect(f.markPrice).toBe(78418.4)
    expect(f.lastFundingRatePct).toBeCloseTo(0.006622, 6)
    expect(f.openInterest).toBe(105062.627)
    expect(toFunding({ markPrice: '1', lastFundingRate: '0', nextFundingTime: 0 }, null).openInterest).toBeNull()
  })
})

describe('fetchCryptoMarket', () => {
  it('leaves funding null when Binance futures rejects the symbol but keeps the rest', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('coingecko')) {
        return jsonResponse({
          data: { total_market_cap: { usd: 2e12 }, market_cap_change_percentage_24h_usd: 0.5, market_cap_percentage: { btc: 55, eth: 12 } },
        })
      }
      if (url.includes('alternative.me')) return jsonResponse({ data: [{ value: '40', value_classification: 'Fear' }] })
      return jsonResponse({ code: -1121, msg: 'Invalid symbol.' }, 400)
    })

    const snap = await fetchCryptoMarket('foousdt')
    expect(snap.symbol).toBe('FOOUSDT')
    expect(snap.totalMarketCapUsd).toBe(2e12)
    expect(snap.fearGreed).toEqual({ value: 40, label: 'Fear', previous: null })
    expect(snap.funding).toBeNull()
  })

  it('sends the CoinGecko demo key header when configured', async () => {
    vi.stubEnv('COINGECKO_API_KEY', 'demo-123')
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }))
    await fetchCryptoMarket('BTCUSDT')
    const cgCall = fetchMock.mock.calls.find(([input]) => String(input).includes('coingecko'))
    expect(cgCall).toBeDefined()
    const headers = (cgCall?.[1] as RequestInit | undefined)?.headers as Record<string, string>
    expect(headers['x-cg-demo-api-key']).toBe('demo-123')
  })
})
