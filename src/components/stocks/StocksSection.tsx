import { StockList } from './StockList'
import { AlertList } from '@/components/alerts/AlertList'
import { TimeframeSelector } from '@/components/chart/TimeframeSelector'
import { ChartContainer } from '@/components/chart/ChartContainer'
import { IndicatorPanel } from '@/components/chart/IndicatorPanel'
import { AssetSelector } from '@/components/chart/AssetSelector'
import { useNavigationStore } from '@/store/navigationStore'
import { useStockQuoteStore } from '@/store/stockQuoteStore'
import { formatPrice, formatPercent } from '@/lib/formatters'
import { useChartStore } from '@/store/chartStore'
import type { DashboardTab } from '@/store/navigationStore'

interface StocksSectionProps {
  tab: DashboardTab  // 'stocks' or 'reits'
  filter: 'stock' | 'reit'
}

function StockChartHeader({ tab }: { tab: DashboardTab }) {
  const activeSymbol = useNavigationStore((s) => s.activeSymbol)
  const quote = useStockQuoteStore((s) => s.quotes[activeSymbol])
  const isLoading = useChartStore((s) => s.isLoading)
  const finnhubConfigured = !!import.meta.env['VITE_FINNHUB_CONFIGURED']
  const isPositive = (quote?.changePercent ?? 0) >= 0

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <AssetSelector tab={tab} />
      <TimeframeSelector />
      {quote !== undefined && (
        <div className="flex items-baseline gap-2 ml-auto">
          <span className="font-mono font-bold text-text-primary">{formatPrice(quote.price)}</span>
          <span className={`font-mono text-xs ${isPositive ? 'text-bull-green' : 'text-bear-red'}`}>
            {formatPercent(quote.changePercent)}
          </span>
        </div>
      )}
      {isLoading && <span className="text-xs text-text-muted animate-pulse">loading…</span>}
      {!finnhubConfigured && (
        <span className="text-xs text-text-muted/60 ml-auto">
          Add <code className="font-mono">FINNHUB_API_KEY</code> to enable charts
        </span>
      )}
    </div>
  )
}

export function StocksSection({ tab, filter }: StocksSectionProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-3 p-3 h-full">
      {/* Left panel */}
      <div className="lg:w-56 xl:w-64 flex-shrink-0 flex flex-col gap-3">
        <div className="bg-panel-bg border border-panel-border rounded-lg p-3">
          <StockList filter={filter} />
        </div>
        <div className="bg-panel-bg border border-panel-border rounded-lg p-3 flex-1 min-h-0">
          <AlertList />
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="bg-panel-bg border border-panel-border rounded-lg p-3">
          <StockChartHeader tab={tab} />
        </div>
        <div className="flex-1">
          <ChartContainer />
        </div>
        <div className="bg-panel-bg border border-panel-border rounded-lg p-3">
          <IndicatorPanel />
        </div>
      </div>
    </div>
  )
}
