# Alert System

---

## How it works

Alerts are created, edited, and deleted through the chat assistant's write tools (`add_alert`,
`edit_alert`, `remove_alert`, `toggle_alert` in `netlify/functions/utils/chat-tools.ts`), applied by
`useChat.ts`, and stored in Supabase (`alerts` table) — not localStorage.

`edit_alert` is a partial update: only the fields the model includes (`label`, `condition`,
`autoReset`) change, everything else keeps its stored value. The dashboard context sent to the model
includes each alert's raw `conditionType`/`threshold` (not just the human-readable string) specifically
so it can reconstruct an accurate full condition when editing just one part of it — the condition field
is always a full replace, never a partial merge of the threshold alone. Editing the condition re-arms
the alert (clears `triggered`/`last_price`) since the old trigger no longer describes the new
condition. The symbol itself is not editable — remove and re-add for that.

**Evaluation is server-only.** `netlify/functions/alerts-cron.ts` is a scheduled function that runs
every minute, checks every active alert against fresh Binance data using the pure condition logic in
`src/lib/alertEvaluation.ts`, and emails the owner via Resend on a fresh trigger. The browser does not
evaluate conditions at all — there is no WebSocket- or chart-driven client evaluator. This is
deliberate: a client evaluator reacting to price ticks (~1/sec) would almost always beat the cron to
marking a trigger, and since only the cron code path ever called Resend, that meant a tab being open
silently prevented the email from ever sending. Removing client-side evaluation entirely removes that
failure mode, at the cost of resolution: a condition can only be detected once a minute now, not
sub-second.

```
User asks the assistant → add_alert tool call → alertStore.addAlert() → POST /api/alerts → Supabase

                    ┌── Server (every minute, always) ─────────────────┐
                    │  alerts-cron.ts                                   │
                    │        │                                        │
                    │  Binance ticker/klines for each active alert       │
                    │        │                                        │
                    │  alertEvaluation.ts → condition met?               │
                    │        │                                        │
                    │  markTriggered() in Supabase  +  Resend email      │
                    └───────────────────────────────────────────────────┘

                    ┌── Browser (passive reflection, no evaluation) ────┐
                    │  useAlertData.ts polls GET /api/alerts every 60s   │
                    │        │                                        │
                    │  alertStore.load() diffs previous vs next          │
                    │        │                                        │
                    │  fresh triggered:false→true?  →  Notification API │
                    └───────────────────────────────────────────────────┘
```

The browser's `Notification` popup (`sendNotification` in `lib/notifications.ts`) is purely observational
now — it fires when a poll notices an alert transitioned to `triggered` since the last poll, never from
evaluating a condition itself. It can't reintroduce the old race because it never marks anything triggered
or sends email; it only reflects what the cron already decided.

---

## Alert types

| Condition type | Evaluates against | Fires when |
|---------------|-------------------|-----------|
| `price_above` | `ticker/price` on Binance | price > threshold |
| `price_below` | `ticker/price` on Binance | price < threshold |
| `price_crosses` | `ticker/price` on Binance, compared to the cron's own `last_price` from the previous run | price crosses threshold in either direction |
| `rsi_above` / `rsi_below` | RSI on `DEFAULT_TIMEFRAME` klines | RSI vs threshold |
| `macd_crossover` / `macd_crossunder` | MACD vs signal line on `DEFAULT_TIMEFRAME` klines | line crosses signal |

**Crypto only.** The cron only fetches Binance data, so only symbols Binance knows (anything ending
`USDT`) are ever evaluated. Stock/REIT alerts (e.g. `AAPL`) can still be created through the chat tool,
but nothing evaluates them — they sit inactive forever. The `add_alert` tool description tells the
assistant to say so rather than silently create one. See the limitation below.

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
  triggeredAt: number | null  // Unix ms, set by the cron
  createdAt: number
  autoReset: boolean          // re-arms after ALERT_AUTO_RESET_COOLDOWN_MS (price_crosses only)
}
```

The cron additionally tracks `last_price` per alert — its own copy of the previous tick, for
`price_crosses` detection across separate cron runs. That field is never sent to the client; the
browser has no cross-detection state of its own since it never evaluates anything.

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

## Limitations

- **Stock alerts don't fire at all.** Not browser, not email. The cron only reaches Binance; there is
  no browser evaluator to fall back on anymore. Only crypto (`*USDT`) alerts do anything.
- **Detection resolution is one minute.** With no client-side evaluator, a fast intraday move that
  crosses a threshold and moves back before the next cron tick can be missed entirely. This is the
  deliberate tradeoff for making the server the single source of truth.
- **Indicator alerts use a fixed timeframe.** RSI/MACD are always evaluated on `DEFAULT_TIMEFRAME`
  (`1h`) klines, since the cron has no concept of "the chart currently open."
- **Browser notifications lag by up to one poll interval** (`ALERT_POLL_INTERVAL_MS`, 60s) since they
  now only reflect state the cron already wrote, rather than reacting to a live price tick.
- **Auto-reset cooldown is 5 minutes** (`ALERT_AUTO_RESET_COOLDOWN_MS` in `constants.ts`). Only applies
  to `price_crosses` with `autoReset: true`, checked by the cron.
