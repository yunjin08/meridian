# Trading 212 API Reference

Quick reference for the Trading 212 Public API endpoints used in this project.
Full docs: https://docs.trading212.com/api (OpenAPI bundle:
https://docs.trading212.com/_bundle/api.yaml).

---

## Environments

| Env | Base URL |
|-----|----------|
| Live | `https://live.trading212.com/api/v0` |
| Demo (paper) | `https://demo.trading212.com/api/v0` |

Selected by `TRADING212_ENV` (`live` default, or `demo`). API key versions may
differ between real and demo accounts, so generate the key in the same
environment you point at.

Only Invest and Stocks ISA accounts are supported. All monetary values in
responses are in the primary account currency.

## Authentication

HTTP Basic: API key as the username, API secret as the password.

```
Authorization: Basic base64("<API_KEY>:<API_SECRET>")
```

Generate keys in the Trading 212 app: Settings -> API (Beta). The secret is
shown once. Enable the read scopes (`account`, `portfolio`, `history:*`,
`metadata`, orders read) so future history/metadata endpoints work without a
new key. Never enable a write scope: the dashboard is read-only.

## Rate limits

Applied per account, regardless of API key or IP. Every response carries:
`x-ratelimit-limit`, `x-ratelimit-period`, `x-ratelimit-remaining`,
`x-ratelimit-reset` (unix seconds), `x-ratelimit-used`. A 429 means the window
is exhausted; wait for `x-ratelimit-reset`.

## Endpoints used

### Open positions
```
GET /api/v0/equity/positions
Params: ticker (optional filter, e.g. AAPL_US_EQ)
Scope: portfolio
Rate limit: 1 req / 1s
Used by: stock-positions.ts
```
Response: `Position[]`
```
averagePricePaid   number   per share, instrument currency
createdAt          string   ISO 8601
currentPrice       number   per share, instrument currency
instrument         { ticker, name, isin, currency }
quantity           number
quantityAvailableForTrading  number
quantityInPies     number
walletImpact       { currency, currentValue, totalCost, unrealizedProfitLoss, fxImpact }
```

### Account summary
```
GET /api/v0/equity/account/summary
Scope: account
Rate limit: 1 req / 5s
Used by: stock-positions.ts
```
Response: `AccountSummary`
```
id            integer
currency      string   ISO 4217
totalValue    number
cash          { availableToTrade, inPies, reservedForOrders }
investments   { currentValue, totalCost, unrealizedProfitLoss, realizedProfitLoss }
```

## Ticker format

Trading 212 tickers are `<symbol><exchange suffix>_<market>_EQ`, e.g.
`AAPL_US_EQ` (Nasdaq), `VUSAl_EQ` (LSE, lowercase `l` suffix). The dashboard
maps these to plain symbols (`AAPL`, `VUSA`) for Finnhub quotes and charts and
keeps the raw ticker on the position.

## Not used (available)

- `GET /equity/metadata/instruments` (1 req / 50s) and `/exchanges` (1 req / 30s)
- `GET /equity/history/orders`, `/dividends`, `/transactions` (6 req / min,
  cursor paginated via `nextPagePath`, max `limit` 50)
- `GET/POST /equity/history/exports` (CSV reports)
- Order placement and pies
