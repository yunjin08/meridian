export const BINANCE_WS_BASE = 'wss://stream.binance.com:9443/stream'
export const API_BASE = '/api'

export const DEFAULT_CRYPTO_SYMBOL = 'BTCUSDT'

export const TIMEFRAMES = ['1m', '15m', '1h', '4h', '1d'] as const
export type Timeframe = (typeof TIMEFRAMES)[number]

export const DEFAULT_TIMEFRAME: Timeframe = '1h'

export const CANDLE_LIMIT = 500

// USDT value threshold below which a crypto holding is considered dust
export const MIN_CRYPTO_BALANCE_USDT = 1

// How long without a WS tick before showing "STALE" badge (ms)
export const STALE_THRESHOLD_MS = 5_000

// Polling intervals (ms)
export const BALANCE_POLL_INTERVAL_MS = 30_000
export const CANDLE_REFRESH_INTERVAL_MS = 60_000
export const STOCK_QUOTE_POLL_INTERVAL_MS = 30_000
// Trading 212 limits: positions 1 req/s, account summary 1 req/5s (per account)
export const STOCK_POSITIONS_POLL_INTERVAL_MS = 30_000
// Crypto P&L rebuilds trade and fiat history from Binance; poll rarely.
export const CRYPTO_PNL_POLL_INTERVAL_MS = 5 * 60 * 1_000

// WebSocket reconnection
export const WS_MAX_RECONNECT_ATTEMPTS = 5
export const WS_RECONNECT_BASE_DELAY_MS = 1_000
export const WS_RECONNECT_MAX_DELAY_MS = 30_000

// Timeframe change debounce (ms) — avoids rapid-switch hammering
export const TIMEFRAME_DEBOUNCE_MS = 400

// Alert auto-reset cooldown for price_crosses (ms)
export const ALERT_AUTO_RESET_COOLDOWN_MS = 5 * 60 * 1_000

// Finnhub API base (used by Netlify functions)
export const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1'

// PH income tax, 8% flat-rate option for a purely self-employed / professional
// taxpayer (non-VAT). The exemption is annual and applied cumulatively per 1701Q.
export const TAX_RATE = 0.08
export const TAX_ANNUAL_EXEMPTION_PHP = 250_000
export const TAX_DEADLINE_WARNING_DAYS = 30
export const TAX_NOTIFY_THRESHOLDS_DAYS = [30, 14, 7, 1] as const

// Public landing page (rendered before login)
export const LANDING_GITHUB_URL = 'https://github.com/yunjin08'
export const LANDING_REPO_URL = 'https://github.com/yunjin08/meridian'
// The Overview tab and tax module have shipped; the landing page no longer marks them in progress.
export const OVERVIEW_TAX_IN_PROGRESS = false
