# Deployment Guide

---

## Prerequisites

- Netlify account
- Binance API key (Read Info permission only)
- Node 18+

---

## Local development

```bash
cd /Users/jededisondonaire/jed/investing

# 1. Copy env template and fill in your keys
cp .env.example .env
#    BINANCE_API_KEY=your_key
#    BINANCE_API_SECRET=your_secret

# 2. Start local dev (Vite + Netlify Functions together on :8888)
npm run dev

# 3. Open http://localhost:8888
```

### Testing functions locally

With `netlify dev` running:
```bash
# Public endpoints (no keys needed)
curl "http://localhost:8888/api/health"
curl "http://localhost:8888/api/ticker"
curl "http://localhost:8888/api/candles?interval=1h&limit=100"

# Authenticated (requires BINANCE_API_KEY + BINANCE_API_SECRET in .env)
curl "http://localhost:8888/api/balance"
```

---

## Netlify deployment

### Option A: GitHub integration (recommended)

1. Push the repo to GitHub
2. In Netlify: Add new site → Import from Git → select the repo
3. Build settings are auto-detected from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
4. Add environment variables in Site → Site configuration → Environment variables:
   - `BINANCE_API_KEY`
   - `BINANCE_API_SECRET`
5. Deploy

### Option B: CLI deploy

```bash
# Install Netlify CLI (already in devDependencies)
npx netlify login
npx netlify init

# Deploy to production
npx netlify deploy --prod
```

---

## Checklist before going live

- [ ] `BINANCE_API_KEY` set in Netlify env vars
- [ ] `BINANCE_API_SECRET` set in Netlify env vars
- [ ] Binance API key has **Read Info only** — no trading or withdrawal permissions
- [ ] Test `GET /api/balance` in production returns real data
- [ ] Open browser DevTools → Network tab → confirm no Binance API keys in any request from the browser
- [ ] Confirm WebSocket connects (check browser Console — `[ws] connected` / no CORS errors)
- [ ] Check Netlify Function logs for `[binance] weight used this minute:` — confirm well under 1200
- [ ] Trigger an alert condition and confirm browser notification fires
- [ ] Disable network → STALE badge appears → re-enable → badge clears

---

## Environment variables reference

| Variable | Required | Where used | Notes |
|----------|----------|-----------|-------|
| `BINANCE_API_KEY` | Yes | `balance.ts` | Never prefix with `VITE_` |
| `BINANCE_API_SECRET` | Yes | `balance.ts` | Used for HMAC signing only |

---

## `netlify.toml` summary

```toml
[build]
  command = "npm run build"    # tsc -b && vite build
  publish = "dist"
  functions = "netlify/functions"

[functions]
  node_bundler = "esbuild"     # required for TypeScript functions

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200                 # SPA routing
```

The `/api/*` → `/.netlify/functions/:splat` redirect means all frontend calls to `/api/balance` etc. route to the correct function without hardcoding Netlify's internal URLs.
