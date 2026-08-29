import type { ReactNode } from 'react'
import { useReveal } from '@/hooks/useReveal'
import { usePriceStore } from '@/store/priceStore'
import { useChartStore } from '@/store/chartStore'
import { DEFAULT_CRYPTO_SYMBOL, OVERVIEW_TAX_IN_PROGRESS } from '@/constants'
import { formatNumber, formatPrice, lastValue } from '@/lib/formatters'
import { Chip } from './Chip'
import { stagger } from './stagger'

const ASSISTANT_TOOLS = ['add_alert', 'remove_alert', 'toggle_alert', 'add_symbol', 'remove_symbol']
const TRADING212_SCOPES = ['account', 'portfolio', 'history', 'metadata']
const ALERT_CONDITIONS = [
  'price_above',
  'price_below',
  'price_crosses',
  'rsi_above',
  'rsi_below',
  'macd_crossover',
  'macd_crossunder',
]

function Cell({
  index,
  className,
  title,
  body,
  children,
}: {
  index: number
  className: string
  title: string
  body: string
  children?: ReactNode
}) {
  return (
    <article
      className={`landing-reveal flex flex-col rounded-lg border border-panel-border bg-panel-bg p-5 transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-text-muted ${className}`}
      style={stagger(index)}
    >
      <h3 className="text-base font-semibold text-text-primary">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-text-muted">{body}</p>
      {children !== undefined && <div className="mt-auto pt-5">{children}</div>}
    </article>
  )
}

function DayRange() {
  const quote = usePriceStore((s) => s.prices[DEFAULT_CRYPTO_SYMBOL])
  if (quote === undefined) {
    return <div className="h-12 animate-pulse rounded bg-panel-border/40" />
  }
  const span = quote.high24h - quote.low24h
  const position = span > 0 ? Math.min(100, Math.max(0, ((quote.price - quote.low24h) / span) * 100)) : 50

  return (
    <div>
      <div className="flex justify-between font-mono text-xs text-text-muted">
        <span>{formatPrice(quote.low24h)}</span>
        <span>24h range, live</span>
        <span>{formatPrice(quote.high24h)}</span>
      </div>
      <div className="relative mt-2 h-px bg-panel-border">
        <span
          className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-btc-orange transition-[left] duration-500"
          style={{ left: `${position}%` }}
          aria-hidden="true"
        />
      </div>
    </div>
  )
}

function LiveRsi() {
  const indicators = useChartStore((s) => s.indicators)
  const rsi = indicators === null ? null : lastValue(indicators.rsi)
  if (rsi === null) {
    return <div className="h-12 w-24 animate-pulse rounded bg-panel-border/40" />
  }
  const tone = rsi > 70 ? 'text-bull-green' : rsi < 30 ? 'text-bear-red' : 'text-text-primary'
  const label = rsi > 70 ? 'overbought' : rsi < 30 ? 'oversold' : 'neutral'
  return (
    <div>
      <div className={`font-mono text-4xl font-semibold ${tone}`}>{formatNumber(rsi, 1)}</div>
      <div className="mt-1 font-mono text-xs text-text-muted">RSI 14, {label}, live</div>
    </div>
  )
}

export function FeatureGrid() {
  const ref = useReveal<HTMLElement>()

  return (
    <section ref={ref} className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 md:py-24">
      <h2 className="landing-reveal text-3xl font-semibold tracking-tight text-text-primary md:text-4xl" style={stagger(0)}>
        What it does
      </h2>

      <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Cell
          index={1}
          className="lg:col-span-7 bg-[radial-gradient(ellipse_at_top_left,rgba(247,147,26,0.10),transparent_60%)]"
          title="Crypto, streamed"
          body="Binance ticker and kline streams connect straight from the browser. Holdings and trade history arrive through HMAC-signed server calls, never from the client."
        >
          <DayRange />
        </Cell>

        <Cell
          index={2}
          className="lg:col-span-5"
          title="An assistant that acts"
          body="Claude reads the live dashboard context and calls tools instead of describing steps. Alerts and the watchlist change in place."
        >
          <div className="flex flex-wrap gap-1.5">
            {ASSISTANT_TOOLS.map((tool) => (
              <Chip key={tool}>{tool}</Chip>
            ))}
          </div>
        </Cell>

        <Cell
          index={3}
          className="lg:col-span-5"
          title="Stocks and REITs, read-only"
          body="Trading 212 positions and the account summary come through a key with read scopes only. Finnhub prices the watchlist."
        >
          <div className="flex flex-wrap gap-1.5">
            {TRADING212_SCOPES.map((scope) => (
              <Chip key={scope}>{scope}</Chip>
            ))}
          </div>
        </Cell>

        <Cell
          index={4}
          className="lg:col-span-3 bg-[radial-gradient(ellipse_at_bottom_right,rgba(38,166,154,0.10),transparent_60%)]"
          title="Indicators, server-side"
          body="RSI, MACD and Bollinger Bands are computed in the same function call that fetches the candles."
        >
          <LiveRsi />
        </Cell>

        <Cell
          index={5}
          className="lg:col-span-4"
          title="Alerts in the browser"
          body="Conditions are evaluated on every tick and delivered as notifications. Definitions persist locally."
        >
          <div className="flex flex-wrap gap-1.5">
            {ALERT_CONDITIONS.map((condition) => (
              <Chip key={condition}>{condition}</Chip>
            ))}
          </div>
        </Cell>

        <article
          className="landing-reveal grid grid-cols-1 gap-8 rounded-lg border border-panel-border bg-panel-bg p-5 transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-text-muted lg:col-span-12 lg:grid-cols-12 lg:items-center"
          style={stagger(6)}
        >
          <div className="lg:col-span-7">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-base font-semibold text-text-primary">Overview and PH tax</h3>
              {OVERVIEW_TAX_IN_PROGRESS && (
                <span className="rounded-md border border-btc-orange/40 bg-btc-orange/10 px-2 py-0.5 font-mono text-[11px] text-btc-orange">
                  in progress
                </span>
              )}
            </div>
            <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-text-muted">
              Cross-asset totals in one view, plus an income tax module for the Philippine 8% flat-rate
              option: quarterly and annual computation, BIR deadlines, and notices before each one.
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-4 font-mono lg:col-span-5">
            <div>
              <dt className="text-xs text-text-muted">Rate</dt>
              <dd className="mt-1 text-2xl font-semibold text-text-primary">8%</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Exemption</dt>
              <dd className="mt-1 text-2xl font-semibold text-text-primary">₱250k</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Forms</dt>
              <dd className="mt-1 text-2xl font-semibold text-text-primary">1701Q, 1701A</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  )
}
