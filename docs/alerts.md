# Alert System

---

## How it works

Alerts are created and deleted through the chat assistant's write tools (`add_alert`, `remove_alert`,
`toggle_alert` in `netlify/functions/utils/chat-tools.ts`), applied by `useChat.ts`, and stored in
Supabase (`alerts` table) — not localStorage. Two independent evaluators watch them:

- **Browser evaluator** (`useAlertEvaluator.ts`) — subscribes to live price/indicator store updates,
  fires instant browser notifications while a tab is open, and optimistically marks the alert
  triggered on the server so the cron doesn't re-fire it.
- **Server cron** (`netlify/functions/alerts-cron.ts`) — a scheduled function that runs every minute,
  independently evaluates the same conditions against fresh Binance data, and emails the owner via
  Resend on a fresh trigger. Runs regardless of whether any browser tab is open.

Both share the same pure condition logic in `src/lib/alertEvaluation.ts` (alias-free, per CLAUDE.md
rule 10) so a condition reads identically in both places.

```
User asks the assistant → add_alert tool call → alertStore.addAlert() → POST /api/alerts → Supabase

                    ┌── Browser (while tab open) ──────────────────────┐
                    │  useBinanceWebSocket / useCandles                │
                    │        │                                        │
                    │  priceStore / chartStore.indicators              │
                    │        │                                        │
                    │  useAlertEvaluator → condition met?               │
                    │        │                                        │
                    │  Notification API  +  optimistic PUT (trigger)    │
                    └───────────────────────────────────────────────────┘

                    ┌── Server (always) ────────────────────────────────┐
                    │  alerts-cron.ts (every minute)                    │
                    │        │                                        │
                    │  Binance ticker/klines for each active alert       │
                    │        │                                        │
                    │  alertEvaluation.ts → condition met?               │
                    │        │                                        │
                    │  markTriggered() in Supabase  +  Resend email      │
                    └───────────────────────────────────────────────────┘
```

`useAlertData.ts` loads alerts on mount and polls every `ALERT_POLL_INTERVAL_MS` (60s, matching the
cron cadence) so a trigger the cron set shows up in the UI without a refresh.

---

## Alert types

| Condition type | Evaluates against | Fires when | Emailed by the cron? |
|---------------|-------------------|-----------|----|
| `price_above` | Live price (WS client-side, `ticker/price` server-side) | price > threshold | Yes, for crypto symbols |
| `price_below` | Live price | price < threshold | Yes, for crypto symbols |
| `price_crosses` | Live price | price crosses threshold in either direction | Yes, for crypto symbols |
| `rsi_above` / `rsi_below` | RSI on the active chart timeframe (client) or the fixed `DEFAULT_TIMEFRAME` (cron) | RSI vs threshold | Yes, for crypto symbols |
| `macd_crossover` / `macd_crossunder` | MACD vs signal line | line crosses signal | Yes, for crypto symbols |

**Crypto only for email.** The cron fetches prices and klines from Binance, so only symbols Binance
knows (anything ending `USDT`) get emailed. Stock alerts (e.g. `AAPL`) still fire the instant browser
notification while a tab is open, but the cron silently skips them (logs a warning, sends no email) —
see the limitation below.

---

## Storage schema (Supabase table `alerts`, `supabase/migrations/0003_alerts.sql`)

```typescript
interface Alert {
  id: string
  label: string
  symbol: string
  condition: AlertCondition   // discriminated union by type
  active: boolean             // user can pause without deleting
  triggered: boolean          // true after first fire; server-authoritative
  triggeredAt: number | null  // Unix ms, set by whichever evaluator fires first
  createdAt: number
  autoReset: boolean          // re-arms after ALERT_AUTO_RESET_COOLDOWN_MS (price_crosses only)
}
```

The cron additionally tracks `last_price` per alert (its own copy of the previous tick, for
`price_crosses` detection across separate cron runs). That field is never sent to the client — the
browser keeps its own equivalent purely in memory (`alertStore.clientLastPrice`), since the two
evaluators run on independent schedules and must not share cross-detection state.

**Legacy localStorage migration.** Alerts created before this feature shipped live under the
`dashboard-alerts` localStorage key. On first load, if the server has no alerts, `alertStore.load()`
reads and clears that key via `src/lib/alertMigration.ts`, pushing each one to the server once.

---

## Email delivery

`netlify/functions/utils/email.ts` sends via [Resend](https://resend.com)'s REST API. Only the API key
is an env var:

```bash
RESEND_API_KEY=...
```

Sender (`onboarding@resend.dev`) and recipient are hardcoded constants in `email.ts` — a single-user
dashboard has one fixed destination, and neither value is a secret. `onboarding@resend.dev` requires
no domain verification, but on Resend's free tier it can only send to the email address you signed up
with, so the recipient constant must match that account.

A missing `RESEND_API_KEY` makes `sendAlertEmail` log and no-op rather than throw — a misconfigured
mailer never blocks the cron's trigger bookkeeping, so the alert still shows as triggered in the UI
even if the email never sends.

To send from your own domain instead of `onboarding@resend.dev`, verify a domain in Resend and update
the two constants in `email.ts`.

---

## Browser notification flow

Unchanged from before this feature: `Notification.permission` gates `sendNotification()` in
`useAlertEvaluator.ts`, deduplicated by `tag: alert.id`. This is purely a same-tab, instant-feedback
channel — the email channel above is what reaches you when no tab is open.

---

## Limitations

- **Stock alerts don't email.** The cron only reaches Binance. Stock/REIT alerts remain browser-only,
  as before.
- **Indicator alerts use a fixed timeframe server-side.** The client evaluates RSI/MACD against
  whatever timeframe is on screen; the cron always uses `DEFAULT_TIMEFRAME` (`1h`), since it has no
  concept of "the chart currently open." A client-side RSI alert can feel like it fires at a different
  moment than the emailed one if you're charting a different timeframe.
- **Up to ~1 minute of email latency.** The cron runs once a minute.
- **A rare double-fire is possible.** If the browser and the cron evaluate the same crossing within
  the same few hundred milliseconds, both a browser notification and an email could go out for the
  same trigger. Not corrected with locking — accepted as a low-frequency, low-cost edge case for a
  single-user dashboard.
- **Auto-reset cooldown is 5 minutes** (`ALERT_AUTO_RESET_COOLDOWN_MS` in `constants.ts`). Only applies
  to `price_crosses` with `autoReset: true`. Checked by both evaluators independently.
