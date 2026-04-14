# BTC Dashboard

BTC Dashboard is a personal real-time Bitcoin trading dashboard connected to a Binance account. It displays live BTC/USDT price, account balance, candlestick charts with selectable timeframes, RSI/MACD/Bollinger Bands indicators, and a browser-notification alert system for custom price conditions.

## Installation

Requires [Node.js](https://nodejs.org/) and a [Netlify](https://www.netlify.com/) account for deployment.

```bash
# Clone the repo and install dependencies
cd bitcoin-dashboard
npm install

# Install Netlify Functions dependencies
cd netlify/functions
npm install
cd ../..
```

## Configuration

Create a `.env` file in `bitcoin-dashboard/` with your Binance API credentials:

```bash
BINANCE_API_KEY=your_api_key_here
BINANCE_API_SECRET=your_api_secret_here
```

> **Important:** Create the Binance API key with **Read Info only** — disable Spot Trading, Withdrawal, and all other permissions. Never prefix these with `VITE_` as that would expose them in the browser bundle.

## Usage

```bash
# Start local development server (Vite + Netlify Functions on :8888)
npm run dev

# Type-check only
npm run typecheck

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
| Deployment | Netlify |

## Architecture

Public Binance WebSocket streams connect directly from the browser (CORS-exempt). All authenticated REST calls go through Netlify Functions to keep API keys server-side only.

```
Binance Public WS ──► browser (live price + kline updates)

Browser ──► GET /api/candles ──► Netlify Function ──► Binance REST (klines + indicators)
Browser ──► GET /api/balance ──► Netlify Function ──► Binance REST (HMAC signed)
```

## Deployment

Deploy to Netlify and set `BINANCE_API_KEY` and `BINANCE_API_SECRET` in **Site Settings → Environment Variables**.

## License

[MIT](https://choosealicense.com/licenses/mit/)
