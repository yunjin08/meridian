# Chat market-data tools

Ground the dashboard chatbot in live external data so it can answer real
questions instead of guessing from its training cutoff. Today the chat is
context-stuffed: the browser snapshots the stores into one system prompt and the
five tools are all writes (alerts, watchlist). Nothing lets the model look
something up.

This design adds read tools to the chat loop, a shared market-data module that
fetches FRED macro series and free crypto market stats with a cache, a
`GET /api/macro` endpoint over the same module for the UI, and a `get_candles`
read tool so the chat can inspect any symbol and timeframe rather than only the
one on screen.

Order of delivery: market context first (macro and crypto market tools), then
chart questions (`get_candles`). The analysis panel regime line is a follow-up
and is not in this spec, but the endpoint it needs is.

---

## Tier

The chat is already a Tier 3 agentic loop (the model picks tools until it
stops). This work widens the tool surface; it does not change the tier. The
analysis panel stays Tier 1 and is untouched.

## Approaches considered

- **A. Read tools in the chat loop (chosen).** Tools fire only when a question
  needs them, so the cost is paid per lookup, and the same mechanism covers
  chart questions over arbitrary symbols.
- **B. Inject a macro snapshot into every message.** Cheaper to build and needs
  no loop change, but every message pays the tokens and chart questions cannot
  be pre-injected. You would pick B only if the wanted question set were fixed.
- **C. Scheduled ingestion into Supabase.** Rejected. The data is freely
  fetchable, changes monthly or by the minute, and nothing here needs history.
  CLAUDE.md rule 4 treats a new table as an architecture decision.

A gets one piece of B: the `/api/macro` endpoint exists so the UI can read the
same snapshot the chat sees, without a second fetcher.

---

## Data sources

All fetched by Netlify Functions, never by the browser. All free.

| Source | What | Auth | Limit | Cache TTL |
|--------|------|------|-------|-----------|
| FRED `series/observations` | FEDFUNDS, CPIAUCSL, UNRATE, DGS10, DGS2, T10Y2Y, DTWEXBGS | `FRED_API_KEY` | 120 req/min | 1 hour |
| CoinGecko `/global` | Total market cap (USD), 24h cap change, BTC and ETH dominance | Optional `COINGECKO_API_KEY` (demo header) | 30 req/min keyless | 1 minute |
| alternative.me `/fng/` | Fear and Greed index value, label, yesterday's value | None | Unpublished, daily data | 1 minute |
| Binance Futures `/fapi/v1/premiumIndex`, `/fapi/v1/openInterest` | Mark price, last funding rate, next funding time, open interest for the asked symbol | None | Public weight | 1 minute |

CPI year on year is derived: fetch 13 monthly observations and compute
`(latest / twelve months earlier - 1) * 100`. Daily FRED series contain `"."`
for missing days; those observations are skipped.

If `FRED_API_KEY` is missing the macro tool returns a tool result that says so
in plain words, and the crypto market tool still works. The model is told to say
macro data is not configured rather than guess.

---

## Components

### `netlify/functions/utils/market-data.ts`

Pure fetchers plus the cache. No Anthropic, no HTTP handler code.

```ts
export function fetchMacroSnapshot(): Promise<MacroSnapshot>
export function fetchCryptoMarket(symbol: string): Promise<CryptoMarketSnapshot>
export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T>
```

The cache is a module-level `Map<string, { value; expiresAt }>`. Warm function
instances share it; a cold start refetches. At these rate limits and one user
that is enough, so no Netlify Blobs and no table. Each upstream fetch uses
`AbortSignal.timeout(8_000)` so a slow provider cannot hang the chat turn.

FRED fetches for the seven series run in parallel. One failed series does not
fail the snapshot; it appears as `null` with the error noted in the tool result
so the model can say which figure is unavailable.

### `src/types/market.ts`

Shared shapes crossing the `/api/macro` boundary. Type-only imports are safe in
function code.

```ts
export interface MacroSeriesPoint { id: string; label: string; value: number | null; previous: number | null; date: string | null; unit: string }
export interface MacroSnapshot { series: MacroSeriesPoint[]; cpiYoY: MacroSeriesPoint; fetchedAt: number }
export interface CryptoMarketSnapshot {
  symbol: string
  totalMarketCapUsd: number | null
  marketCapChange24hPct: number | null
  btcDominancePct: number | null
  ethDominancePct: number | null
  fearGreed: { value: number; label: string; previous: number | null } | null
  funding: { markPrice: number; lastFundingRatePct: number; nextFundingTime: number; openInterest: number | null } | null
  fetchedAt: number
}
export interface MacroApiResponse { macro: MacroSnapshot | null; crypto: CryptoMarketSnapshot }
```

### `netlify/functions/utils/klines.ts`

Lifts the fetch, sort, parse and indicator steps out of `candles.ts` so the
`get_candles` tool and the endpoint share one implementation.

```ts
export const VALID_INTERVALS: ReadonlySet<string>
export function fetchCandlesWithIndicators(symbol: string, interval: string, limit: number): Promise<CandlesResponse>
```

`candles.ts` becomes auth, param validation, and a call to this function.

### `netlify/functions/utils/chat-tools.ts`

Tool definitions and the read-tool executor, moved out of `chat.ts` so the
handler is only the loop.

```ts
export const CHAT_TOOLS: Anthropic.Tool[]          // write tools + read tools
export const READ_TOOL_NAMES: ReadonlySet<string>
export function executeReadTool(name: ChatReadToolName, input: unknown, ctx: DashboardContext): Promise<string>
```

Read tools:

- `get_macro_snapshot` (no input). Returns the FRED bundle formatted as compact
  lines: label, latest value with unit and date, previous value.
- `get_crypto_market` (`symbol?: string`, defaults to the active chart symbol).
  Returns market cap, dominance, Fear and Greed, funding and open interest.
- `get_candles` (`symbol: string`, `interval: string`, `limit?: number` 50 to
  200, default 100). Returns a compact summary, not the candles: window high and
  low, first and last close, percent change over the window, latest RSI, MACD
  line, signal and histogram, Bollinger upper, middle and lower, and the last
  ten closes. That keeps a tool result under a kilobyte.

Tool descriptions say when to call each one and what the result contains.
Errors return text the model can act on ("FRED is not configured on this
dashboard", "Binance rejected symbol FOOUSDT"), never a stack trace.

### `netlify/functions/chat.ts`

The loop distinguishes the two tool kinds:

- **Read tool**: executed server-side, its text becomes the `tool_result`, the
  loop continues. Recorded in `lookups` for the UI.
- **Write tool**: as today, recorded in `appliedTools`, `tool_result` says
  "Applied", the browser applies it after the reply.

Control limits: iteration cap rises from 3 to 5 because a real question can
legitimately need a lookup then a write (look up candles, then set an alert).
`max_tokens` stays 1024. Independent tool calls in one response run in
parallel with `Promise.all`.

System prompt additions: the model has lookup tools for macro, crypto market
and any chart; it must use them for questions about rates, inflation, the
dollar, market sentiment, funding, or any symbol or timeframe not on screen; it
must never state such figures from memory; when a lookup fails it says so.

Response shape:

```ts
export interface ChatApiResponse { reply: string; appliedTools: AppliedTool[]; lookups: ChatLookup[] }
export interface ChatLookup { name: ChatReadToolName; summary: string }   // e.g. "BTCUSDT 4h, 100 candles"
```

### `netlify/functions/macro.ts`

`GET /api/macro`, behind `requireAuth`. Query `symbol` optional. Returns
`MacroApiResponse` from the same module. The UI does not consume it in this
spec; it exists so the regime line follow-up and manual verification have a
door.

### Frontend

- `src/types/chat.ts`: `ChatReadToolName`, `ChatLookup`, `lookups` on the API
  response, optional `lookups` on `ChatMessage`.
- `src/hooks/useChat.ts`: copies `lookups` onto the assistant message.
- `src/components/chat/ChatMessage.tsx`: when an assistant message has
  lookups, renders a muted one-line "Looked up: macro snapshot, BTCUSDT 4h"
  under the bubble. The user can see what the model consulted.

No new store, no polling.

---

## Trust

**Read plus write in one run.** Once the model reads third-party payloads while
holding alert and watchlist tools, that content could in principle steer a
write. The three sources return numbers and short enum labels, the tool results
are formatted by our code from parsed fields (never the raw body), and every
write is reversible and shown in the UI. That risk is accepted and written
down here. Rule for the future: a free-text source such as news or social feeds
does not join this loop without a confirmation gate on writes.

**Credentials.** FRED and CoinGecko keys stay server-side, never `VITE_`. The
Binance futures endpoints are public and unsigned; the spot signing helper is
not touched.

**Tenancy, audit, compliance.** Single owner behind `requireAuth`. Prompts are
not stored anywhere by us; the AI Gateway's retention applies, same as the
existing chat and analysis features. No new decision.

---

## Cost and reliability

- Cache TTLs above bound upstream calls to at most one FRED burst per hour and
  one crypto burst per minute per warm instance.
- A read tool that fails returns a text error to the model and the turn
  continues; the user gets an answer that names what was unavailable.
- Iteration cap 5, per-fetch timeout 8 s, existing 26 s function limit. Loop
  detection is not added: the cap and the deterministic tool results make a
  same-call loop cost at most five iterations.
- Model stays `claude-haiku-4-5-20251001`. If answers combining macro and chart
  data reason poorly, upgrading to Sonnet is a one-line change; the eval list
  below tells whether it is needed.

---

## Testing

Vitest, following `netlify/functions/__tests__` conventions (mock `fetch`, mock
`auth`).

- `utils/market-data.test.ts`: FRED parsing skips `"."` observations and
  computes CPI year on year; a failed series yields `null` without failing the
  snapshot; missing `FRED_API_KEY` throws a typed error; `cached` returns the
  same value inside the TTL and reloads after it; CoinGecko, Fear and Greed and
  funding payloads map to the snapshot; funding failure leaves `funding: null`.
- `utils/chat-tools.test.ts`: each read tool formats its result compactly;
  `get_candles` rejects a bad interval with an actionable message; missing FRED
  key produces the "not configured" text.
- `__tests__/chat.test.ts`: with the Anthropic SDK mocked, a `tool_use` for a
  read tool is executed and fed back, a write tool lands in `appliedTools` and
  the reply carries `lookups`; the loop stops at the cap.
- `__tests__/candles.test.ts`: the endpoint still returns candles and
  indicators through the extracted module.

**Evals.** A fixed prompt list lives at the end of `docs/ai-analysis.md` and is
run by hand after any prompt or model change. It is not in CI because each run
spends real tokens and the feature has one user. Prompts: "what is the fed
funds rate", "is the market fearful or greedy", "how does ETH look on the 4h",
"what is CPI doing and does BTC funding look stretched", "set an alert if BTC
drops under the 4h Bollinger lower band" (lookup then write), and "what is the
price of gold" (must decline, no tool covers it).

---

## Environment

`.env.example`, CLAUDE.md, and the Netlify site settings gain:

```
FRED_API_KEY=          # free, https://fred.stlouisfed.org/docs/api/api_key.html
COINGECKO_API_KEY=     # optional demo key, raises the keyless 30 req/min limit
```

---

## Out of scope

- News or any free-text source.
- Storing history of any snapshot.
- The analysis panel regime line and a header macro strip (they consume
  `/api/macro`; separate spec).
- Streaming.
- Extending write tools to tax entries.
