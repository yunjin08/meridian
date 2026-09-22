# CLAUDE.md — BTC Dashboard

Personal Bitcoin trading dashboard. Single user. Serverless on Netlify.

---

## Project Description

A real-time BTC/USDT trading dashboard connected to a personal Binance account. Shows live price, account balance, a candlestick chart with selectable timeframes, RSI/MACD/Bollinger Bands indicators, a server-evaluated alert system for custom conditions that emails and browser-notifies on a trigger, an Overview landing tab summarising crypto, stocks, and REITs, and a Tax tab for PH 8% flat-rate income tax with BIR deadline reminders.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | React | 19 |
| Language | TypeScript | 6 (strict) |
| Build tool | Vite | 8 |
| Styling | Tailwind CSS | 4 (CSS-first, no config file) |
| Charting | TradingView Lightweight Charts | 5 |
| State management | Zustand | 5 |
| Hero load animation | Theatre.js (`@theatre/core`; `@theatre/studio` dev-only via `?studio`) | 0.7 |
| Backend | Netlify Functions (serverless, esbuild) | — |
| Indicators | technicalindicators (RSI, MACD, BB) | 3 |
| Database | Netlify Database (Postgres, via Neon) + Drizzle ORM | — |
| Tests | Vitest | n/a |
| Deployment | Netlify | — |

---

## Architecture

### Data flow split

Public Binance WebSocket streams (`wss://stream.binance.com:9443`) connect **directly from the browser** — they are CORS-exempt and require no auth. All authenticated REST calls (account balance) and all REST calls in general (to avoid CORS) go through **Netlify Functions**.

```
Binance Public WS ──────────────────────────────► browser (useBinanceWebSocket)
                                                       │
                                                  priceStore
                                                  chartStore (live kline updates)

Browser ──► GET /api/candles ──► Netlify Function ──► Binance REST /api/v3/klines
                                       │ (no auth needed for klines)
                               calculateIndicators()
                                       │
                               returns { candles, indicators }

Browser ──► GET /api/balance ──► Netlify Function ──► Binance REST /api/v3/account
                                       │ (HMAC-SHA256 signed, API key injected)
                               returns { btc, usdt, btcInUsdt }
```

### Netlify Functions

All functions live in `netlify/functions/`. Shared modules live in `utils/`, not at the top level, so zisi (the Netlify Functions bundler) never mistakes them for endpoints.

| File | Endpoint | Auth | Purpose |
|------|----------|------|---------|
| `candles.ts` | `GET /api/candles` | None | Klines + RSI/MACD/BB |
| `balance.ts` | `GET /api/balance` | HMAC signed | Account BTC + USDT |
| `ticker.ts` | `GET /api/ticker` | None | 24h price stats (WS fallback) |
| `health.ts` | `GET /api/health` | None | Health check |
| `stock-positions.ts` | `GET /api/stock-positions` | Basic (Trading 212) | Open positions + account summary |
| `crypto-pnl.ts` | `GET /api/crypto-pnl` | HMAC signed | Per-coin cost basis and net P&L from spot fills, fiat orders and P2P trades, plus the daily spent-vs-value curve |
| `utils/binance-holdings.ts` | — | — | Wallet totals, price map, USDT pricing shared by balance and crypto-pnl |
| `chat.ts` | `POST /api/chat` | Session | Assistant loop: four alert write tools and four read tools executed server-side, two portfolio-watchlist write tools applied by the browser |
| `analyze.ts` | `POST /api/analyze` | Session | Forced-tool structured read of the active chart |
| `macro.ts` | `GET /api/macro` | Session | FRED macro snapshot plus crypto market stats, same data the chat read tools see |
| `utils/chat-tools.ts` | — | — | Chat tool schemas, read-tool and alert-tool executors, compact result formatting |
| `utils/market-data.ts` | — | — | FRED, CoinGecko, Fear & Greed, Binance Futures fetchers with a module-level TTL cache |
| `utils/klines.ts` | — | — | Kline fetch + parse + indicators shared by candles.ts and the get_candles tool |
| `utils/v2.ts` | — | — | Request/HandlerEvent adapters so AI functions can run as Functions 2.0 |
| `webauthn-register.ts` | `GET/POST /api/webauthn-register` | Session | Passkey enrolment options and verification |
| `webauthn-login.ts` | `GET/POST /api/webauthn-login` | None | Passkey sign-in, mints the same session cookie as `login.ts` |
| `webauthn-credentials.ts` | `GET/DELETE /api/webauthn-credentials` | Session | List and revoke registered devices |
| `utils/webauthn-policy.ts` | — | — | RP config, device labels, signature counter rule |
| `utils/webauthn-repo.ts` | — | — | Credential CRUD against Netlify Database (Drizzle) |
| `tax-entries.ts` | `GET/POST/PUT/DELETE /api/tax-entries` | Session | Tax receipts in Netlify Database |
| `tax-filings.ts` | `GET/PUT/DELETE /api/tax-filings` | Session | Filed periods |
| `alerts.ts` | `GET/POST/PUT/DELETE /api/alerts` | Session | Alert CRUD, plus PUT patches for active/reset/trigger |
| `alerts-cron.ts` | scheduled, every minute | none (Netlify-invoked) | Evaluates active alerts against fresh Binance data; emails on a fresh trigger |
| `utils/alert-repo.ts` | — | — | Alert CRUD, plus cron-only reads/writes (`listActiveAlerts`, `updateLastPrice`) against Netlify Database (Drizzle) |
| `utils/alert-validation.ts` | — | — | Request body/param validation for the alerts handler |
| `utils/email.ts` | — | — | Resend REST wrapper; fixed sender/recipient, no-ops (logs) if RESEND_API_KEY is missing |
| `utils/trading212-client.ts` | — | — | Basic-auth fetch wrapper + ticker mapping |
| `utils/db.ts` | — | — | Lazy Drizzle client reading `NETLIFY_DB_URL` from `process.env` directly; only reachable from a Functions 2.0 module (rule 12) |
| `utils/tax-repo.ts` | — | — | Tax entry/filing CRUD against Netlify Database (Drizzle) |
| `utils/tax-validation.ts` | — | — | Request body/param validation for tax handlers |
| `utils/binance-client.ts` | — | — | Typed fetch wrapper + HMAC signer |
| `utils/indicators.ts` | — | — | RSI/MACD/BB calculation |

### Frontend structure

```
src/
├── App.tsx                  Root — mounts all hooks, renders layout
├── constants.ts             All magic numbers and config in one place
├── types/                   Pure TypeScript interfaces (no logic)
│   ├── binance.ts           Raw Binance API shapes (tuple types, no `any`)
│   ├── candle.ts            Candle, IndicatorData, CandlesResponse
│   ├── account.ts           AccountBalance
│   ├── alert.ts             Alert, AlertInput, AlertCondition discriminated union
│   ├── tax.ts               TaxIncomeEntry, TaxFiling, TaxPeriod, TaxPeriodSummary
│   ├── webauthn.ts          PasskeyCredential (crosses the /api/webauthn-* boundary)
│   ├── chat.ts              DashboardContext, write/read tool names, ChatLookup, ChatApiResponse
│   ├── market.ts            MacroSnapshot, CryptoMarketSnapshot (crosses /api/macro and the chat tools)
│   └── websocket.ts         WsTickerMessage, WsKlineMessage, WsConnectionStatus
├── store/                   Zustand stores (one per domain)
│   ├── priceStore.ts        Live price, 24h stats, WS status, lastTickAt
│   ├── chartStore.ts        Active timeframe, candles[], indicators, isLoading
│   ├── balanceStore.ts      BTC/USDT balances, fetchedAt
│   ├── alertStore.ts        Alerts[] — server-backed (Netlify Database via /api/alerts), plus a client-only cross-detection map
│   └── taxStore.ts          entries[], filings[], selectedYear, load/add/edit/remove/markFiled/unmarkFiled
├── hooks/                   Side-effect hooks (one concern each)
│   ├── useBinanceWebSocket.ts  WS lifecycle, stream mgmt, exponential backoff reconnect
│   ├── useCandles.ts           Fetch candles+indicators, debounced on timeframe change
│   ├── useBalance.ts           Poll /api/balance every 30s, pause when tab hidden
│   ├── useAlertData.ts         Load alerts on mount, poll every 60s so cron-set triggers show up (all evaluation is server-side)
│   ├── useTaxData.ts           Loads tax entries/filings once on mount
│   ├── useTaxDeadlines.ts      Next actionable tax period + once-per-threshold notifications
│   └── usePortfolioSummary.ts  Combines crypto/stock/REIT stores into one PortfolioSummary
├── components/
│   ├── layout/              Header, Dashboard (grid — no logic)
│   ├── price/               ConnectionStatus
│   ├── chart/               ChartContainer, TimeframeSelector, IndicatorPanel, ChartLoadingOverlay
│   ├── alerts/              AlertList, AlertItem
│   ├── overview/            OverviewSection, PortfolioHero, AssetClassCard, PnlSection, PortfolioHistoryChart, AllocationBar, TopHoldingsList
│   ├── tax/                 TaxSection, TaxPeriodCard, TaxDeadlineBanner, TaxEntryForm, TaxEntryList, EnableNotificationsButton
│   ├── auth/                PasskeyPrompt (post-login offer), PasskeyPanel (manage devices)
│   └── ui/                  SkeletonBlock, FingerprintIcon
└── lib/                     Pure utilities (no React)
    ├── formatters.ts         Price/percent/BTC formatting, lastValue() helper
    ├── notifications.ts      Browser Notification API wrapper + permission flow
    ├── localStorage.ts       Manual localStorage read/write helpers
    ├── alertEvaluation.ts     Alias-free condition logic for the alerts cron (the only evaluator; also exports describeCondition for the UI)
    ├── alertsApi.ts           Fetch wrapper for /api/alerts
    ├── alertMigration.ts      One-time pull of pre-migration alerts out of localStorage
    ├── isoDate.ts             Alias-free ISO date parsing/formatting shared with functions
    ├── tax.ts                 Tax period math: weekend rollover, cumulative credit, status, next actionable
    ├── taxNotifications.ts    Decides whether a deadline notification fires today
    ├── taxApi.ts              Fetch wrapper for /api/tax-entries and /api/tax-filings
    ├── webauthnApi.ts         Passkey ceremonies and /api/webauthn-* fetch wrapper
    ├── passkeyPreference.ts   Per-browser passkey hints and the auto-prompt rule
    ├── portfolioSummary.ts    Aggregates crypto/stock/REIT holdings into PortfolioSummary
    ├── cryptoPnl.ts           Alias-free crypto cost basis and net P&L math (bundled into crypto-pnl.ts)
    ├── portfolioHistory.ts    Alias-free daily spent-vs-value curve and above/below-water bands
    ├── chartGeometry.ts       Pure SVG scale and path building for the history chart
    └── pnlSummary.ts          Combines crypto P&L with Trading 212 realized/unrealized into PnlSummary
```

### State management

Zustand — not Context — because live price updates ~1/sec and multiple components subscribe independently. Zustand's slice subscriptions prevent waterfall re-renders. Alert store is server-backed (not `persist`) so the alerts cron can evaluate the same records the browser sees.

Hooks (`App.tsx`) call `usePriceStore.getState()` / `store.subscribe()` directly in non-React contexts (alert evaluator) to avoid creating reactive subscriptions for side effects.

---

## Commands

```bash
# Always cd into the project first
cd /home/jed/jed/meridian

# Local development (starts Vite + Netlify Functions together on :8888)
npm run dev

# Type-check only (fast, no emit)
npm run typecheck

# Run the test suite (Vitest)
npm test

# Production build
npm run build

# Test a function directly (requires netlify dev running)
curl "http://localhost:8888/api/candles?interval=1h&limit=100"
curl "http://localhost:8888/api/ticker"
curl "http://localhost:8888/api/balance"
curl "http://localhost:8888/api/health"
```

---

## Environment Variables

Stored in `.env` locally, in Netlify Site Settings → Environment Variables for production.

```bash
BINANCE_API_KEY=...
BINANCE_API_SECRET=...
TRADING212_API_KEY=...
TRADING212_API_SECRET=...
TRADING212_ENV=live   # or demo
WEBAUTHN_RP_ID=...              # bare domain, e.g. meridian.netlify.app (localhost in dev)
WEBAUTHN_ORIGIN=...             # full origin, e.g. https://meridian.netlify.app
FRED_API_KEY=...                # free; without it the chat says macro data is not configured
COINGECKO_API_KEY=...           # optional demo key, raises the keyless 30 req/min limit
RESEND_API_KEY=...              # sends alert-triggered emails; missing = alerts-cron logs and skips the send
```

`ANTHROPIC_API_KEY` is not set by hand: Netlify's AI Gateway injects it (see
`docs/ai-analysis.md`). `NETLIFY_DB_URL` likewise is not set by hand — Netlify Database injects
it per branch (production, deploy preview, or `netlify dev` locally). Despite the docs naming it
`NETLIFY_DATABASE_URL`, the installed `@netlify/database` version actually injects `NETLIFY_DB_URL`;
`utils/db.ts` reads `process.env` directly and checks both names, rather than going through
`@netlify/database`'s own `getDatabase()`, because that function reads through a scoped
`globalThis.Netlify.env` accessor that did not reliably see the variable for a function added in a
deploy after the database was first connected. There is no manual database env var to configure —
but see rule 12 below: this only reaches a function that is a Functions 2.0 module.

A passkey is bound to one origin, so `localhost` and production hold separate
registrations. Registering on the dev server does not sign you in on production.

**Critical:** never prefix these with `VITE_`. That would inline them into the browser bundle.

Create the Binance API key with **Read Info only** — disable Spot Trading, Withdrawal, and all other permissions.

Create the Trading 212 API key with read scopes only (account, portfolio, history, metadata, orders read) and no write scopes. Today only `account` and `portfolio` are exercised; the rest are for upcoming history/metadata work. Its rate limits are per account (positions 1 req/s, summary 1 req/5s), shared with any other tool using the same account. Reference: `docs/trading212-api.md`.

---

## Coding Conventions

### TypeScript

- `strict: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true` — all enforced.
- Never use `any`. Raw Binance kline arrays are typed as tuples (`BinanceKlineArray`) so each index has a known type.
- Array index access (`arr[i]`) returns `T | undefined` — always guard or use the `lastValue()` helper in `lib/formatters.ts`.
- Use `satisfies` when constructing objects that must match an interface (see `alertStore.ts`).
- Imports use the `@/` alias for `src/` — e.g. `import { useChartStore } from '@/store/chartStore'`.
- Functions code imports from `src/` using relative paths with `.ts` extensions (functions tsconfig has `allowImportingTsExtensions: true`).

### React

- Hooks are the unit of side-effect logic — one hook per concern, not inline in components.
- Components read from Zustand stores directly (`useXxxStore(s => s.field)`) — no prop drilling for store state.
- `useEffect` cleanup must always run — no fire-and-forget effects that leak listeners or timers.
- TradingView chart instance lives in `useRef`, never in state. Only call `.setData()` / `.update()` from effects, never during render.
- Never re-create the chart instance on re-renders. Initialization effect runs once (on mount) and cleanup removes it.

### Netlify Functions

- All functions return CORS headers (`Access-Control-Allow-Origin: *`).
- Handle `OPTIONS` preflight explicitly at the top of every handler.
- Errors return structured JSON: `{ error: string, code?: number, msg?: string }`.
- Log the `X-MBX-USED-WEIGHT-1M` header from every Binance response for rate limit monitoring.
- Never `console.log` secrets. Binance signs happen in `_binance-client.ts` only.

### Tailwind / Styling

- Tailwind v4 — configuration lives in `src/index.css` inside `@theme {}`, not in a config file.
- Custom colors: `btc-orange`, `bull-green`, `bear-red`, `terminal-bg`, `panel-bg`, `panel-border`, `text-primary`, `text-muted`.
- Dark terminal aesthetic throughout. No light mode.
- Monetary values always use `font-mono`.

### Naming

- Stores: `useXxxStore` (e.g. `usePriceStore`)
- Hooks: `useXxx` (e.g. `useCandles`)
- Components: PascalCase matching filename
- Types/interfaces: PascalCase, no `I` prefix
- Constants: `SCREAMING_SNAKE_CASE` in `constants.ts`

---

## Important Rules

1. **API keys never touch the frontend.** No `VITE_BINANCE_*` env vars. No Binance authenticated calls from browser code. Everything auth-sensitive goes through Netlify Functions.

2. **WebSocket for public streams, Functions for everything else.** Binance public WS (`btcusdt@ticker`, `btcusdt@kline_*`) connects directly from the browser. REST always goes through `/api/*`.

3. **One combined candles endpoint.** Indicators are calculated server-side in the same `candles.ts` function call. There is no separate `/api/indicators` endpoint — that would require a second Binance kline fetch.

4. **Tax records, passkey credentials, and alerts live in Netlify Database; everything else stays stateless.** Only `tax_income_entries`, `tax_filings`, `webauthn_credentials` and `alerts` are persisted server-side (`db/schema.ts`), and only through `netlify/functions/tax-*.ts`, `webauthn-*.ts` and `alerts.ts`/`alerts-cron.ts` via `utils/db.ts`'s Drizzle client. Alerts moved off localStorage specifically so the `alerts-cron.ts` scheduled function can evaluate them and email the owner without a browser tab open — that is the one exception to "only tax and passkeys are stateful," made because a client-only store can't be read by a cron. The stock watchlist and the chat transcript remain in localStorage. Adding another table is an architecture decision, not a convenience.

5. **Always run commands from the repository root.** The working directory is `/home/jed/jed/meridian`.

6. **Netlify Functions have a separate `tsconfig.json`.** The functions directory at `netlify/functions/` has its own `tsconfig.json` (NodeNext module resolution, `allowImportingTsExtensions`, not bundler mode). It has no `package.json` or `node_modules` of its own; it shares the root `package.json` and dependencies.

7. **lightweight-charts v5 API.** Use `chart.addSeries(CandlestickSeries, options)` — not `chart.addCandlestickSeries()`. The v5 API changed this.

8. **Tailwind v4 has no config file.** Don't create `tailwind.config.ts`. Custom tokens go in `@theme {}` inside `src/index.css`. Content detection is automatic via the `@tailwindcss/vite` plugin.

9. **Tax math is pure and tested (`src/lib/tax.ts`).** Components never compute tax; they render `TaxPeriodSummary`.

10. **Function code must never import a `src/` module that uses the `@/` alias, directly or transitively.** Netlify bundles each function with esbuild and no path mapping, so an `@/` import resolves locally but fails in the deployed bundle. Type-only imports from `src/types/*.ts` are fine (types are erased before bundling). `src/lib/isoDate.ts` is the alias-free helper module for logic that functions need to share with the frontend; put more of that kind of code there rather than reaching into files that import `@/`.

11. **Owner sign-in is passphrase OR passkey, never both as factors.** A passkey login mints the same `dashboard_session` cookie `login.ts` mints, so nothing downstream of auth knows which was used. The passphrase is the recovery path and must never be removed. The `meridian.passkey.*` localStorage keys are UX hints only: the server decides every outcome regardless of what they say.

12. **Functions that call a model, or touch the database, must be Functions 2.0 modules.** Netlify's AI Gateway injects `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL`, and Netlify Database injects `NETLIFY_DB_URL`, only into the v2 runtime (`export default async (req: Request)` plus `export const config = { path }`), never into a classic `export const handler`. This was discovered the hard way: every DB-touching function was originally a classic handler and silently could not connect in production. Wrap an event-based body with `asV2` from `utils/v2.ts` so auth and the HTTP helpers still apply. See `docs/ai-analysis.md`.

13. **The WebAuthn challenge is a signed cookie, not a table.** `createChallengeCookie` / `readChallengeCookie` in `utils/auth.ts` carry it across the two-step ceremony with a 2 minute TTL. Do not add a challenges table.

14. **Schema changes go through a migration, never a live edit.** `db/schema.ts` is the source of truth; `npx drizzle-kit generate --name <description>` diffs it against `netlify/database/migrations/` and writes a new migration folder. Netlify applies pending migrations automatically on every deploy (production and previews) — there is no manual `push` step in the build. Never hand-edit a migration file that has already been applied; write a new one instead, same as any other migration tool.

---

## Known Limitations (Phase 1)

- Alert evaluation is server-only (`alerts-cron.ts`, once a minute) — crypto alerts email regardless of whether a tab is open, but detection resolution is bounded to one minute and stock/REIT alerts aren't evaluated at all. See `docs/alerts.md`.
- Alerts are synced across devices via Netlify Database, but the chat transcript remains localStorage-only, not synced across devices or browsers.
- No order placement, order history, or P&L tracking.
- Symbol is hardcoded to `BTCUSDT` in `constants.ts`.
- Deadline notifications fire only while the tab is open; the once-per-threshold markers are per browser.
- Passkeys are per origin, so a credential registered on localhost does not work in production.
- Passkey sign-in has no rate limit of its own; it is guarded by signature verification, not by attempt counting.
- PH public holidays are not modelled in deadline rollover.
- Chat lookups cover US macro (FRED), crypto market stats and Binance spot candles only. No news, no equities indices, no commodities; the prompt tells the model to say so.
- The market-data cache is per warm function instance, so a cold start refetches. Fine at one user; not a shared cache.
