// Binance 24h ticker stream message (btcusdt@ticker)
export interface WsTickerMessage {
  e: '24hrTicker'
  E: number   // event time (ms)
  s: string   // symbol: "BTCUSDT"
  c: string   // current close price
  P: string   // price change percent (24h)
  h: string   // high price (24h)
  l: string   // low price (24h)
  v: string   // base asset volume (24h)
  q: string   // quote asset volume (24h)
}

// Binance kline stream message (btcusdt@kline_1m etc.)
export interface WsKlineInner {
  t: number   // kline start time (ms)
  T: number   // kline close time (ms)
  i: string   // interval: "1m", "1h", etc.
  o: string   // open
  h: string   // high
  l: string   // low
  c: string   // close
  v: string   // volume
  x: boolean  // is this kline closed?
  n: number   // number of trades
}

export interface WsKlineMessage {
  e: 'kline'
  E: number
  s: string
  k: WsKlineInner
}

// Combined stream envelope (wss://.../stream?streams=...)
export interface WsCombinedMessage {
  stream: string
  data: WsTickerMessage | WsKlineMessage
}

export type WsConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'failed'
