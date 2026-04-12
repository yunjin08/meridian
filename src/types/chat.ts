export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface DashboardContext {
  price: {
    price: number | null
    changePercent: number | null
    high24h: number | null
    low24h: number | null
    volume24h: number | null
    connectionStatus: string
  }
  balance: {
    btc: number | null
    usdt: number | null
    btcInUsdt: number | null
  }
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

export interface ChatApiResponse {
  reply: string
}
