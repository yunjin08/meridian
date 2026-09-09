import type {
  CryptoMarketSnapshot,
  FearGreedReading,
  FundingReading,
  MacroSeriesPoint,
  MacroSnapshot,
} from '../../../src/types/market.ts'

// One free-tier upstream call is slow enough to eat a whole chat turn, so
// every fetch here is bounded and every provider is cached independently.
const FETCH_TIMEOUT_MS = 8_000
export const MACRO_TTL_MS = 60 * 60 * 1_000
export const CRYPTO_TTL_MS = 60 * 1_000

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations'
const COINGECKO_GLOBAL = 'https://api.coingecko.com/api/v3/global'
const FEAR_GREED = 'https://api.alternative.me/fng/?limit=2'
const BINANCE_FUTURES = 'https://fapi.binance.com'

export class MarketDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MarketDataError'
  }
}

export class MissingFredKeyError extends MarketDataError {
  constructor() {
    super('FRED_API_KEY is not set')
    this.name = 'MissingFredKeyError'
  }
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  value: unknown
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

/**
 * Module-level cache shared by warm function instances. A cold start refetches,
 * which is acceptable at these rate limits for a single owner; it is what lets
 * us skip Netlify Blobs and a database table.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && hit.expiresAt > now) return hit.value as T
  const value = await load()
  cache.set(key, { value, expiresAt: now + ttlMs })
  return value
}

export function clearMarketDataCache(): void {
  cache.clear()
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
  if (!res.ok) throw new MarketDataError(`HTTP ${res.status} from ${new URL(url).hostname}`)
  return (await res.json()) as T
}

// ---------------------------------------------------------------------------
// FRED
// ---------------------------------------------------------------------------

interface FredSeriesSpec {
  id: string
  label: string
  unit: string
  /** How many observations to request; daily series need slack for '.' gaps. */
  limit: number
}

export const FRED_SERIES: readonly FredSeriesSpec[] = [
  { id: 'FEDFUNDS', label: 'Fed funds effective rate', unit: '%', limit: 2 },
  { id: 'UNRATE', label: 'Unemployment rate', unit: '%', limit: 2 },
  { id: 'DGS2', label: '2y Treasury yield', unit: '%', limit: 6 },
  { id: 'DGS10', label: '10y Treasury yield', unit: '%', limit: 6 },
  { id: 'T10Y2Y', label: '10y minus 2y spread', unit: 'pp', limit: 6 },
  { id: 'DTWEXBGS', label: 'Broad dollar index', unit: 'index', limit: 6 },
]

// 14 observations: latest and prior month, each with its own year-earlier value.
const CPI_SPEC: FredSeriesSpec = { id: 'CPIAUCSL', label: 'CPI year on year', unit: '%', limit: 14 }

interface FredObservation {
  date: string
  value: string
}

interface FredObservationsResponse {
  observations?: FredObservation[]
}

interface ParsedObservation {
  date: string
  value: number
}

/** FRED marks missing days with a literal '.', which must not become NaN. */
export function parseFredObservations(raw: FredObservation[]): ParsedObservation[] {
  const out: ParsedObservation[] = []
  for (const o of raw) {
    if (o.value === '.') continue
    const value = Number.parseFloat(o.value)
    if (Number.isNaN(value)) continue
    out.push({ date: o.date, value })
  }
  return out
}

function emptyPoint(spec: FredSeriesSpec): MacroSeriesPoint {
  return { id: spec.id, label: spec.label, unit: spec.unit, value: null, previous: null, date: null }
}

async function fetchFredSeries(spec: FredSeriesSpec, apiKey: string): Promise<ParsedObservation[]> {
  const params = new URLSearchParams({
    series_id: spec.id,
    api_key: apiKey,
    file_type: 'json',
    sort_order: 'desc',
    limit: String(spec.limit),
  })
  const data = await fetchJson<FredObservationsResponse>(`${FRED_BASE}?${params.toString()}`)
  return parseFredObservations(data.observations ?? [])
}

/** Observations arrive newest first. */
export function toSeriesPoint(spec: FredSeriesSpec, obs: ParsedObservation[]): MacroSeriesPoint {
  const latest = obs[0]
  if (!latest) return emptyPoint(spec)
  return {
    id: spec.id,
    label: spec.label,
    unit: spec.unit,
    value: latest.value,
    previous: obs[1]?.value ?? null,
    date: latest.date,
  }
}

/**
 * CPI is published as an index level; the number people mean by "inflation"
 * is the change against the same month a year earlier.
 */
export function toCpiYoYPoint(obs: ParsedObservation[]): MacroSeriesPoint {
  const latest = obs[0]
  const yearAgo = obs[12]
  const prior = obs[1]
  const priorYearAgo = obs[13]
  if (!latest || !yearAgo) return emptyPoint(CPI_SPEC)
  const yoy = (latest.value / yearAgo.value - 1) * 100
  const previous = prior && priorYearAgo ? (prior.value / priorYearAgo.value - 1) * 100 : null
  return {
    id: CPI_SPEC.id,
    label: CPI_SPEC.label,
    unit: CPI_SPEC.unit,
    value: Number(yoy.toFixed(2)),
    previous: previous == null ? null : Number(previous.toFixed(2)),
    date: latest.date,
  }
}

async function loadMacroSnapshot(): Promise<MacroSnapshot> {
  const apiKey = process.env['FRED_API_KEY']
  if (!apiKey) throw new MissingFredKeyError()

  // One failed series must not blank the whole snapshot; the model can say
  // which figure is missing instead.
  const settled = await Promise.allSettled([
    ...FRED_SERIES.map((spec) => fetchFredSeries(spec, apiKey)),
    fetchFredSeries(CPI_SPEC, apiKey),
  ])

  const series = FRED_SERIES.map((spec, i) => {
    const r = settled[i]
    if (!r || r.status === 'rejected') {
      console.error(`[market-data] FRED ${spec.id} failed:`, r?.status === 'rejected' ? r.reason : 'missing')
      return emptyPoint(spec)
    }
    return toSeriesPoint(spec, r.value)
  })

  const cpiResult = settled[FRED_SERIES.length]
  const cpiYoY =
    cpiResult && cpiResult.status === 'fulfilled' ? toCpiYoYPoint(cpiResult.value) : emptyPoint(CPI_SPEC)
  if (cpiResult?.status === 'rejected') console.error('[market-data] FRED CPIAUCSL failed:', cpiResult.reason)

  // An outage or rejected key must not be pinned in the cache for an hour.
  if (cpiYoY.value == null && series.every((p) => p.value == null)) {
    throw new MarketDataError('Every FRED series failed')
  }

  return { series, cpiYoY, fetchedAt: Date.now() }
}

export function fetchMacroSnapshot(): Promise<MacroSnapshot> {
  return cached('macro', MACRO_TTL_MS, loadMacroSnapshot)
}

// ---------------------------------------------------------------------------
// Crypto market: CoinGecko global, Fear & Greed, Binance futures funding
// ---------------------------------------------------------------------------

interface CoinGeckoGlobalResponse {
  data?: {
    total_market_cap?: Record<string, number>
    market_cap_change_percentage_24h_usd?: number
    market_cap_percentage?: Record<string, number>
  }
}

interface FearGreedResponse {
  data?: Array<{ value: string; value_classification: string }>
}

interface PremiumIndexResponse {
  markPrice: string
  lastFundingRate: string
  nextFundingTime: number
}

interface OpenInterestResponse {
  openInterest: string
}

type GlobalStats = Pick<
  CryptoMarketSnapshot,
  'totalMarketCapUsd' | 'marketCapChange24hPct' | 'btcDominancePct' | 'ethDominancePct'
>

export function toGlobalStats(raw: CoinGeckoGlobalResponse): GlobalStats {
  const d = raw.data
  return {
    totalMarketCapUsd: d?.total_market_cap?.['usd'] ?? null,
    marketCapChange24hPct: d?.market_cap_change_percentage_24h_usd ?? null,
    btcDominancePct: d?.market_cap_percentage?.['btc'] ?? null,
    ethDominancePct: d?.market_cap_percentage?.['eth'] ?? null,
  }
}

export function toFearGreed(raw: FearGreedResponse): FearGreedReading | null {
  const today = raw.data?.[0]
  if (!today) return null
  const value = Number.parseInt(today.value, 10)
  if (Number.isNaN(value)) return null
  const prevRaw = raw.data?.[1]?.value
  const previous = prevRaw == null ? null : Number.parseInt(prevRaw, 10)
  return { value, label: today.value_classification, previous: previous == null || Number.isNaN(previous) ? null : previous }
}

export function toFunding(premium: PremiumIndexResponse, oi: OpenInterestResponse | null): FundingReading {
  return {
    markPrice: Number.parseFloat(premium.markPrice),
    lastFundingRatePct: Number.parseFloat(premium.lastFundingRate) * 100,
    nextFundingTime: premium.nextFundingTime,
    openInterest: oi ? Number.parseFloat(oi.openInterest) : null,
  }
}

function coinGeckoHeaders(): Record<string, string> {
  const key = process.env['COINGECKO_API_KEY']
  return key ? { 'x-cg-demo-api-key': key } : {}
}

function loadGlobalStats(): Promise<GlobalStats> {
  return cached('cg-global', CRYPTO_TTL_MS, async () =>
    toGlobalStats(await fetchJson<CoinGeckoGlobalResponse>(COINGECKO_GLOBAL, coinGeckoHeaders()))
  )
}

function loadFearGreed(): Promise<FearGreedReading | null> {
  return cached('fng', CRYPTO_TTL_MS, async () => toFearGreed(await fetchJson<FearGreedResponse>(FEAR_GREED)))
}

function loadFunding(symbol: string): Promise<FundingReading> {
  return cached(`funding-${symbol}`, CRYPTO_TTL_MS, async () => {
    const premium = await fetchJson<PremiumIndexResponse>(
      `${BINANCE_FUTURES}/fapi/v1/premiumIndex?symbol=${encodeURIComponent(symbol)}`
    )
    const oi = await fetchJson<OpenInterestResponse>(
      `${BINANCE_FUTURES}/fapi/v1/openInterest?symbol=${encodeURIComponent(symbol)}`
    ).catch(() => null)
    return toFunding(premium, oi)
  })
}

const EMPTY_GLOBAL: GlobalStats = {
  totalMarketCapUsd: null,
  marketCapChange24hPct: null,
  btcDominancePct: null,
  ethDominancePct: null,
}

/**
 * Each provider fails independently so a CoinGecko outage still leaves the
 * funding and sentiment figures. Not-a-perp symbols simply get funding: null.
 */
export async function fetchCryptoMarket(symbol: string): Promise<CryptoMarketSnapshot> {
  const upper = symbol.toUpperCase()
  const [global, fearGreed, funding] = await Promise.allSettled([
    loadGlobalStats(),
    loadFearGreed(),
    loadFunding(upper),
  ])

  if (global.status === 'rejected') console.error('[market-data] coingecko failed:', global.reason)
  if (fearGreed.status === 'rejected') console.error('[market-data] fear & greed failed:', fearGreed.reason)
  if (funding.status === 'rejected') console.error(`[market-data] funding ${upper} failed:`, funding.reason)

  return {
    symbol: upper,
    ...(global.status === 'fulfilled' ? global.value : EMPTY_GLOBAL),
    fearGreed: fearGreed.status === 'fulfilled' ? fearGreed.value : null,
    funding: funding.status === 'fulfilled' ? funding.value : null,
    fetchedAt: Date.now(),
  }
}
