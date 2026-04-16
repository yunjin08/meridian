import { useNavigationStore } from '@/store/navigationStore'
import { useCryptoHoldingsStore } from '@/store/cryptoHoldingsStore'
import { usePortfolioStore } from '@/store/portfolioStore'
import type { DashboardTab } from '@/store/navigationStore'

interface AssetSelectorProps {
  tab: DashboardTab
}

export function AssetSelector({ tab }: AssetSelectorProps) {
  const activeSymbol = useNavigationStore((s) => s.activeSymbol)
  const setActiveSymbol = useNavigationStore((s) => s.setActiveSymbol)
  const cryptoHoldings = useCryptoHoldingsStore((s) => s.holdings)
  const stocks = usePortfolioStore((s) => s.stocks)

  let options: string[] = []

  if (tab === 'crypto') {
    options = cryptoHoldings
      .filter((h) => h.symbol !== 'USDT')
      .map((h) => h.symbol)
  } else if (tab === 'stocks') {
    options = stocks.filter((h) => h.assetClass === 'stock').map((h) => h.ticker)
  } else if (tab === 'reits') {
    options = stocks.filter((h) => h.assetClass === 'reit').map((h) => h.ticker)
  }

  if (options.length === 0) return null

  return (
    <select
      value={activeSymbol}
      onChange={(e) => setActiveSymbol(e.target.value)}
      className="bg-terminal-bg border border-panel-border rounded px-2 py-1 text-xs font-mono text-text-primary focus:outline-none focus:border-btc-orange/60"
    >
      {options.map((sym) => (
        <option key={sym} value={sym}>
          {sym}
        </option>
      ))}
    </select>
  )
}
