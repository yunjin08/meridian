import { createHmac } from 'node:crypto'

const BASE_URL = 'https://api.binance.com'

function getRequiredEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required environment variable: ${key}`)
  return val
}

/** Sign a query string with HMAC-SHA256 using the API secret. */
function sign(queryString: string, secret: string): string {
  return createHmac('sha256', secret).update(queryString).digest('hex')
}

/** Build a URL query string from a params object. */
function toQueryString(params: Record<string, string | number>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')
}

export class BinanceError extends Error {
  constructor(
    public readonly code: number,
    message: string
  ) {
    super(message)
    this.name = 'BinanceError'
  }
}

/** Fetch a public (no-auth) Binance endpoint. */
export async function binancePublicFetch<T>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const qs = toQueryString(params)
  const url = `${BASE_URL}${path}${qs ? `?${qs}` : ''}`

  const res = await fetch(url)
  const data = await res.json() as unknown

  if (!res.ok) {
    const err = data as { code: number; msg: string }
    throw new BinanceError(err.code ?? res.status, err.msg ?? 'Unknown Binance error')
  }

  // Log weight usage for monitoring
  const weight = res.headers.get('X-MBX-USED-WEIGHT-1M')
  if (weight) {
    console.log(`[binance] weight used this minute: ${weight}`)
  }

  return data as T
}

/** Fetch a signed (authenticated) Binance endpoint. */
export async function binanceFetch<T>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const apiKey = getRequiredEnv('BINANCE_API_KEY')
  const apiSecret = getRequiredEnv('BINANCE_API_SECRET')

  const withTimestamp = { ...params, timestamp: Date.now(), recvWindow: 5000 }
  const qs = toQueryString(withTimestamp)
  const signature = sign(qs, apiSecret)
  const url = `${BASE_URL}${path}?${qs}&signature=${signature}`

  const res = await fetch(url, {
    headers: { 'X-MBX-APIKEY': apiKey },
  })
  const data = await res.json() as unknown

  if (!res.ok) {
    const err = data as { code: number; msg: string }
    throw new BinanceError(err.code ?? res.status, err.msg ?? 'Unknown Binance error')
  }

  const weight = res.headers.get('X-MBX-USED-WEIGHT-1M')
  if (weight) {
    console.log(`[binance] weight used this minute: ${weight}`)
  }

  return data as T
}
