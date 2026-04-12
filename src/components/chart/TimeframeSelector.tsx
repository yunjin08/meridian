import { useChartStore } from '@/store/chartStore'
import { TIMEFRAMES, type Timeframe } from '@/constants'

export function TimeframeSelector() {
  const activeInterval = useChartStore((s) => s.activeInterval)
  const setActiveInterval = useChartStore((s) => s.setActiveInterval)

  return (
    <div className="flex gap-1">
      {TIMEFRAMES.map((tf: Timeframe) => (
        <button
          key={tf}
          onClick={() => setActiveInterval(tf)}
          className={[
            'px-3 py-1 text-xs font-mono rounded border transition-colors',
            activeInterval === tf
              ? 'bg-btc-orange text-terminal-bg border-btc-orange font-bold'
              : 'bg-panel-bg text-text-muted border-panel-border hover:border-btc-orange/50 hover:text-text-primary',
          ].join(' ')}
        >
          {tf}
        </button>
      ))}
    </div>
  )
}
