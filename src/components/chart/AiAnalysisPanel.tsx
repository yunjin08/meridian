import { useAnalysis } from '@/hooks/useAnalysis'
import { useNavigationStore } from '@/store/navigationStore'
import { useChartStore } from '@/store/chartStore'
import { formatPrice, formatTimestamp } from '@/lib/formatters'
import type { AnalysisResult, Trend } from '@/types/analysis'

const TREND_STYLE: Record<Trend, { label: string; className: string }> = {
  bullish: { label: 'Bullish', className: 'text-bull-green border-bull-green/40 bg-bull-green/10' },
  bearish: { label: 'Bearish', className: 'text-bear-red border-bear-red/40 bg-bear-red/10' },
  neutral: { label: 'Neutral', className: 'text-text-muted border-panel-border bg-terminal-bg' },
}

function Result({ analysis }: { analysis: AnalysisResult }) {
  const trend = TREND_STYLE[analysis.trend]
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`px-2 py-0.5 rounded border text-xs font-medium ${trend.className}`}>
          {trend.label}
        </span>
        <span className="text-xs text-text-muted font-mono">
          momentum: <span className="text-text-primary">{analysis.momentum}</span>
        </span>
        <span className="text-xs text-text-muted font-mono">
          confidence: <span className="text-text-primary">{analysis.confidence}</span>
        </span>
      </div>

      <p className="text-sm text-text-primary leading-relaxed">{analysis.summary}</p>

      {analysis.signals.length > 0 && (
        <ul className="flex flex-col gap-1">
          {analysis.signals.map((s, i) => (
            <li key={i} className="text-xs text-text-muted flex gap-2">
              <span className="text-btc-orange shrink-0">›</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-6 text-xs font-mono pt-1 border-t border-panel-border">
        <div className="pt-2">
          <span className="text-text-muted/60">Support</span>{' '}
          <span className="text-bull-green">
            {analysis.support != null ? formatPrice(analysis.support) : 'N/A'}
          </span>
        </div>
        <div className="pt-2">
          <span className="text-text-muted/60">Resistance</span>{' '}
          <span className="text-bear-red">
            {analysis.resistance != null ? formatPrice(analysis.resistance) : 'N/A'}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-text-muted/50 italic">
        AI-generated from indicator data. Not financial advice.
      </p>
    </div>
  )
}

export function AiAnalysisPanel() {
  const { result, isLoading, error, analyze } = useAnalysis()
  const activeSymbol = useNavigationStore((s) => s.activeSymbol)
  const timeframe = useChartStore((s) => s.activeInterval)

  return (
    <div className="bg-panel-bg border border-panel-border rounded-lg p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-btc-orange text-sm">✦</span>
          <span className="text-text-primary text-xs font-medium tracking-wide">AI Chart Analysis</span>
          {result != null && (
            <span className="text-text-muted/60 text-[10px] font-mono">
              {result.model} · {formatTimestamp(result.generatedAt)}
            </span>
          )}
        </div>
        <button
          onClick={() => void analyze()}
          disabled={isLoading}
          className="text-xs font-mono px-3 py-1.5 rounded border border-btc-orange/50 text-btc-orange hover:bg-btc-orange/10 disabled:opacity-40 transition-colors"
        >
          {isLoading ? 'analyzing…' : result != null ? 'Re-analyze' : `Analyze ${activeSymbol} ${timeframe}`}
        </button>
      </div>

      <div className="mt-3">
        {error != null && <p className="text-bear-red text-xs">{error}</p>}

        {error == null && isLoading && (
          <p className="text-text-muted text-xs animate-pulse">
            Reading {activeSymbol} {timeframe} chart and indicators…
          </p>
        )}

        {error == null && !isLoading && result == null && (
          <p className="text-text-muted text-xs">
            Get a plain-English read of the current chart, grounded in live price action, RSI, MACD and Bollinger Bands.
          </p>
        )}

        {error == null && !isLoading && result != null && <Result analysis={result.analysis} />}
      </div>
    </div>
  )
}
