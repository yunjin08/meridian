import { CryptoHoldingsList } from '@/components/crypto/CryptoHoldingsList'
import { AlertList } from '@/components/alerts/AlertList'
import { TimeframeSelector } from '@/components/chart/TimeframeSelector'
import { ChartContainer } from '@/components/chart/ChartContainer'
import { IndicatorPanel } from '@/components/chart/IndicatorPanel'
import { AssetSelector } from '@/components/chart/AssetSelector'
import { useNavigationStore } from '@/store/navigationStore'
import { usePriceStore } from '@/store/priceStore'
import { formatPrice, formatPercent } from '@/lib/formatters'
import { useChartStore } from '@/store/chartStore'

function ActiveSymbolHeader() {
  const activeSymbol = useNavigationStore((s) => s.activeSymbol)
  const priceData = usePriceStore((s) => s.prices[activeSymbol])
  const isLoading = useChartStore((s) => s.isLoading)
  const isPositive = (priceData?.changePercent ?? 0) >= 0

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <AssetSelector tab="crypto" />
      <TimeframeSelector />
      {priceData !== undefined && (
        <div className="flex items-baseline gap-2 ml-auto">
          <span className="font-mono font-bold text-text-primary">
            {formatPrice(priceData.price)}
          </span>
          <span className={`font-mono text-xs ${isPositive ? 'text-bull-green' : 'text-bear-red'}`}>
            {formatPercent(priceData.changePercent)}
          </span>
        </div>
      )}
      {isLoading && <span className="text-xs text-text-muted animate-pulse">loading…</span>}
    </div>
  )
}

export function CryptoSection() {
  return (
    <div className="flex flex-col lg:flex-row gap-3 p-3 h-full">
      {/* Left panel: holdings + alerts */}
      <div className="lg:w-56 xl:w-64 flex-shrink-0 flex flex-col gap-3">
        <div className="bg-panel-bg border border-panel-border rounded-lg p-3">
          <CryptoHoldingsList />
        </div>
        <div className="bg-panel-bg border border-panel-border rounded-lg p-3 flex-1 min-h-0">
          <AlertList />
        </div>
      </div>

      {/* Right panel: chart */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="bg-panel-bg border border-panel-border rounded-lg p-3">
          <ActiveSymbolHeader />
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
