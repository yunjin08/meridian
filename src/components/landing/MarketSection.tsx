import { useReveal } from '@/hooks/useReveal'
import { LivePrice } from './LivePrice'
import { ChartFrame } from './ChartFrame'
import { stagger } from './stagger'

export function MarketSection() {
  const ref = useReveal<HTMLElement>()

  return (
    <section ref={ref} className="border-t border-panel-border">
      <div className="mx-auto max-w-[1120px] px-4 py-16 sm:px-6 md:py-24">
        <h2 className="landing-reveal text-3xl font-semibold tracking-tight text-text-primary md:text-4xl" style={stagger(0)}>
          Live market data
        </h2>
        <p className="landing-reveal mt-4 max-w-[60ch] text-base leading-relaxed text-text-muted" style={stagger(1)}>
          The one feed that is public. It streams from Binance into this page the same way it
          streams into the dashboard.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
          <div className="landing-reveal lg:col-span-4" style={stagger(2)}>
            <LivePrice />
          </div>
          <div className="landing-reveal lg:col-span-8" style={stagger(3)}>
            <ChartFrame />
          </div>
        </div>
      </div>
    </section>
  )
}
