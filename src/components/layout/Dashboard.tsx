import { PriceTicker } from '@/components/price/PriceTicker'
import { BalanceCard } from '@/components/balance/BalanceCard'
import { TimeframeSelector } from '@/components/chart/TimeframeSelector'
import { ChartContainer } from '@/components/chart/ChartContainer'
import { IndicatorPanel } from '@/components/chart/IndicatorPanel'
import { AlertForm } from '@/components/alerts/AlertForm'
import { AlertList } from '@/components/alerts/AlertList'

export function Dashboard() {
  return (
    <div className="flex flex-col gap-3 p-3 h-full">
      {/* Top strip: price + balance */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <PriceTicker />
        </div>
        <div>
          <BalanceCard />
        </div>
      </div>

      {/* Main: chart */}
      <div className="flex flex-col gap-2">
        <TimeframeSelector />
        <div className="relative">
          <ChartContainer />
        </div>
        <IndicatorPanel />
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <AlertForm />
        <AlertList />
      </div>
    </div>
  )
}
