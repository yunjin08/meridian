# Trading 212 positions ingestion

Date: 2026-08-29

## Goal

Show the real Trading 212 stock portfolio (open positions, account cash and
totals) in the Stocks and REITs tabs and in the Portfolio summary, instead of a
hand-maintained ticker list with no share counts.

## Constraints

- Trading 212 credentials never reach the browser. All calls go through a
  Netlify Function, mirroring how Binance is handled.
- Trading 212 rate limits are per account (shared across every API key):
  positions 1 req/s, account summary 1 req/5s. A 30s poll is well inside both.
- The public API only reports values in the primary account currency and only
  works for Invest and Stocks ISA accounts.
- Trading 212 tickers (`AAPL_US_EQ`) differ from the plain tickers the rest of
  the dashboard uses (`AAPL`) for Finnhub quotes and charts.

## Design

### Backend

`netlify/functions/utils/trading212-client.ts`
- `t212Fetch<T>(path)`: Basic auth (`TRADING212_API_KEY:TRADING212_API_SECRET`),
  base URL chosen by `TRADING212_ENV` (`demo` or `live`, default `live`), logs
  `x-ratelimit-remaining` and `x-ratelimit-reset`, throws `Trading212Error`
  with the HTTP status.
- `toDashboardTicker(t212Ticker)`: `AAPL_US_EQ` -> `AAPL`. For non-US tickers the
  exchange letter suffix is dropped (`VUSAl_EQ` -> `VUSA`). The raw ticker is
  kept on the position for display.

`netlify/functions/stock-positions.ts` -> `GET /api/stock-positions` (session
auth required). Fetches `/api/v0/equity/positions` and
`/api/v0/equity/account/summary` in parallel and returns:

```ts
interface StockPositionsResponse {
  account: StockAccountSummary   // currency, totalValue, cash, invested, P&L
  positions: StockPosition[]     // ticker, t212Ticker, name, quantity, avgPrice,
                                 // currentPrice, currency, currentValue,
                                 // totalCost, unrealizedPnl, fxImpact, openedAt
  fetchedAt: number
}
```

Errors follow the existing convention: `{ error, code, msg }` with 502 for
upstream failures (including 401 bad key, 403 missing scope, 429 rate limited).

### Frontend

- `src/store/stockPositionsStore.ts`: positions keyed by dashboard ticker,
  account summary, `isLoading`, `error`.
- `src/hooks/useStockPositions.ts`: polls every `STOCK_POSITIONS_POLL_INTERVAL_MS`
  (30s), pauses when the tab is hidden, and calls
  `usePortfolioStore.syncFromPositions()` on success.
- `portfolioStore.syncFromPositions(positions)`: upserts holdings tagged
  `source: 'trading212'` with their share counts, keeps the user's existing
  `assetClass` (so a ticker marked as a REIT stays a REIT), removes
  Trading 212 entries that are no longer held, and leaves manually added
  watchlist tickers alone.
- `StockAccountCard`: total value, available cash, invested, unrealized P&L in
  the account currency, above the holdings list.
- `StockRow`: shows shares, average price and unrealized P&L when a position
  exists; falls back to the Trading 212 `currentPrice` when Finnhub has no
  quote for the ticker.
- `PortfolioSection`: stock and REIT totals use Trading 212 `currentValue`
  when present, otherwise quote x shares as before.
- Chat context: positions (shares, avg price, P&L) are included so the
  assistant can answer questions about them.

### Out of scope

Order history, dividends, transactions, pies, order placement.

## Testing

- `npm run typecheck`, `npm run lint`, `npm run build`.
- Ticker mapping checked with a small node script.
- Function exercised through `netlify dev` once credentials are in `.env`.
