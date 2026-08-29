import { LANDING_REPO_URL } from '@/constants'
import { LivePrice } from './LivePrice'
import { ChartFrame } from './ChartFrame'
import { stagger } from './stagger'

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="landing-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        className="pointer-events-none absolute left-1/2 top-[-260px] h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-btc-orange/[0.07] blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-[1120px] px-4 pb-16 pt-14 sm:px-6 md:pb-24 md:pt-20">
        <div className="grid grid-cols-1 items-end gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <h1
              className="landing-rise text-4xl font-semibold leading-[1.02] tracking-tighter text-text-primary md:text-5xl lg:text-6xl"
              style={stagger(0)}
            >
              A personal trading desk, built from the APIs up.
            </h1>
            <p
              className="landing-rise mt-6 max-w-[58ch] text-base leading-relaxed text-text-muted md:text-lg"
              style={stagger(1)}
            >
              Live Binance streams, Trading 212 positions, server-side indicators, and a Claude
              assistant that manages alerts. One owner, read-only keys.
            </p>
            <div className="landing-rise mt-8 flex flex-wrap gap-3" style={stagger(2)}>
              <a
                href={LANDING_REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-md bg-btc-orange px-4 py-2 font-mono text-sm font-semibold text-terminal-bg transition-colors hover:bg-[#ffa63a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btc-orange active:translate-y-px"
              >
                View source
              </a>
              <a
                href="#architecture"
                className="inline-flex items-center rounded-md border border-panel-border px-4 py-2 font-mono text-sm text-text-primary transition-colors hover:border-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-btc-orange active:translate-y-px"
              >
                How it works
              </a>
            </div>
          </div>

          <div className="landing-rise lg:col-span-5" style={stagger(3)}>
            <LivePrice />
          </div>
        </div>

        <div className="landing-rise mt-12 md:mt-16" style={stagger(4)}>
          <ChartFrame />
        </div>
      </div>
    </section>
  )
}
