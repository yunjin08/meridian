import { useReveal } from '@/hooks/useReveal'
import { Chip } from './Chip'
import { stagger } from './stagger'

const ENDPOINTS = [
  '/api/candles',
  '/api/ticker',
  '/api/balance',
  '/api/trades',
  '/api/stock-positions',
  '/api/stock-quotes',
  '/api/stock-candles',
  '/api/chat',
  '/api/login',
  '/api/session',
]

const PROVIDERS: { name: string; detail: string }[] = [
  { name: 'Binance', detail: 'REST, HMAC-SHA256 signed' },
  { name: 'Trading 212', detail: 'Basic auth, read scopes only' },
  { name: 'Finnhub', detail: 'Stock and REIT quotes' },
  { name: 'Anthropic', detail: 'Claude with tool use' },
  { name: 'Supabase', detail: 'Tax records, service role key' },
]

const GUARANTEES: { lead: string; body: string }[] = [
  {
    lead: 'Keys stay on the server.',
    body: 'API keys and the session secret live in Netlify environment variables and are read only inside functions. The browser bundle never sees one.',
  },
  {
    lead: 'Every private call is signed there.',
    body: 'Binance requests are HMAC-SHA256 signed inside a function. Trading 212 uses Basic auth with read scopes only.',
  },
  {
    lead: 'One owner, one passphrase.',
    body: 'Login checks an scrypt hash and sets an HMAC-signed, HttpOnly, SameSite=Strict session cookie.',
  },
]

function Column({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <div className="landing-reveal flex w-full flex-col rounded-lg border border-panel-border bg-panel-bg p-5" style={stagger(index)}>
      <h3 className="font-mono text-sm font-semibold text-text-primary">{title}</h3>
      <div className="mt-4 flex-1">{children}</div>
    </div>
  )
}

function Connector({ index }: { index: number }) {
  return (
    <div className="landing-reveal hidden w-14 items-center lg:flex" style={stagger(index)} aria-hidden="true">
      <div className="landing-flow w-full" />
    </div>
  )
}

export function ArchitectureSection() {
  const ref = useReveal<HTMLElement>()

  return (
    <section id="architecture" ref={ref} className="border-t border-panel-border">
      <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 md:py-24">
        <h2 className="landing-reveal text-3xl font-semibold tracking-tight text-text-primary md:text-4xl" style={stagger(0)}>
          How it is wired
        </h2>
        <p className="landing-reveal mt-4 max-w-[60ch] text-base leading-relaxed text-text-muted" style={stagger(1)}>
          Public market data streams straight into the browser. Anything that touches an account goes
          through a Netlify Function.
        </p>

        <div className="mt-10 flex flex-col gap-4 lg:flex-row lg:items-stretch">
          <div className="flex lg:flex-1">
            <Column index={2} title="Browser">
              <ul className="space-y-2 text-sm text-text-muted">
                <li>React 19 with Zustand stores per domain</li>
                <li>TradingView Lightweight Charts</li>
                <li>Alert evaluator on every tick, Notification API</li>
              </ul>
              <div className="mt-5 rounded-md border border-btc-orange/30 bg-btc-orange/[0.06] p-3 text-xs leading-relaxed text-text-muted">
                <span className="font-mono text-btc-orange">wss://stream.binance.com</span> connects here
                directly. Public streams need no auth and no server hop.
              </div>
            </Column>
          </div>

          <Connector index={3} />

          <div className="flex lg:flex-1">
            <Column index={4} title="Netlify Functions">
              <div className="flex flex-wrap gap-1.5">
                {ENDPOINTS.map((endpoint) => (
                  <Chip key={endpoint}>{endpoint}</Chip>
                ))}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-text-muted">
                Klines and indicators come back from one call. Every other endpoint checks the session
                cookie before it touches a provider.
              </p>
            </Column>
          </div>

          <Connector index={5} />

          <div className="flex lg:flex-1">
            <Column index={6} title="Providers">
              <ul className="divide-y divide-panel-border/70">
                {PROVIDERS.map((provider) => (
                  <li key={provider.name} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="text-sm text-text-primary">{provider.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-text-muted">{provider.detail}</div>
                  </li>
                ))}
              </ul>
            </Column>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 border-t border-panel-border pt-8 md:grid-cols-3">
          {GUARANTEES.map((item, i) => (
            <div key={item.lead} className="landing-reveal" style={stagger(7 + i)}>
              <p className="text-sm font-semibold text-text-primary">{item.lead}</p>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
