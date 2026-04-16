import { usePriceStore } from '@/store/priceStore'
import { useNavigationStore } from '@/store/navigationStore'
import { formatPrice, formatPercent } from '@/lib/formatters'
import type { CryptoHolding } from '@/types/portfolio'

interface CryptoHoldingRowProps {
  holding: CryptoHolding
}

export function CryptoHoldingRow({ holding }: CryptoHoldingRowProps) {
  const priceData = usePriceStore((s) => s.prices[holding.symbol])
  const activeSymbol = useNavigationStore((s) => s.activeSymbol)
  const setActiveSymbol = useNavigationStore((s) => s.setActiveSymbol)

  const isActive = activeSymbol === holding.symbol
  const livePrice = priceData?.price ?? null
  const usdtValue = livePrice !== null ? holding.free * livePrice : holding.usdtValue
  const isPositive = (priceData?.changePercent ?? 0) >= 0
  const isChartable = holding.symbol !== 'USDT'

  return (
    <button
      disabled={!isChartable}
      onClick={() => { if (isChartable) setActiveSymbol(holding.symbol) }}
      className={[
        'w-full flex items-center justify-between px-3 py-2 rounded text-xs transition-colors text-left',
        isActive
          ? 'bg-btc-orange/10 border border-btc-orange/30'
          : 'bg-terminal-bg border border-transparent hover:border-panel-border',
        !isChartable ? 'cursor-default opacity-70' : 'cursor-pointer',
      ].join(' ')}
    >
      <div className="flex flex-col min-w-0">
        <span className="font-mono font-semibold text-text-primary">{holding.asset}</span>
        <span className="font-mono text-text-muted text-[10px]">
          {holding.free.toFixed(holding.asset === 'BTC' ? 8 : 4)} free
        </span>
      </div>

      <div className="flex flex-col items-end ml-2 shrink-0">
        {livePrice !== null ? (
          <span className="font-mono text-text-primary">{formatPrice(livePrice)}</span>
        ) : (
          <span className="font-mono text-text-muted">—</span>
        )}
        {priceData !== undefined && (
          <span className={`font-mono text-[10px] ${isPositive ? 'text-bull-green' : 'text-bear-red'}`}>
            {formatPercent(priceData.changePercent)}
          </span>
        )}
        {usdtValue !== null && (
          <span className="font-mono text-[10px] text-text-muted">
            ≈ {formatPrice(usdtValue)}
          </span>
        )}
      </div>
    </button>
  )
}
