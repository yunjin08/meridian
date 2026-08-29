# BTC Dashboard

BTC Dashboard is a personal real-time Bitcoin trading dashboard connected to a Binance account. It displays live BTC/USDT price, account balance, candlestick charts with selectable timeframes, RSI/MACD/Bollinger Bands indicators, and a browser-notification alert system for custom price conditions. It also includes an Overview tab that summarises crypto, stocks, and REIT holdings, and a Tax tab for tracking PH 8% flat-rate income tax with BIR deadline reminders.

## Installation

Requires [Node.js](https://nodejs.org/) and a [Netlify](https://www.netlify.com/) account for deployment.

```bash
# Clone the repo and install dependencies
npm install

# Install Netlify Functions dependencies
cd netlify/functions
npm install
cd ../..
```

## Configuration

Create a `.env` file in the repo root with your Binance API credentials and auth settings:

```bash
BINANCE_API_KEY=your_api_key_here
BINANCE_API_SECRET=your_api_secret_here
AUTH_PASSWORD_HASH=your_scrypt_hash_here
AUTH_SESSION_SECRET=your_random_session_secret_here

# Trading 212 (stocks/REITs positions). Optional: TRADING212_ENV=demo for paper trading.
TRADING212_API_KEY=your_trading212_key
TRADING212_API_SECRET=your_trading212_secret

# Supabase (tax records)
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

> **Important:** Create the Binance API key with **Read Info only** — disable Spot Trading, Withdrawal, and all other permissions. Never prefix these with `VITE_` as that would expose them in the browser bundle.

Generate the Trading 212 key in the app under **Settings → API (Beta)** with only the `account` and `portfolio` scopes (no order scopes). The secret is shown once. The public API works for Invest and Stocks ISA accounts only, and reports values in your account's primary currency. See `docs/trading212-api.md`.

Generate `AUTH_PASSWORD_HASH` in `salt:hash` format with Node:

```bash
node -e "const crypto=require('node:crypto');const salt=crypto.randomBytes(16).toString('hex');const hash=crypto.scryptSync(process.argv[1],salt,64).toString('hex');console.log(`${salt}:${hash}`)" "your-strong-passphrase"
```

Generate `AUTH_SESSION_SECRET`:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

### Supabase (tax records)

The Tax tab persists income entries and filed periods in Supabase. Set it up once:

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run `supabase/migrations/0001_tax.sql`. This creates `tax_income_entries` and `tax_filings` with row level security enabled and no policies, so only the service role key (used server-side by `netlify/functions/tax-*.ts`) can read or write them.
3. Copy the project URL and the service role key (Project Settings → API) into `.env` locally, and into Netlify Site Settings → Environment Variables for production.

## Usage

```bash
# Start local development server (Vite + Netlify Functions on :8888)
npm run dev

# Type-check only
npm run typecheck

# Run the test suite (Vitest)
npm test

# Production build
npm run build
```

Test API endpoints while `npm run dev` is running:

```bash
curl "http://localhost:8888/api/candles?interval=1h&limit=100"
curl "http://localhost:8888/api/ticker"
curl "http://localhost:8888/api/balance"
curl "http://localhost:8888/api/health"
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS v4 |
| Charting | TradingView Lightweight Charts v5 |
| State | Zustand v5 |
| Backend | Netlify Functions (serverless) |
| Indicators | technicalindicators (RSI, MACD, BB) |
| Database | Supabase (Postgres, tax records only) |
| Tests | Vitest |
| Deployment | Netlify |

## Architecture

Public Binance WebSocket streams connect directly from the browser (CORS-exempt). All authenticated REST calls go through Netlify Functions to keep API keys server-side only.

```
Binance Public WS ──► browser (live price + kline updates)

Browser ──► GET /api/candles ──► Netlify Function ──► Binance REST (klines + indicators)
Browser ──► GET /api/balance ──► Netlify Function ──► Binance REST (HMAC signed)
```

## Deployment

Deploy to Netlify and set `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `TRADING212_API_KEY`, `TRADING212_API_SECRET`, `AUTH_PASSWORD_HASH`, `AUTH_SESSION_SECRET`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` in **Site Settings → Environment Variables**.

## License

[MIT](https://choosealicense.com/licenses/mit/)
