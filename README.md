# Investing Dashboard

A personal, single-owner dashboard for every investment in one place: crypto on Binance, stocks and REITs on Trading 212, what went in, what it is worth now, what it has earned, and what Philippine income tax is due. Live data, read-only API keys, no order placement.

Visitors see a public landing page with live BTC market data and nothing from the owner's account. Everything else is behind one passphrase.

## What it does

- **Overview**: total portfolio value across crypto, stocks and REITs, 24h change, all-time profit and loss (per coin from Binance spot fills, fiat orders and P2P trades, per position from Trading 212), a day-by-day chart of money in against value since the first purchase, allocation by class, top holdings, and a banner when a tax deadline is near.
- **Crypto**: Binance holdings priced live over the public WebSocket, candlestick chart with 1m to 1d timeframes, RSI / MACD / Bollinger Bands computed server-side, and per-asset trade history (spent, received, net result).
- **Stocks and REITs**: Trading 212 positions, cost basis, cash and realized P&L through a read-only key; Finnhub quotes for the watchlist; the same chart and indicators per ticker.
- **Tax**: log gross receipts in PHP; the app applies the 8% flat-rate option with the ₱250,000 annual exemption, computes 1701Q and 1701A amounts, tracks BIR deadlines, and notifies at 30 / 14 / 7 / 1 days.
- **Alerts**: price, RSI and MACD conditions on any asset, evaluated on every tick, delivered as browser notifications, stored in localStorage.
- **Assistant**: Claude receives the live dashboard as context, answers in a sentence, and manages alerts and the watchlist through tools.

## Setup

Requires Node.js and a Netlify account.

```bash
npm install
cd netlify/functions && npm install && cd ../..
```

Create `.env` in the repo root. Nothing here may be prefixed `VITE_`; that would inline it into the browser bundle.

```bash
# Owner login
AUTH_PASSWORD_HASH=salt:hash          # see below
AUTH_SESSION_SECRET=random_hex        # see below

# Binance: create the key with Read Info only
BINANCE_API_KEY=
BINANCE_API_SECRET=

# Trading 212: Settings → API (Beta), read scopes only. TRADING212_ENV=demo for paper trading.
TRADING212_API_KEY=
TRADING212_API_SECRET=

# Finnhub: stock and REIT quotes
FINNHUB_API_KEY=

# Anthropic: the assistant
ANTHROPIC_API_KEY=

# Supabase: tax records (service role key, used only inside functions)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Generate the login values:

```bash
# AUTH_PASSWORD_HASH
node -e "const c=require('node:crypto');const s=c.randomBytes(16).toString('hex');console.log(s+':'+c.scryptSync(process.argv[1],s,64).toString('hex'))" "your-strong-passphrase"

# AUTH_SESSION_SECRET
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

For the Tax tab, create a Supabase project and run `supabase/migrations/0001_tax.sql` in the SQL editor. The tables have row level security on with no policies, so only the service role key can reach them.

Optional: `VITE_STOCK_PORTFOLIO=AAPL:stock,O:reit` seeds the watchlist. It is public in the bundle, so list only tickers you are fine showing.

## Run

```bash
npm run dev        # Vite + Netlify Functions on http://localhost:8888
npm run typecheck
npm test           # Vitest
npm run build
```

Local dev with `?studio` in the URL opens Theatre.js Studio over the landing page to edit the load animation.

## How it works

```
Binance public WebSocket ─────────────────────────► browser (prices, live candles)

browser ──► /api/*  ──► Netlify Functions ──► Binance (HMAC signed) · Trading 212 · Finnhub
                                           ──► Anthropic (assistant) · Supabase (tax)
```

Public market data streams straight into the browser. Every call that touches an account goes through a function that checks the session cookie and holds the keys. `/api/candles` and `/api/ticker` answer anonymously for `BTCUSDT` only, which is what the landing page shows.

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript (strict), Vite, Tailwind CSS v4, Zustand |
| Charts | TradingView Lightweight Charts v5 |
| Indicators | technicalindicators (RSI, MACD, Bollinger Bands) |
| Backend | Netlify Functions |
| Database | Supabase (tax records only) |
| Landing animation | Theatre.js |
| Tests | Vitest |

More detail: `CLAUDE.md`, `docs/`.

## Deploy

Deploy to Netlify and set the same variables as `.env` in **Site configuration → Environment variables**.

## License

[MIT](https://choosealicense.com/licenses/mit/)
