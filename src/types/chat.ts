import type { StockAccountSummary, StockHolding, StockPosition, StockQuote } from './portfolio.ts'
import type { Alert } from './alert.ts'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  /** External data the assistant consulted before answering. */
  lookups?: ChatLookup[]
  /** The turn failed before the assistant answered; nothing was changed. */
  failed?: boolean
}

export interface DashboardContext {
  activeSymbol: string
  price: {
    price: number | null
    changePercent: number | null
    high24h: number | null
    low24h: number | null
    connectionStatus: string
  }
  cryptoHoldings: Array<{
    asset: string
    symbol: string
    free: number
    usdtValue: number | null
    price: number | null
    changePercent: number | null
  }>
  totalCryptoUsdt: number | null
  stockHoldings: Array<StockHolding & { quote: StockQuote | null; position: StockPosition | null }>
  stockAccount: StockAccountSummary | null
  chart: {
    timeframe: string
    lastCandle: {
      open: number
      high: number
      low: number
      close: number
      volume: number
    } | null
    rsi: number | null
    macd: { line: number; signal: number; histogram: number } | null
    bb: { upper: number; middle: number; lower: number } | null
  }
  alerts: Array<{
    id: string
    label: string
    symbol: string
    condition: string  // pre-formatted: "price above $90,000"
    conditionType: string   // raw discriminant, e.g. "price_above" — for edit_alert
    threshold: number | null  // raw threshold, null for macd_* conditions — for edit_alert
    active: boolean
    triggered: boolean
    triggeredAt: number | null
  }>
  /** What the Overview tab shows, so the assistant can speak to the whole position. */
  portfolio: ChatPortfolioContext | null
  pnl: ChatPnlContext | null
}

export type ChatAssetClass = 'crypto' | 'stock' | 'reit'

export interface ChatPortfolioContext {
  total: number
  totalCurrency: string
  isMixedCurrency: boolean
  change24hUsd: number
  change24hPercent: number | null
  classes: Array<{
    assetClass: ChatAssetClass
    value: number
    currency: string
    change24hPercent: number | null
    holdingCount: number
  }>
}

export interface ChatCryptoPnlContext {
  net: number
  netSpent: number
  currentValue: number
  netPercent: number | null
  daysAboveWater: number
  daysBelowWater: number
  lastCrossedOn: string | null
  warnings: string[]
  /** Largest absolute net first, capped by the client. */
  assets: Array<{
    asset: string
    netSpent: number
    currentValue: number | null
    net: number | null
    netPercent: number | null
  }>
}

export interface ChatEquitiesPnlContext {
  currency: string
  unrealized: number
  realized: number
  net: number
  positions: Array<{
    ticker: string
    assetClass: 'stock' | 'reit'
    currentValue: number
    totalCost: number
    unrealized: number
    unrealizedPercent: number | null
  }>
}

export interface ChatPnlContext {
  total: number | null
  totalCurrency: string
  crypto: ChatCryptoPnlContext | null
  equities: ChatEquitiesPnlContext | null
}

export interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  context: DashboardContext
}

// Alert tools execute server-side (see chat-tools.ts's executeAlertTool). The
// portfolio-watchlist tools still only live in localStorage, so the browser
// applies those itself.
export type ChatAlertToolName = 'add_alert' | 'edit_alert' | 'remove_alert' | 'toggle_alert'
export type ChatToolName = ChatAlertToolName | 'add_symbol' | 'remove_symbol'

// Read tools: executed inside the function, their text goes back to the model.
export type ChatReadToolName = 'get_macro_snapshot' | 'get_crypto_market' | 'get_candles' | 'get_stock_quote'

// Alert tools (add/edit/remove/toggle) execute server-side now, so the model
// gets a real result instead of an unconditional "Applied". Portfolio-watchlist
// tools (add_symbol/remove_symbol) still live in localStorage only and remain
// client-applied — `result` is absent for those.
export type AlertToolResult =
  | { ok: true; alert: Alert }
  | { ok: true; removed: true }
  | { ok: false; error: string }

export interface AppliedTool {
  name: ChatToolName
  input: unknown
  result?: AlertToolResult
}

export interface ChatLookup {
  name: ChatReadToolName
  /** Short human label, e.g. "BTCUSDT 4h, 100 candles". */
  summary: string
}

export interface ChatApiResponse {
  reply: string
  appliedTools: AppliedTool[]
  lookups: ChatLookup[]
}

/**
 * Newline-delimited JSON events on POST /api/chat when the client sends
 * `Accept: application/x-ndjson`. `done` always closes a successful stream.
 */
export type ChatStreamEvent =
  | { type: 'status'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'lookup'; lookup: ChatLookup }
  | { type: 'applied'; tool: AppliedTool }
  | { type: 'done'; result: ChatApiResponse }
  | { type: 'error'; error: string }
