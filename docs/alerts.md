# Alert System

---

## How it works

Alerts are defined by the user in `AlertForm`, stored in Zustand's `alertStore` (persisted to localStorage), and evaluated in `useAlertEvaluator` which subscribes to store state changes outside the React render cycle.

```
User creates alert → alertStore (localStorage)
                           │
     useBinanceWebSocket   │   useCandles
           │               │       │
      priceStore ──────────┤  chartStore.indicators
           │               │
    useAlertEvaluator ─────┘
           │
     condition met?
           │
    markTriggered()  +  sendNotification()  [+  /api/notify in Phase 2]
```

---

## Alert types

| Condition type | Evaluates against | Fires when |
|---------------|-------------------|-----------|
| `price_above` | Live WS price (~1/sec) | price > threshold |
| `price_below` | Live WS price (~1/sec) | price < threshold |
| `price_crosses` | Live WS price (~1/sec) | price crosses threshold in either direction |
| `rsi_above` | Latest RSI from candle refresh (~60s) | RSI > threshold |
| `rsi_below` | Latest RSI from candle refresh (~60s) | RSI < threshold |
| `macd_crossover` | Latest MACD from candle refresh (~60s) | MACD line crosses signal line upward |
| `macd_crossunder` | Latest MACD from candle refresh (~60s) | MACD line crosses signal line downward |

---

## Storage schema (localStorage key: `btc-dashboard-alerts`)

```typescript
interface Alert {
  id: string                  // crypto.randomUUID()
  label: string               // user-provided name
  condition: AlertCondition   // discriminated union by type
  active: boolean             // user can pause without deleting
  triggered: boolean          // true after first fire
  triggeredAt: number | null  // Unix ms when triggered
  createdAt: number
  lastEvaluatedPrice: null    // always null in storage; populated in-memory only
  autoReset: boolean          // re-arms after 5-min cooldown (price_crosses only)
  autoResetAt: null           // always null in storage
}
```

`lastEvaluatedPrice` is reset to `null` on every page load by the Zustand `persist` `partialize` option. This is intentional — cross detection needs the previous price, which is meaningless across sessions.

---

## Browser notification flow

1. App loads → check `Notification.permission`
2. User submits `AlertForm` → `requestNotificationPermission()` is called (requires user gesture)
3. If `'granted'` → alert fires → `new Notification(...)` with `tag: alert.id` (deduplication)
4. If `'denied'` → alert still stores in state but notification is silently skipped

---

## Limitations

- **Tab must stay open.** JavaScript stops when the tab is closed. Notifications don't fire.
- **Background tabs work.** WebSocket callbacks are not throttled by browsers (unlike setInterval). Evaluation runs in WS message handlers → alerts fire in background tabs.
- **Single device.** localStorage is not synced across browsers or devices.
- **Auto-reset cooldown is 5 minutes** (`ALERT_AUTO_RESET_COOLDOWN_MS` in `constants.ts`). Only applies to `price_crosses` with `autoReset: true`.

---

## To add background notifications (Phase 2)

Create `netlify/functions/notify.ts`:

```typescript
// POST /api/notify
// Body: { title: string, body: string }
// Calls Telegram or Pushover API server-side
```

Add to `useAlertEvaluator.ts` after `sendNotification()`:
```typescript
void fetch('/api/notify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'BTC Alert', body: detail }),
})
```

New env vars needed: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (or Pushover equivalents).
