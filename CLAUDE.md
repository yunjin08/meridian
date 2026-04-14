# CLAUDE.md — BTC Dashboard

Personal Bitcoin trading dashboard. Single user. Serverless on Netlify.

---

## Project Description

A real-time BTC/USDT trading dashboard connected to a personal Binance account. Shows live price, account balance, a candlestick chart with selectable timeframes, RSI/MACD/Bollinger Bands indicators, and a browser-notification alert system for custom conditions.

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
| Backend | Netlify Functions (serverless, esbuild) | — |
| Indicators | technicalindicators (RSI, MACD, BB) | 3 |
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

All functions live in `netlify/functions/`. Files prefixed `_` are shared modules, not endpoints.

| File | Endpoint | Auth | Purpose |
|------|----------|------|---------|
| `candles.ts` | `GET /api/candles` | None | Klines + RSI/MACD/BB |
| `balance.ts` | `GET /api/balance` | HMAC signed | Account BTC + USDT |
| `ticker.ts` | `GET /api/ticker` | None | 24h price stats (WS fallback) |
| `health.ts` | `GET /api/health` | None | Health check |
| `_binance-client.ts` | — | — | Typed fetch wrapper + HMAC signer |
| `_indicators.ts` | — | — | RSI/MACD/BB calculation |

### Frontend structure

```
src/
├── App.tsx                  Root — mounts all hooks, renders layout
├── constants.ts             All magic numbers and config in one place
├── types/                   Pure TypeScript interfaces (no logic)
│   ├── binance.ts           Raw Binance API shapes (tuple types, no `any`)
│   ├── candle.ts            Candle, IndicatorData, CandlesResponse
│   ├── account.ts           AccountBalance
│   ├── alert.ts             Alert, AlertCondition discriminated union
│   └── websocket.ts         WsTickerMessage, WsKlineMessage, WsConnectionStatus
├── store/                   Zustand stores (one per domain)
│   ├── priceStore.ts        Live price, 24h stats, WS status, lastTickAt
│   ├── chartStore.ts        Active timeframe, candles[], indicators, isLoading
│   ├── balanceStore.ts      BTC/USDT balances, fetchedAt
│   └── alertStore.ts        Alerts[] — persisted to localStorage via Zustand persist
├── hooks/                   Side-effect hooks (one concern each)
│   ├── useBinanceWebSocket.ts  WS lifecycle, stream mgmt, exponential backoff reconnect
│   ├── useCandles.ts           Fetch candles+indicators, debounced on timeframe change
│   ├── useBalance.ts           Poll /api/balance every 30s, pause when tab hidden
│   └── useAlertEvaluator.ts    Subscribe to stores, evaluate conditions, fire notifications
├── components/
│   ├── layout/              Header, Dashboard (grid — no logic)
│   ├── price/               PriceTicker, ConnectionStatus
│   ├── balance/             BalanceCard
│   ├── chart/               ChartContainer, TimeframeSelector, IndicatorPanel, ChartLoadingOverlay
│   └── alerts/              AlertForm, AlertList, AlertItem
└── lib/                     Pure utilities (no React)
    ├── formatters.ts         Price/percent/BTC formatting, lastValue() helper
    ├── notifications.ts      Browser Notification API wrapper + permission flow
    └── localStorage.ts       Manual read/write helpers (Zustand persist handles alerts)
```

### State management

Zustand — not Context — because live price updates ~1/sec and multiple components subscribe independently. Zustand's slice subscriptions prevent waterfall re-renders. Alert store uses `persist` middleware for zero-boilerplate localStorage sync.

Hooks (`App.tsx`) call `usePriceStore.getState()` / `store.subscribe()` directly in non-React contexts (alert evaluator) to avoid creating reactive subscriptions for side effects.

---

## Commands

```bash
# Always cd into the project first
cd /Users/jededisondonaire/jed/investing

# Local development (starts Vite + Netlify Functions together on :8888)
npm run dev

# Type-check only (fast, no emit)
npm run typecheck

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
```

**Critical:** never prefix these with `VITE_`. That would inline them into the browser bundle.

Create the Binance API key with **Read Info only** — disable Spot Trading, Withdrawal, and all other permissions.

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

4. **No database.** The app is stateless. Alerts persist in localStorage (Zustand persist). Everything else is fetched fresh or held in React state. If you need persistence beyond alerts, reconsider the architecture first.

5. **Always run commands from the repository root.** The working directory is `/Users/jededisondonaire/jed/investing/`.

6. **Netlify Functions have a separate `tsconfig.json` and `package.json`.** The functions directory at `netlify/functions/` has its own `tsconfig.json` (NodeNext module resolution, not bundler mode) and its own `node_modules` for `technicalindicators` and `@types/node`.

7. **lightweight-charts v5 API.** Use `chart.addSeries(CandlestickSeries, options)` — not `chart.addCandlestickSeries()`. The v5 API changed this.

8. **Tailwind v4 has no config file.** Don't create `tailwind.config.ts`. Custom tokens go in `@theme {}` inside `src/index.css`. Content detection is automatic via the `@tailwindcss/vite` plugin.

---

## Known Limitations (Phase 1)

- Alerts only fire while the browser tab is open. JavaScript stops when the tab is closed.
- Alert definitions are localStorage-only — not synced across devices or browsers.
- No order placement, order history, or P&L tracking.
- Symbol is hardcoded to `BTCUSDT` in `constants.ts`.
