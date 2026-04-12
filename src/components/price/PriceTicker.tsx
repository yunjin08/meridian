import { usePriceStore } from '@/store/priceStore'
import { formatPrice, formatPercent } from '@/lib/formatters'
import { STALE_THRESHOLD_MS } from '@/constants'
import { useEffect, useState } from 'react'

export function PriceTicker() {
  const price = usePriceStore((s) => s.price)
  const changePercent = usePriceStore((s) => s.changePercent)
  const high24h = usePriceStore((s) => s.high24h)
  const low24h = usePriceStore((s) => s.low24h)
  const lastTickAt = usePriceStore((s) => s.lastTickAt)
  const connectionStatus = usePriceStore((s) => s.connectionStatus)

  const [isStale, setIsStale] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      if (lastTickAt !== null) {
        setIsStale(Date.now() - lastTickAt > STALE_THRESHOLD_MS)
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [lastTickAt])

  const isPositive = (changePercent ?? 0) >= 0

  return (
    <div className="bg-panel-bg border border-panel-border rounded-lg p-4 flex items-center gap-6">
      <div>
        <div className="text-xs text-text-muted mb-1 font-mono">BTC/USDT</div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-mono font-bold text-text-primary">
            {price !== null ? formatPrice(price) : '—'}
          </span>
          {isStale && (
            <span className="text-xs text-yellow-400 border border-yellow-400/30 rounded px-1 py-0.5">
              STALE
            </span>
          )}
          {connectionStatus === 'failed' && (
            <span className="text-xs text-bear-red border border-bear-red/30 rounded px-1 py-0.5">
              OFFLINE
            </span>
          )}
        </div>
      </div>

      {changePercent !== null && (
        <div className={`text-lg font-mono font-semibold ${isPositive ? 'text-bull-green' : 'text-bear-red'}`}>
          {formatPercent(changePercent)}
        </div>
      )}

      <div className="hidden sm:flex gap-4 text-xs text-text-muted font-mono ml-auto">
        {high24h !== null && (
          <div>
            <div className="text-text-muted/60 mb-0.5">24h High</div>
            <div className="text-bull-green">{formatPrice(high24h)}</div>
          </div>
        )}
        {low24h !== null && (
          <div>
            <div className="text-text-muted/60 mb-0.5">24h Low</div>
            <div className="text-bear-red">{formatPrice(low24h)}</div>
          </div>
        )}
      </div>
    </div>
  )
}
