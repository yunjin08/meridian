import { useRef } from 'react'
import { LANDING_REPO_URL } from '@/constants'
import { useHeroTimeline } from '@/hooks/useHeroTimeline'
import { OverviewPreview } from './OverviewPreview'
import { HeroScene } from './HeroScene'

export function HeroSection() {
  const sectionRef = useRef<HTMLElement>(null)
  useHeroTimeline(sectionRef)

  return (
    <section ref={sectionRef} className="relative overflow-hidden">
      <div className="landing-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        className="pointer-events-none absolute left-1/2 top-[-260px] h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-btc-orange/[0.07] blur-3xl"
        aria-hidden="true"
      />
      <div className="relative mx-auto max-w-[1120px] px-4 pb-6 pt-14 sm:px-6 md:pb-8 md:pt-20">
        <div className="relative z-10 grid grid-cols-1 items-center gap-10 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <h1
              data-anim="headline"
              className="hero-anim text-4xl font-semibold leading-[1.02] tracking-tighter text-text-primary md:text-5xl lg:text-6xl"
            >
              One place for every investment.
            </h1>
            <p
              data-anim="subtext"
              className="hero-anim mt-6 max-w-[58ch] text-base leading-relaxed text-text-muted md:text-lg"
            >
              Crypto, stocks and REITs together: what went in, what it is worth now, what it has
              earned, and what tax is due.
            </p>
            <div data-anim="ctas" className="hero-anim mt-8 flex flex-wrap gap-3">
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

          <div className="lg:col-span-5">
            <OverviewPreview />
          </div>
        </div>

        <div className="-mt-8 lg:-mt-10">
          <HeroScene />
        </div>
      </div>
    </section>
  )
}
