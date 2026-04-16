// Raw Finnhub REST API shapes — no `any`, strict types.

export interface FinnhubQuote {
  c: number   // current price
  d: number   // change
  dp: number  // percent change
  h: number   // high of day
  l: number   // low of day
  o: number   // open price
  pc: number  // previous close
  t: number   // timestamp (Unix seconds)
}

export interface FinnhubCandle {
  c: number[]   // close prices
  h: number[]   // highs
  l: number[]   // lows
  o: number[]   // opens
  s: string     // status: "ok" | "no_data"
  t: number[]   // timestamps (Unix seconds)
  v: number[]   // volume
}

// WebSocket message shapes
export interface FinnhubTrade {
  p: number   // last price
  s: string   // symbol
  t: number   // timestamp (ms)
  v: number   // volume
}

export interface FinnhubTradeMessage {
  type: 'trade'
  data: FinnhubTrade[]
}

export interface FinnhubPingMessage {
  type: 'ping'
}

export type FinnhubWsMessage = FinnhubTradeMessage | FinnhubPingMessage
