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
