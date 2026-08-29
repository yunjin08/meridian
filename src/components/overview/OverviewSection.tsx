import { AllocationBar } from '@/components/overview/AllocationBar'
import { AssetClassCard } from '@/components/overview/AssetClassCard'
import { PortfolioHero } from '@/components/overview/PortfolioHero'
import { TopHoldingsList } from '@/components/overview/TopHoldingsList'
import { TaxDeadlineBanner } from '@/components/tax/TaxDeadlineBanner'
import { usePortfolioSummary } from '@/hooks/usePortfolioSummary'
import { formatMoney } from '@/lib/formatters'
import { useBalanceStore } from '@/store/balanceStore'
import { useStockPositionsStore } from '@/store/stockPositionsStore'
import { useStockQuoteStore } from '@/store/stockQuoteStore'

export function OverviewSection() {
  const summary = usePortfolioSummary()
  const balanceLoading = useBalanceStore((s) => s.isLoading)
  const balanceError = useBalanceStore((s) => s.error)
  const quotesLoading = useStockQuoteStore((s) => s.isLoading)
  const quotesError = useStockQuoteStore((s) => s.error)
  const positionsLoading = useStockPositionsStore((s) => s.isLoading)
  const positionsError = useStockPositionsStore((s) => s.error)
  const account = useStockPositionsStore((s) => s.account)

  const equitiesLoading = quotesLoading || positionsLoading
  const isLoading = balanceLoading || equitiesLoading
  const error = balanceError ?? positionsError ?? quotesError

  let tradingDetail: string | undefined
  if (account !== null) {
    const sign = account.unrealizedPnl >= 0 ? '+' : ''
    tradingDetail = `Trading 212 · cash ${formatMoney(account.cashAvailable, account.currency)} · ${sign}${formatMoney(account.unrealizedPnl, account.currency)} unrealized`
  }

  return (
    <div className="p-3 md:p-4 flex flex-col gap-3 max-w-6xl w-full mx-auto">
      <TaxDeadlineBanner />
      <PortfolioHero summary={summary} isLoading={isLoading} error={error} />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <AssetClassCard label="Crypto" tab="crypto" summary={summary.classes.crypto} total={summary.total} accentClass="bg-btc-orange" isLoading={balanceLoading} />
        <AssetClassCard label="Stocks" tab="stocks" summary={summary.classes.stock}  total={summary.total} accentClass="bg-bull-green" isLoading={equitiesLoading} {...(tradingDetail === undefined ? {} : { detail: tradingDetail })} />
        <AssetClassCard label="REITs"  tab="reits"  summary={summary.classes.reit}   total={summary.total} accentClass="bg-blue-400"  isLoading={equitiesLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="lg:col-span-2"><AllocationBar summary={summary} /></div>
        <div className="lg:col-span-3"><TopHoldingsList holdings={summary.topHoldings} total={summary.total} /></div>
      </div>
    </div>
  )
}
