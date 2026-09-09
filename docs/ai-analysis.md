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

Quick endpoint check (unauthenticated should be 401; authed but unlinked returns
the "not configured" 500, which confirms the handler runs):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:8888/api/analyze \
  -H 'Content-Type: application/json' -d '{"symbol":"BTCUSDT","timeframe":"1h","closes":[1,2,3]}'
```

---

## Roadmap / next ideas

Ordered roughly by value-to-effort. None are started.

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

## Constraints to keep in mind

- Not financial advice; the prompt forbids predictions and the UI shows a
  disclaimer. Keep both if the feature grows.
- Auth is required. The endpoint is behind `requireAuth`, same as balance/chat.
- Symbol/timeframe come from the live stores at click time, so the read always
  matches what is on screen.
