import { useChartStore } from '@/store/chartStore'
import { ChartContainer } from '@/components/chart/ChartContainer'
import { TimeframeSelector } from '@/components/chart/TimeframeSelector'
import { IndicatorPanel } from '@/components/chart/IndicatorPanel'

export function ChartFrame() {
  const error = useChartStore((s) => s.error)
  const hasCandles = useChartStore((s) => s.candles.length > 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-sm font-semibold text-text-primary">BTCUSDT</span>
          <span className="text-xs text-text-muted">Live candles with RSI, MACD and Bollinger Bands</span>
        </div>
        <TimeframeSelector />
      </div>

      {error !== null && !hasCandles ? (
        <div className="flex h-[480px] items-center justify-center rounded-lg border border-panel-border bg-panel-bg font-mono text-sm text-text-muted">
          Live chart unavailable
        </div>
      ) : (
        <ChartContainer />
      )}

      <IndicatorPanel />
    </div>
  )
}
