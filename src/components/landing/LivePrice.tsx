import { useEffect, useRef, useState } from 'react'
import { usePriceStore } from '@/store/priceStore'
import { DEFAULT_CRYPTO_SYMBOL } from '@/constants'
import { formatPrice, formatPercent } from '@/lib/formatters'

const FLASH_MS = 500

export function LivePrice() {
  const quote = usePriceStore((s) => s.prices[DEFAULT_CRYPTO_SYMBOL])
  const price = quote?.price ?? null

  const previousPriceRef = useRef<number | null>(null)
  const [flash, setFlash] = useState<{ direction: 'up' | 'down'; key: number } | null>(null)

  useEffect(() => {
    const previous = previousPriceRef.current
    previousPriceRef.current = price
    if (price === null || previous === null || price === previous) return

    setFlash((current) => ({ direction: price > previous ? 'up' : 'down', key: (current?.key ?? 0) + 1 }))
    const timer = setTimeout(() => setFlash(null), FLASH_MS)
    return () => clearTimeout(timer)
  }, [price])

  const changeUp = (quote?.changePercent ?? 0) >= 0

  return (
    <div className="rounded-lg border border-panel-border bg-panel-bg p-5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-sm font-semibold text-text-primary">BTC / USDT</span>
        <span className="text-xs text-text-muted">Binance spot</span>
      </div>

      {quote === undefined ? (
        <div className="mt-4 space-y-3" aria-label="Waiting for the first price tick">
          <div className="h-10 w-52 animate-pulse rounded bg-panel-border/60" />
          <div className="h-4 w-32 animate-pulse rounded bg-panel-border/40" />
        </div>
      ) : (
        <>
          <div
            key={flash?.key ?? 0}
            className={[
              'mt-3 font-mono text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl',
              flash?.direction === 'up' ? 'landing-flash-up' : '',
              flash?.direction === 'down' ? 'landing-flash-down' : '',
            ].join(' ')}
          >
            {formatPrice(quote.price)}
          </div>
          <div className={`mt-2 font-mono text-sm ${changeUp ? 'text-bull-green' : 'text-bear-red'}`}>
            {formatPercent(quote.changePercent)} <span className="text-text-muted">24h</span>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-panel-border pt-4 font-mono text-xs">
            <div>
              <dt className="text-text-muted">24h high</dt>
              <dd className="mt-1 text-text-primary">{formatPrice(quote.high24h)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">24h low</dt>
              <dd className="mt-1 text-text-primary">{formatPrice(quote.low24h)}</dd>
            </div>
          </dl>
        </>
      )}
    </div>
  )
}
