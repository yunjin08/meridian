const BASE_URLS = {
  live: 'https://live.trading212.com/api/v0',
  demo: 'https://demo.trading212.com/api/v0',
} as const

type Trading212Env = keyof typeof BASE_URLS

export class Trading212Error extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'Trading212Error'
  }
}

function getBaseUrl(): string {
  const env = process.env['TRADING212_ENV']
  const key: Trading212Env = env === 'demo' ? 'demo' : 'live'
  return BASE_URLS[key]
}

function getAuthHeader(): string {
  const key = process.env['TRADING212_API_KEY']
  const secret = process.env['TRADING212_API_SECRET']
  if (!key || !secret) {
    throw new Trading212Error(0, 'Trading 212 API credentials are not configured')
  }
  // The API authenticates with HTTP Basic: key as username, secret as password.
  return `Basic ${Buffer.from(`${key}:${secret}`, 'utf8').toString('base64')}`
}

const STATUS_MESSAGES: Record<number, string> = {
  401: 'Trading 212 rejected the API key',
  403: 'Trading 212 API key is missing a required scope',
  408: 'Trading 212 timed out',
  429: 'Trading 212 rate limit exceeded',
}

/** Fetch a Trading 212 endpoint. Path is relative to /api/v0, e.g. "/equity/positions". */
export async function t212Fetch<T>(path: string): Promise<T> {
  const url = `${getBaseUrl()}${path}`
  const res = await fetch(url, { headers: { Authorization: getAuthHeader() } })

  // Limits are per account and shared with any other tool using this account,
  // so log what is left to make 429s diagnosable.
  const remaining = res.headers.get('x-ratelimit-remaining')
  const reset = res.headers.get('x-ratelimit-reset')
  if (remaining !== null) {
    console.log(`[trading212] ${path} rate limit remaining: ${remaining}, resets at ${reset ?? '?'}`)
  }

  if (!res.ok) {
    const message = STATUS_MESSAGES[res.status] ?? `Trading 212 HTTP ${res.status}`
    throw new Trading212Error(res.status, message)
  }

  return res.json() as Promise<T>
}

/**
 * Map a Trading 212 ticker to the plain symbol the rest of the dashboard uses
 * for Finnhub quotes and charts.
 *
 *   AAPL_US_EQ -> AAPL
 *   VUSAl_EQ   -> VUSA   (lowercase exchange suffix dropped)
 *   SXR8d_EQ   -> SXR8
 */
export function toDashboardTicker(t212Ticker: string): string {
  const base = t212Ticker.split('_')[0] ?? t212Ticker
  return base.replace(/[a-z]$/, '').toUpperCase()
}
