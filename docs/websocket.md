# WebSocket Architecture

---

## Connection

`useBinanceWebSocket` opens a single combined stream connection on mount:

```
wss://stream.binance.com:9443/stream?streams=btcusdt@ticker/btcusdt@kline_{interval}
```

The combined stream wraps all messages in an envelope:
```json
{ "stream": "btcusdt@ticker", "data": { ... } }
```

The hook dispatches on `stream` name to either `handleTickerMessage` or `handleKlineMessage`.

---

## Timeframe switching

When the user picks a new timeframe, the kline stream is swapped **without closing the connection**:

```json
{ "method": "UNSUBSCRIBE", "params": ["btcusdt@kline_1h"], "id": 1 }
{ "method": "SUBSCRIBE",   "params": ["btcusdt@kline_4h"], "id": 2 }
```

`currentKlineStreamRef` tracks which kline stream is currently subscribed.

**Known gap:** if the WS is reconnecting when the timeframe changes, the subscribe message is never sent. On reconnect, the hook reconnects to the initial stream but not the new one. See `roadmap.md` item #19.

---

## Reconnection state machine

```
CONNECTING
    │ onopen
    ▼
CONNECTED ──── onclose ──► RECONNECTING
                                │
                    delay = min(2^n × 1000ms, 30000ms)
                    (attempt n = 1, 2, 3, 4, 5)
                                │
                    n < 5 ──────┘ (retry)
                    n ≥ 5 ──────► FAILED → start fallback polling
```

Reconnection uses exponential backoff:
- Attempt 1: 1s
- Attempt 2: 2s
- Attempt 3: 4s
- Attempt 4: 8s
- Attempt 5: 16s
- Cap: 30s

On reconnect success: `reconnectAttempts` resets to 0.

---

## Port 9443 fallback

Port 9443 may be blocked on some corporate networks. If the WebSocket fails to connect within 5 seconds, `useBinanceWebSocket` starts polling `/api/ticker` every 5 seconds as a fallback. The ticker endpoint serves the same data through Netlify Functions (no port issue).

Fallback stops immediately when the WS reconnects successfully.

---

## Staleness indicator

`priceStore.lastTickAt` is set to `Date.now()` on every WS ticker message. `PriceTicker` computes:

```typescript
isStale = Date.now() - lastTickAt > 5000  // STALE_THRESHOLD_MS
```

This is checked every second via `setInterval`. If stale, an amber "STALE" badge appears next to the price.
