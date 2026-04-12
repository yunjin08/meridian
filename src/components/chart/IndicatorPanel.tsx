import { useChartStore } from '@/store/chartStore'
import { lastValue, formatNumber } from '@/lib/formatters'

function RsiGauge({ value }: { value: number }) {
  const color =
    value < 30 ? 'text-bear-red' : value > 70 ? 'text-bull-green' : 'text-text-primary'
  const label = value < 30 ? 'Oversold' : value > 70 ? 'Overbought' : 'Neutral'
  return (
    <div>
      <div className="text-xs text-text-muted/60 mb-1">RSI (14)</div>
      <div className={`font-mono text-lg font-bold ${color}`}>{formatNumber(value, 1)}</div>
      <div className={`text-xs ${color}`}>{label}</div>
    </div>
  )
}

function MacdDisplay({
  macd,
  signal,
  histogram,
}: {
  macd: number
  signal: number
  histogram: number
}) {
  const bullish = histogram >= 0
  return (
    <div>
      <div className="text-xs text-text-muted/60 mb-1">MACD (12,26,9)</div>
      <div className={`font-mono text-sm font-bold ${bullish ? 'text-bull-green' : 'text-bear-red'}`}>
        {formatNumber(histogram, 2)}
      </div>
      <div className="text-xs text-text-muted font-mono">
        {formatNumber(macd, 2)} / {formatNumber(signal, 2)}
      </div>
    </div>
  )
}

function BbDisplay({ upper, middle, lower }: { upper: number; middle: number; lower: number }) {
  const width = upper - lower
  return (
    <div>
      <div className="text-xs text-text-muted/60 mb-1">BB (20,2)</div>
      <div className="font-mono text-xs text-text-muted space-y-0.5">
        <div>↑ {formatNumber(upper, 0)}</div>
        <div className="text-text-primary">— {formatNumber(middle, 0)}</div>
        <div>↓ {formatNumber(lower, 0)}</div>
      </div>
      <div className="text-xs text-text-muted/60 mt-0.5">Width: {formatNumber(width, 0)}</div>
    </div>
  )
}

export function IndicatorPanel() {
  const indicators = useChartStore((s) => s.indicators)

  if (indicators === null) {
    return (
      <div className="bg-panel-bg border border-panel-border rounded-lg p-3 text-text-muted text-xs font-mono">
        Indicators loading…
      </div>
    )
  }

  const rsi = lastValue(indicators.rsi)
  const macdLine = lastValue(indicators.macd.macdLine)
  const signalLine = lastValue(indicators.macd.signalLine)
  const histogram = lastValue(indicators.macd.histogram)
  const bbUpper = lastValue(indicators.bollingerBands.upper)
  const bbMiddle = lastValue(indicators.bollingerBands.middle)
  const bbLower = lastValue(indicators.bollingerBands.lower)

  return (
    <div className="bg-panel-bg border border-panel-border rounded-lg p-3">
      <div className="flex gap-8 flex-wrap">
        {rsi !== null && <RsiGauge value={rsi} />}
        {macdLine !== null && signalLine !== null && histogram !== null && (
          <MacdDisplay macd={macdLine} signal={signalLine} histogram={histogram} />
        )}
        {bbUpper !== null && bbMiddle !== null && bbLower !== null && (
          <BbDisplay upper={bbUpper} middle={bbMiddle} lower={bbLower} />
        )}
        {rsi === null && macdLine === null && bbUpper === null && (
          <span className="text-text-muted text-xs font-mono">No indicator data yet</span>
        )}
      </div>
    </div>
  )
}
