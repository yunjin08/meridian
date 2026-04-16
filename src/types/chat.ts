import type { StockHolding, StockQuote } from './portfolio.ts'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
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
  stockHoldings: Array<StockHolding & { quote: StockQuote | null }>
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
    active: boolean
    triggered: boolean
    triggeredAt: number | null
  }>
}

export interface ChatRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  context: DashboardContext
}

// Tool names the chatbot can invoke
export type ChatToolName = 'add_alert' | 'remove_alert' | 'toggle_alert' | 'add_symbol' | 'remove_symbol'

export interface AppliedTool {
  name: ChatToolName
  input: unknown
}

export interface ChatApiResponse {
  reply: string
  appliedTools: AppliedTool[]
}
