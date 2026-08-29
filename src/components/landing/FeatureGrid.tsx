import type { ReactNode } from 'react'
import { useReveal } from '@/hooks/useReveal'
import { usePriceStore } from '@/store/priceStore'
import { DEFAULT_CRYPTO_SYMBOL, OVERVIEW_TAX_IN_PROGRESS } from '@/constants'
import { formatPrice } from '@/lib/formatters'
import { Chip } from './Chip'
import { stagger } from './stagger'

const OVERVIEW_FIGURES = ['total value', '24h change', 'allocation by class', 'invested vs current', 'realized P&L', 'unrealized P&L', 'top holdings']
const TRADING212_SCOPES = ['account', 'portfolio', 'history', 'metadata']
const ALERT_CONDITIONS = ['price_above', 'price_below', 'price_crosses', 'rsi_above', 'rsi_below', 'macd_crossover', 'macd_crossunder']
const ASSISTANT_TOOLS = ['add_alert', 'remove_alert', 'toggle_alert', 'add_symbol', 'remove_symbol']

function InProgress() {
  if (!OVERVIEW_TAX_IN_PROGRESS) return null
  return (
    <span className="rounded-md border border-btc-orange/40 bg-btc-orange/10 px-2 py-0.5 font-mono text-[11px] text-btc-orange">
      in progress
    </span>
  )
}

function Cell({
  index,
  className,
  title,
  body,
  tag,
  children,
}: {
  index: number
  className: string
  title: string
  body: string
  tag?: ReactNode
  children?: ReactNode
}) {
  return (
    <article
      className={`landing-reveal flex flex-col rounded-lg border border-panel-border bg-panel-bg p-5 transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-text-muted ${className}`}
      style={stagger(index)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold text-text-primary">{title}</h3>
        {tag}
      </div>
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
        <span>BTC 24h range, live</span>
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
          title="The whole portfolio, one number"
          body="Crypto, stock and REIT positions are priced live and summed into one total, with the split across classes, what was put in against what it is worth, and the profit on each side."
          tag={<InProgress />}
        >
          <div className="flex flex-wrap gap-1.5">
            {OVERVIEW_FIGURES.map((item) => (
              <Chip key={item}>{item}</Chip>
            ))}
          </div>
        </Cell>

        <Cell
          index={2}
          className="lg:col-span-5"
          title="Tax, computed as income lands"
          body="Gross receipts are logged in pesos. The module applies the Philippine 8% flat rate with the annual exemption, tracks 1701Q and 1701A deadlines, and warns before each one."
          tag={<InProgress />}
        >
          <dl className="grid grid-cols-3 gap-4 font-mono">
            <div>
              <dt className="text-xs text-text-muted">Rate</dt>
              <dd className="mt-1 text-2xl font-semibold text-text-primary">8%</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Exemption</dt>
              <dd className="mt-1 text-2xl font-semibold text-text-primary">₱250k</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Notice</dt>
              <dd className="mt-1 text-2xl font-semibold text-text-primary">30d</dd>
            </div>
          </dl>
        </Cell>

        <Cell
          index={3}
          className="lg:col-span-5"
          title="Stocks and REITs from the broker"
          body="Trading 212 supplies positions, cost basis, cash and realized results through a key with read scopes only. Finnhub prices the watchlist."
        >
          <div className="flex flex-wrap gap-1.5">
            {TRADING212_SCOPES.map((scope) => (
              <Chip key={scope}>{scope}</Chip>
            ))}
          </div>
        </Cell>

        <Cell
          index={4}
          className="lg:col-span-7 bg-[radial-gradient(ellipse_at_bottom_right,rgba(38,166,154,0.10),transparent_60%)]"
          title="Crypto from the exchange"
          body="Binance holdings and trade history come through signed server calls, so total spent, total received and net result per asset are real, not estimated. Prices stream live from the public socket."
        >
          <DayRange />
        </Cell>

        <Cell
          index={5}
          className="lg:col-span-5"
          title="Alerts on any asset"
          body="Price, RSI and MACD conditions across crypto and stocks, evaluated on every tick and delivered as browser notifications."
        >
          <div className="flex flex-wrap gap-1.5">
            {ALERT_CONDITIONS.map((condition) => (
              <Chip key={condition}>{condition}</Chip>
            ))}
          </div>
        </Cell>

        <Cell
          index={6}
          className="lg:col-span-7"
          title="An assistant with the full picture"
          body="Claude receives the live portfolio, positions, indicators and alerts as context, answers in a sentence, and changes alerts or the watchlist through tools rather than instructions."
        >
          <div className="flex flex-wrap gap-1.5">
            {ASSISTANT_TOOLS.map((tool) => (
              <Chip key={tool}>{tool}</Chip>
            ))}
          </div>
        </Cell>
      </div>
    </section>
  )
}
