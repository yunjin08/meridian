# Public Landing Page

Date: 2026-08-30
Status: approved, implemented on `feat/landing-page`

## Goal

Replace the bare login card shown to unauthenticated visitors with a portfolio-grade landing page that demonstrates what the dashboard does, using real live market data, while exposing none of the owner's private data. The dashboard stays single-user: the only account is the owner's, and sign-in moves into a modal.

## Decisions

| Question | Decision |
|---|---|
| Subject of the page | The product. Bio is a footer line "Built by Jed Donaire" linking to GitHub. |
| Live data | Public Binance WebSocket for the BTCUSDT ticker and kline stream, plus `/api/candles` and `/api/ticker` opened to unauthenticated requests for `BTCUSDT` only, with the candle `limit` capped at 200 for unauthenticated calls. |
| Private data | Never rendered before login. Balances, positions, trades, quotes, chat, and tax endpoints stay behind `requireAuth`. No store that holds personal data is mounted on the landing page. |
| Upcoming features | The Overview tab and PH 8% tax module (in progress on `feat/overview-and-tax`) appear in the feature grid with an "in progress" tag controlled by one constant. |
| Theme | Dark terminal system only, same tokens as the dashboard. No light mode. |
| Motion | CSS only: staggered hero entrance, IntersectionObserver scroll reveal, price tick flash, animated data-flow connectors. Everything collapses under `prefers-reduced-motion`. |
| Dependencies | None new at runtime. Vitest added as a dev dependency for the auth helper tests, matching the version and config used on `feat/overview-and-tax`. |

## Structure

`src/App.tsx` keeps three states: checking session, `<LandingPage onAuthenticated />`, `<AppInner />`. Only the unauthenticated branch changes.

`src/components/landing/`
- `LandingPage.tsx`: mounts `useBinanceWebSocket()` and `useCandles()`, composes the sections, owns the sign-in modal state.
- `LandingNav.tsx`: sticky bar with wordmark, `ConnectionStatus`, and the "Owner sign in" button.
- `HeroSection.tsx`: headline, one-line description, GitHub CTA, live BTC price block, and the real `ChartContainer` + `TimeframeSelector` + `IndicatorPanel` in a framed terminal window.
- `FeatureGrid.tsx`: six-cell bento: Crypto, Assistant, Stocks & REITs, Indicators, Alerts, Overview & tax. Cells show real facts (tool names, condition types, live RSI) rather than mock UI.
- `ArchitectureSection.tsx`: browser, Netlify Functions, and provider columns joined by animated connectors, with the security stance stated underneath.
- `StackStrip.tsx`: scroll-snap row of mono chips.
- `LandingFooter.tsx`: "Built by Jed Donaire", GitHub and source links.
- `SignInModal.tsx`: the previous passphrase form and `POST /api/login` flow, unchanged, inside an accessible modal.

`src/hooks/useReveal.ts`: one `IntersectionObserver` that adds `is-visible` to observed sections.

## Server changes

`netlify/functions/utils/auth.ts` gains `isPublicMarketRequest(event)` and `requireAuthUnlessPublicMarketData(event)`. A request is public when `symbol` is exactly `BTCUSDT` (case-insensitive) and the caller has no valid session. `candles.ts` and `ticker.ts` use it; `candles.ts` caps `limit` at `PUBLIC_CANDLE_LIMIT` (200) for public requests.

## States

- Connecting / loading: mono placeholder for the price, `ChartLoadingOverlay` in the chart frame.
- WebSocket failed: `ConnectionStatus` shows Offline; page renders fully; chart still loads from REST.
- Candles fetch failed: chart frame shows "Live chart unavailable".
- Sign-in: wrong passphrase, network error, and in-flight states unchanged; success closes the modal and mounts `AppInner` without reload.

## Verification

- `netlify/functions/utils/auth.test.ts`: BTCUSDT unauthenticated allowed, other symbols 401, authenticated allowed for any symbol, missing symbol defaults to BTCUSDT.
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`.
- Manual: landing at 1440 / 768 / 390 widths, `/api/balance` still 401 unauthenticated, login round trip.

## Revision, 2026-08-30 (same day)

Feedback: the first cut read as a Bitcoin chart demo. The product is the whole portfolio, so:

- Hero copy is about every investment: what went in, current value, profit, tax due. The hero visual is `OverviewPreview`, the Overview tab with every label real and every value hidden behind a hatched placeholder (no sample figures, no owner data).
- The live BTC price and chart move to a `MarketSection` below the feature grid, framed as the one public feed.
- Feature grid order: portfolio overview, tax, stocks and REITs, crypto, alerts, assistant. Indicators are covered by the chart panel.

## Revision, 2026-08-30: load animation

Jed asked for a strong load animation built with Theatre.js.

- `src/lib/theatre/heroTimeline.ts` declares one 4.2 s sequence (sheet `Hero`, objects `Text`, `Curve`, `Card`) as keyframe data. `useHeroTimeline` binds it to elements marked `data-anim` and writes inline styles per frame, so React never re-renders during playback.
- `HeroScene` draws a fixed growth curve in a band under the hero grid, with one node per asset class (Crypto, Stocks, REITs) popping in along the line. The band overlaps the Overview card by 32-40px so the curve finishes at the card's bottom-right corner; the card rises, its allocation bar fills class by class, the rows and the deadline strip follow.
- `prefers-reduced-motion` jumps the sequence to its end. `@theatre/studio` is a dev dependency loaded only when the dev URL has `?studio`; it is never bundled (AGPL, and ~1 MB).
- Cost: `@theatre/core` adds about 140 kB minified (40 kB gzipped) to the single JS chunk.
