import { useMemo, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { SkeletonBlock } from '@/components/ui/SkeletonBlock'
import { formatIsoDate, formatMoney, formatPercent } from '@/lib/formatters'
import { bandPath, buildScales, linePath, type ChartBox } from '@/lib/chartGeometry'
import { bandSegments } from '@/lib/portfolioHistory'
import type { PortfolioHistory } from '@/types/pnl'

// Hand-drawn SVG rather than the charting library used for candles: the point of
// this chart is the shaded gap between two lines, coloured by which one is on top,
// which a candlestick library does not express.
const BOX: ChartBox = { width: 720, height: 200, padLeft: 8, padRight: 8, padTop: 12, padBottom: 18 }

interface PortfolioHistoryChartProps {
  history: PortfolioHistory
  isLoading: boolean
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px]">
      <span className="flex items-center gap-1.5 text-text-muted">
        <span className="h-px w-4 border-t-2 border-dashed border-text-muted" />
        Spent
      </span>
      <span className="flex items-center gap-1.5 text-text-muted">
        <span className="h-0.5 w-4 rounded bg-btc-orange" />
        Value
      </span>
    </div>
  )
}

export function PortfolioHistoryChart({ history, isLoading }: PortfolioHistoryChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const { points } = history

  const chart = useMemo(() => {
    if (points.length < 2) return null
    const maxValue = points.reduce((max, p) => Math.max(max, p.spent, p.value), 0)
    const scales = buildScales(BOX, points.length, maxValue)
    return {
      scales,
      maxValue,
      spentPath: linePath(points.map((p) => p.spent), scales),
      valuePath: linePath(points.map((p) => p.value), scales),
      bands: bandSegments(points).map((segment) => ({
        key: `${segment.above ? 'up' : 'down'}-${segment.points[0]?.i ?? 0}`,
        above: segment.above,
        d: bandPath(segment.points, scales),
      })),
    }
  }, [points])

  if (isLoading && points.length === 0) {
    return (
      <section className="bg-panel-bg border border-panel-border rounded-lg p-4">
        <div className="text-[11px] uppercase tracking-widest text-text-muted font-mono">Since you started</div>
        <SkeletonBlock className="mt-3 h-[200px] w-full" />
      </section>
    )
  }

  if (chart === null) {
    return (
      <section className="bg-panel-bg border border-panel-border rounded-lg p-4">
        <div className="text-[11px] uppercase tracking-widest text-text-muted font-mono">Since you started</div>
        <p className="mt-2 text-[11px] text-text-muted">
          Not enough history yet. The curve appears once Binance has at least two days of trades to reprice.
        </p>
      </section>
    )
  }

  const firstPoint = points[0]
  const lastPoint = points[points.length - 1]
  const hovered = hoverIndex === null ? null : points[hoverIndex] ?? null
  const shown = hovered ?? lastPoint
  const net = shown === undefined ? 0 : shown.value - shown.spent
  const netPercent = shown !== undefined && shown.spent > 0 ? (net / shown.spent) * 100 : null

  function onMove(e: ReactMouseEvent<SVGSVGElement>): void {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0) return
    const ratio = (e.clientX - rect.left) / rect.width
    const i = Math.round(ratio * (points.length - 1))
    setHoverIndex(Math.min(Math.max(i, 0), points.length - 1))
  }

  return (
    <section className="bg-panel-bg border border-panel-border rounded-lg p-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="text-[11px] uppercase tracking-widest text-text-muted font-mono">Since you started</span>
        <Legend />
        <span className="ml-auto font-mono text-[11px] text-text-muted">
          {history.daysAboveWater === 0
            ? 'Never above what you put in'
            : `Above water ${history.daysAboveWater} of ${points.length} days`}
          {history.lastCrossedOn !== null && ` · last crossed ${formatIsoDate(history.lastCrossedOn)}`}
        </span>
      </div>

      {shown !== undefined && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-xs">
          <span className="text-text-muted">{formatIsoDate(shown.date)}</span>
          <span className="text-text-muted">spent <span className="text-text-primary">{formatMoney(shown.spent, 'USD')}</span></span>
          <span className="text-text-muted">value <span className="text-text-primary">{formatMoney(shown.value, 'USD')}</span></span>
          <span className={net >= 0 ? 'text-bull-green' : 'text-bear-red'}>
            {net >= 0 ? '+' : ''}{formatMoney(net, 'USD')}
            {netPercent !== null && <span className="ml-1.5 text-[11px]">{formatPercent(netPercent)}</span>}
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${BOX.width} ${BOX.height}`}
        className="mt-2 w-full"
        style={{ height: BOX.height }}
        preserveAspectRatio="none"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIndex(null)}
        role="img"
        aria-label="Money put into crypto compared with its value, day by day"
      >
        {chart.bands.map((band) => (
          <path
            key={band.key}
            d={band.d}
            fill={band.above ? '#26a69a' : '#ef5350'}
            fillOpacity={0.16}
          />
        ))}
        <path d={chart.spentPath} fill="none" stroke="#8b949e" strokeWidth={1.25} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
        <path d={chart.valuePath} fill="none" stroke="#F7931A" strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
        {hoverIndex !== null && (
          <line
            x1={chart.scales.x(hoverIndex)}
            x2={chart.scales.x(hoverIndex)}
            y1={BOX.padTop}
            y2={BOX.height - BOX.padBottom}
            stroke="#8b949e"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      <div className="flex justify-between font-mono text-[10px] text-text-muted">
        <span>{firstPoint === undefined ? '' : formatIsoDate(firstPoint.date)}</span>
        <span>{lastPoint === undefined ? '' : formatIsoDate(lastPoint.date)}</span>
      </div>
    </section>
  )
}
