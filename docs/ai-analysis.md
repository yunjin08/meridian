# AI Chart Analysis

On-demand, plain-English read of the live chart. The dashboard already shows
RSI, MACD and Bollinger values; this feature asks Claude to judge whether they
agree and returns a structured trend / momentum / support / resistance call.

Status: **shipped** (commit `48a27fc`). Works locally under `netlify dev` and in
production, provided the AI Gateway is available (see Setup).

---

## How it works

```
Crypto tab
  └─ AiAnalysisPanel ── click "Analyze" ──► useAnalysis.analyze()
                                               │ builds AnalyzeRequest from the stores
                                               ▼
                                     POST /api/analyze  (Netlify Function)
                                               │ requireAuth (dashboard_session cookie)
                                               │ Anthropic SDK ── AI Gateway ──► Claude
                                               │ tool_choice forces report_analysis
                                               ▼
                                     { analysis, model, generatedAt }
                                               │
                                     panel renders trend badge, summary,
                                     signals, support/resistance
```

The request carries a compact snapshot, not the whole history: the last 40
closes, the recent high/low, the latest RSI/MACD/Bollinger values, and 24h
price stats. Enough for a trend and level read without bloating tokens.

### Why forced tool use

`tool_choice: { type: 'tool', name: 'report_analysis' }` makes the model return
exactly one structured object matching `AnalysisResult`. This is deliberate: the
UI renders typed fields (trend badge, level rows) with no defensive parsing, and
we never depend on the model formatting prose a certain way. The single tool is a
schema, not an action; it does not mutate any state (unlike the chat function's
tools, which do).

### Why no API key config

Both this endpoint and the existing `chat.ts` read `ANTHROPIC_API_KEY` and let
the Anthropic SDK pick up `ANTHROPIC_BASE_URL` from the environment. Netlify's
**AI Gateway** injects both into every compute context (deployed Functions and
the local `netlify dev` preview) unless already set. So there is no key in `.env`
and none is needed. Setting `ANTHROPIC_API_KEY` yourself would override the
gateway and bill your own Anthropic account instead.

Model: `claude-haiku-4-5-20251001` (matches `chat.ts`; fast enough for an
interactive click).

---

## Files

| File | Role |
|------|------|
| `netlify/functions/analyze.ts` | `POST /api/analyze`. Auth, prompt build, forced tool call, returns `AnalyzeApiResponse`. |
| `src/types/analysis.ts` | Shared request/result types. The forced-tool schema mirrors `AnalysisResult`. |
| `src/hooks/useAnalysis.ts` | Builds `AnalyzeRequest` from `priceStore` / `chartStore` / `navigationStore`; calls the endpoint; holds result/loading/error. |
| `src/components/chart/AiAnalysisPanel.tsx` | The UI: Analyze button, loading/error/empty states, structured result card. |
| `src/components/crypto/CryptoSection.tsx` | Mounts `<AiAnalysisPanel />` as its own row between the chart row and the alerts row. |

Follows the repo's function conventions: shared code stays in `utils/` (this
reuses `utils/http.ts` and `utils/auth.ts`), `OPTIONS` handled first, structured
JSON errors, no `@/` alias imports in function code.

---

## Setup / run

1. `netlify link` — required so `netlify dev` receives AI Gateway credentials.
   Without it the endpoint returns `500 {"error":"AI analysis is not configured"}`.
2. `npm run dev`, log in, open the **Crypto** tab, click **Analyze**.
3. In production it works automatically; the gateway injects credentials at runtime.
4. If the chat or the panel answers "not configured" in production, read
   `GET /api/health`. Its `ai` block reports presence only. `gateway: false`
   means Netlify is not injecting anything into this project's compute (team
   AI features disabled, or a plan without the gateway). `gateway: true,
   anthropicKey: false` means a project-level `ANTHROPIC_API_KEY` exists and
   blocks injection; delete it. Setting `ANTHROPIC_API_KEY` by hand is the
   fallback that bypasses the gateway and bills your own Anthropic account.

### Function timeout

A three-round chat turn (lookup, write, final reply) takes 5 to 8 seconds on
Haiku, and a single analysis call 3 to 5 seconds. The site was created with a
5 second function timeout, which killed every three-round turn with Netlify's
generic `{"errorType":"Error","errorMessage":"An unknown error has occurred"}`
502 and a log line reading exactly `Duration: 5000 ms`. The timeout is a site
attribute (raised to 60 seconds on 2026-09-10) and applies from the next deploy.
Streaming does not escape it; the stream is cut at the same point. If that
error shape ever returns, check the timeout before suspecting the code.

### Why the AI functions are Functions 2.0

Measured on 2026-09-10 on the production site: a Functions 2.0 module
(`export default async (req: Request)`) receives `NETLIFY_AI_GATEWAY_KEY`,
`ANTHROPIC_API_KEY` and `ANTHROPIC_BASE_URL`; a classic `export const handler`
function in the same deploy receives none of them. So `chat.ts`, `analyze.ts`
and `health.ts` are v2 modules. They keep their event-based bodies and cross
the boundary through `utils/v2.ts` (`asV2`, `toHandlerEvent`, `toResponse`) so
`requireAuth` and the `utils/http.ts` helpers stay untouched. Any new function
that calls a model must do the same; a classic handler will always see the key
as missing.

Quick endpoint check (unauthenticated should be 401; authed but unlinked returns
the "not configured" 500, which confirms the handler runs):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8888/api/analyze \
  -H 'Content-Type: application/json' -d '{"symbol":"BTCUSDT","timeframe":"1h","closes":[1,2,3]}'
```

---

## Chat lookups (market-data tools)

The chat assistant (`chat.ts`) was context-stuffed: the browser snapshots the
stores into the system prompt and the model could only talk about what was on
screen. It now has three **read tools** alongside the five write tools, so it
can answer questions about rates, sentiment, or any symbol and timeframe by
fetching live data inside the function. Design: `docs/superpowers/specs/2026-09-10-chat-market-data-tools-design.md`.

```
ChatWidget ── POST /api/chat ──► chat.ts loop (max 5 rounds)
                                   │ tool_use: read tool ──► utils/chat-tools.ts ──► utils/market-data.ts / utils/klines.ts
                                   │                          real result text goes back to the model
                                   │ tool_use: write tool ──► recorded in appliedTools, browser applies it
                                   ▼
                                 { reply, appliedTools, lookups }
                                   │
                                 ChatMessage shows "Looked up: …" under the bubble
```

| Tool | Source | Cache | Notes |
|------|--------|-------|-------|
| `get_macro_snapshot` | FRED: FEDFUNDS, CPIAUCSL (derived YoY), UNRATE, DGS2, DGS10, T10Y2Y, DTWEXBGS, plus daily closes SP500, NASDAQCOM, DJIA, VIXCLS | 1 h | Needs `FRED_API_KEY`. Without it the tool tells the model macro is not configured. Index closes lag a day during the session. |
| `get_crypto_market` | CoinGecko `/global`, alternative.me Fear & Greed, Binance Futures funding + open interest | 1 min | Keyless. `COINGECKO_API_KEY` (demo) is optional. Each provider fails independently. |
| `get_candles` | Binance klines via `utils/klines.ts`, same code as `/api/candles` | none | Returns a compact summary (window high/low, latest RSI/MACD/BB, last 10 closes), never raw candles. |
| `get_stock_quote` | Finnhub `/quote` for up to 5 tickers, same client as `/api/stock-quotes` | none | Live price, day change and range. SPY/QQQ/DIA give intraday index moves. Unknown tickers come back as zeros from Finnhub and are reported as "no data". |

The system prompt also carries the whole portfolio as the Overview tab shows it
(total, per-class value and share, 24h change) and the all-time profit and loss
(crypto net, still-invested and current value, days above and below water, top
rows by absolute net, Trading 212 unrealized and realized, top positions). The
browser builds both with the same pure `summarisePortfolio` and `summarisePnl`
functions the Overview uses, so the assistant and the screen never disagree.
The prompt tells the model to speak to the user's position and never to invent
a P&L figure.

`GET /api/macro` exposes the same macro and crypto snapshot for the UI; nothing
consumes it yet (the analysis panel regime line is the intended consumer).

Trust decision: the model reads third-party data while holding write tools.
Accepted because the sources return numbers and enum labels, tool results are
formatted from parsed fields (never the raw body), and every write is reversible
and visible in the UI. Any free-text source (news, social) must not join this
loop without a confirmation gate on writes.

### Manual evals

Run after any prompt or model change. Not in CI: each run spends tokens and the
feature has one user. Expected behaviour in brackets.

1. "what is the fed funds rate" [calls `get_macro_snapshot`, quotes value and date]
2. "is the market fearful or greedy right now" [calls `get_crypto_market`, quotes index and label]
3. "how does ETH look on the 4h" [calls `get_candles` ETHUSDT 4h, describes RSI/MACD/BB]
4. "what is CPI doing and does BTC funding look stretched" [two lookups in one turn, both cited]
5. "alert me if BTC drops under the 4h Bollinger lower band" [lookup then `add_alert` with the fetched level]
6. "what is the price of gold" [declines: no tool covers it, no made-up number]
7. With `FRED_API_KEY` unset: prompt 1 [says macro data is not configured, does not guess]
8. "why are stocks down today" [macro snapshot for the index closes and VIX, `get_stock_quote` for SPY/QQQ, relates it to the user's Trading 212 positions]
9. "how am I doing overall, and where am I losing money" [no lookup needed; quotes the all-time net and names the biggest losing rows from the P&L section]
10. "if BTC drops 10% what is my portfolio worth" [arithmetic from the portfolio section, no invented figures]

---

## Roadmap / next ideas

Ordered roughly by value-to-effort. None are started.

- **Macro regime line in the analysis panel.** `/api/macro` exists; feed the
  snapshot into `analyze.ts` so the read can say "rates unchanged, dollar firm,
  greed at 66" alongside the technicals.

- **Stream the response.** Switch `/api/analyze` to SSE and render the summary as
  it arrives. Note: forced tool output does not stream token-by-token as prose,
  so streaming likely means dropping the forced tool and streaming a text summary
  while keeping a small structured tail, or streaming `input_json_delta`.
- **Extend to the Stocks/REITs tab.** `StocksSection` also uses `ChartContainer`
  and `IndicatorPanel`; the panel and hook are close to reusable if the payload
  builder reads the active stock symbol and quote instead of crypto.
- **Richer context.** Feed multi-timeframe indicators or recent alert history so
  the read can reference what the user is already watching.
- **Cache / rate-limit.** One analysis per (symbol, timeframe, candle) is enough;
  debounce repeat clicks and reuse the last result until a new candle closes.
- **Tests.** The repo now has Vitest. Good first unit: the `buildRequest` payload
  shaping in `useAnalysis` and the tool-input → `AnalysisResult` handling.

---

## AI decisions (jed-standards ai-app-build)

One line per consideration, including the ones declined. Revisit when the
feature changes shape.

**Tier.** Chat is Tier 3 (the model picks tools until it stops). Analysis is
Tier 1 (one forced-tool call). Recorded in the market-data spec.

**Enterprise baseline.**
- Tenancy: one owner, one tenant. No per-tenant index, cache key or budget;
  every request is behind `requireAuth`. Not needed because there is no second
  user by design (CLAUDE.md rule 4 keeps the app single-owner).
- Identity and authorization: the model acts with the owner's rights and no
  more; tools are the owner's own dashboard actions.
- Audit of writes: alerts and watchlist edits made by the model are applied in
  the browser and appear in the UI and in the `chat_run` log line as tool
  names, not as full arguments. Accepted because both writes live in
  localStorage and are reversible in one click. A server-side write would
  need a real audit row before it joined the tool list.
- Compliance: prompts and outputs are not stored by this app. The AI Gateway
  states it does not store them either. Portfolio figures and P&L go to the
  model on every turn; that is the point of the feature and the owner is the
  only reader.
- Cost governance: no per-user cap in code. The gateway's per-minute credit
  limit (90 credits on Free) is the ceiling, plus `max_tokens` 1024 and five
  rounds per turn. Token usage per run is logged so the bill is explainable.

**Shape.**
- (5) In code: auth, snapshot building, all fetching, formatting, caching,
  applying writes. Model-driven: which tool to call and what to say. Nothing
  else is delegated.
- (1) Tools: four reads, five writes, descriptions say when to call, errors are
  actionable text. Reads are idempotent. `add_alert` is deduplicated in the
  browser on symbol, type and threshold so a retried turn cannot double-create.
- (2) Context: static instructions are one cached system block; the live
  snapshot is a second block after it. History is trimmed to the last 20
  messages. Tool results are compact summaries. Haiku 4.5 caches prefixes of
  4096+ tokens only, so the cache marker pays off once the static block or
  tool list grows, or the model changes; the `cacheRead` field in the run log
  shows when.
- (3) Planning: none. Turns are short; a plan would cost more than it saves.
- (4) Subagents: none. One coherent conversation, no fan-out.

**Control.**
- (6) Termination: `end_turn` or the five-round cap. Verification: read
  results are formatted from parsed fields, so the model cannot quote a value
  the source did not return; writes are visible in the UI immediately. No
  automatic checker for the prose itself; the owner is the gate.
- (7) Limits: five rounds, 1024 output tokens, 8 s per upstream fetch, 60 s
  function timeout. No loop detection (the cap bounds it). No mid-run kill
  switch: a turn lasts seconds and the owner can simply ignore the reply.
- (8) State: a turn lives in one request. A failed turn stays in the browser
  history as a marked failure and is sent to the model as a system note, so a
  later turn cannot claim the failed work happened. No resume; a failed turn is
  re-asked.
- (9) Human in the loop: no approval gate on writes because both are reversible
  and shown at once. The model asks the user when it is unsure (seen in evals).

**Trust.**
- (10) Prompt injection: sources return numbers and enum labels; results are
  built from parsed fields, never the raw body; write tools stay reversible.
  Any free-text source (news, social) does not join without a gate on writes.
- (11) Observability: one JSON line per run (`chat_run`, `analyze_run`) with
  outcome, iterations, tool names, tokens in and out, cache reads and writes,
  duration. Read it in the Netlify function log.
- (12) Evals: the manual prompt list above, run after prompt or model changes.
  Not in CI, because each run spends credits and the feature has one user.
  This is a standing choice, not a gap to close.

**Operate.**
- (13) Cost: Haiku 4.5 for both features; upstream data cached; prompt cache
  prepared. Upgrade to Sonnet is one constant if the evals show poor reasoning.
- (14) UX: each reply shows "Looked up:" for its tools; a failed turn shows in
  red; writes appear in the alerts and watchlist lists. Streaming is not done.
- (15) Reliability: SDK retries on transient API errors; each upstream fails
  independently and the model is told what was unavailable; a throttled
  Trading 212 serves its last good data flagged stale.

---

## Constraints to keep in mind

- Not financial advice; the prompt forbids predictions and the UI shows a
  disclaimer. Keep both if the feature grows.
- Auth is required. The endpoint is behind `requireAuth`, same as balance/chat.
- Symbol/timeframe come from the live stores at click time, so the read always
  matches what is on screen.
