const BASE_URL = 'https://finnhub.io/api/v1'

function getApiKey(): string {
  const key = process.env['FINNHUB_API_KEY']
  if (!key) throw new Error('FINNHUB_API_KEY environment variable is not set')
  return key
}

export class FinnhubError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'FinnhubError'
  }
}

/** Fetch a Finnhub endpoint. Appends the API token automatically. */
export async function finnhubFetch<T>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const token = getApiKey()
  const qs = Object.entries({ ...params, token })
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&')
  const url = `${BASE_URL}${path}?${qs}`

  const res = await fetch(url)

  // Log rate limit header for monitoring
  const remaining = res.headers.get('X-Ratelimit-Remaining')
  if (remaining) {
    console.log(`[finnhub] rate limit remaining: ${remaining}`)
  }

  if (!res.ok) {
    throw new FinnhubError(res.status, `Finnhub HTTP ${res.status}`)
  }

  return res.json() as Promise<T>
}
