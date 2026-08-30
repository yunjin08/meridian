# Binance API Reference

Quick reference for the Binance endpoints and WebSocket streams used in this project.

---

## REST Endpoints (via Netlify Functions)

Base URL: `https://api.binance.com`

### Klines (candlestick data)
```
GET /api/v3/klines
Params: symbol=BTCUSDT, interval=1h, limit=500
Auth: none
Weight: 1 (limit ≤100), 2 (≤500), 10 (≤1000)
Used by: candles.ts
```

### 24h Ticker
```
GET /api/v3/ticker/24hr
Params: symbol=BTCUSDT
Auth: none
Weight: 1
Used by: ticker.ts
```

### Spot Price
```
GET /api/v3/ticker/price
Params: symbol=BTCUSDT
Auth: none
Weight: 1
Used by: balance.ts (when frontend doesn't pass ?price=)
```

### Account Info
```
GET /api/v3/account
Params: timestamp, recvWindow, signature (HMAC-SHA256)
Auth: required — X-MBX-APIKEY header + signed query string
Weight: 10
Used by: balance.ts
```

---

## Signing Authenticated Requests

All signed requests must include:
- `timestamp` — current Unix ms
- `recvWindow` — tolerance window in ms (we use 5000)
- `signature` — HMAC-SHA256 of the full query string using the API secret

Handled by `_binance-client.ts` → `binanceFetch()`.

---

## WebSocket Streams (direct from browser)

Base URL: `wss://stream.binance.com:9443/stream`

We use a single combined stream connection:

```
wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/btcusdt@kline_1h
```

### 24h Ticker Stream (`btcusdt@ticker`)
Fires ~1/second. Message shape:
```typescript
{
  e: '24hrTicker',
  c: string,  // current price
  P: string,  // 24h price change percent
  h: string,  // 24h high
  l: string,  // 24h low
  q: string,  // 24h quote volume
}
```

### Kline Stream (`btcusdt@kline_{interval}`)
Fires on every trade. Message shape:
```typescript
{
  e: 'kline',
  k: {
    t: number,    // kline open time (ms)
    o/h/l/c/v: string,
    x: boolean,  // true = kline is closed (new candle complete)
    i: string,   // interval
  }
}
```

When `k.x === false`: update the last candle in chartStore.
When `k.x === true`: append as a new completed candle.

### Stream subscription management

To switch kline interval without reconnecting, send over the existing WS connection:
```json
{ "method": "UNSUBSCRIBE", "params": ["btcusdt@kline_1h"], "id": 1 }
{ "method": "SUBSCRIBE",   "params": ["btcusdt@kline_4h"], "id": 2 }
```

---

## Rate Limits

- **1200 request weight per minute** (rolling window)
- Header `X-MBX-USED-WEIGHT-1M` on every response — logged by `_binance-client.ts`
- 429 response = rate limit hit; 418 = IP ban after repeated 429s

Our current weight budget:
| Source | Weight/call | Calls/min | Weight/min |
|--------|------------|-----------|-----------|
| Balance poll (30s) | 10 | 2 | 20 |
| Candle refresh (60s) | 10 | 1 | 10 |
| Ticker fallback (5s, WS down only) | 1 | 12 | 12 |
| Crypto P&L (5 min): account + funding + prices | 10 + 1 + 4 | 0.2 | 3 |
| Crypto P&L (5 min): myTrades, one per held coin (~10) | 20 | 2 | 40 |
| Crypto P&L (5 min): fiat payments, 18 windows | 1 (IP, sapi) | 3.6 | 4 |
| Crypto P&L (5 min): P2P history, 50 windows (30-day cap) | 1 (IP, sapi) | 10 | 10 |
| Crypto P&L (5 min): daily klines, one per held coin (~10) | 5 | 2 | 10 |
| **Total (normal)** | — | — | **~100** |

We are using ~8% of the rate limit budget under normal operation. The Crypto P&L
figures are averaged over its 5-minute poll; a single refresh spends ~350 weight
in one burst, still well inside the per-minute limit.
