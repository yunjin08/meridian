import { useEffect, useMemo, useState } from 'react'
import { useNavigationStore } from '@/store/navigationStore'
import { useCryptoHoldingsStore } from '@/store/cryptoHoldingsStore'
import { usePriceStore } from '@/store/priceStore'
import { API_BASE } from '@/constants'
import { formatPrice } from '@/lib/formatters'
import type { CryptoTrade, TradesResponse } from '@/types/trade'

async function fetchTrades(symbol: string): Promise<TradesResponse> {
  const res = await fetch(`${API_BASE}/trades?symbol=${encodeURIComponent(symbol)}&limit=200`)
  if (!res.ok) {
    const body = await res.json() as { error?: string }
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<TradesResponse>
}

function SummaryRow({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex justify-between text-[10px] font-mono">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-primary">{value}</span>
    </div>
  )
}

export function CryptoTradeDetails() {
  const activeSymbol = useNavigationStore((s) => s.activeSymbol)
  const holdings = useCryptoHoldingsStore((s) => s.holdings)
  const livePrice = usePriceStore((s) => s.prices[activeSymbol]?.price ?? null)

  const [trades, setTrades] = useState<CryptoTrade[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const asset = activeSymbol.endsWith('USDT') ? activeSymbol.replace('USDT', '') : activeSymbol
  const holding = holdings.find((h) => h.symbol === activeSymbol)
  let currentQty = 0
  if (holding !== undefined) {
    currentQty = holding.free + holding.locked
  }

  useEffect(() => {
    if (!activeSymbol.endsWith('USDT') || activeSymbol === 'USDT') {
      setTrades([])
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    fetchTrades(activeSymbol)
      .then((data) => {
        setTrades(data.trades)
        setError(null)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Failed to load trade history'
        setError(msg)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [activeSymbol])

  const summary = useMemo(() => {
    let boughtQty = 0
    let soldQty = 0
    let spentUsdt = 0
    let receivedUsdt = 0

    for (const t of trades) {
      if (t.side === 'BUY') {
        boughtQty += t.qty
        spentUsdt += t.quoteQty
      } else {
        soldQty += t.qty
        receivedUsdt += t.quoteQty
      }
    }

    const avgBuyPrice = boughtQty > 0 ? spentUsdt / boughtQty : 0
    const currentValue = livePrice === null ? null : currentQty * livePrice
    const netPnl = currentValue === null ? null : (currentValue + receivedUsdt) - spentUsdt

    return {
      boughtQty,
      soldQty,
      spentUsdt,
      receivedUsdt,
      avgBuyPrice,
      currentValue,
      netPnl,
    }
  }, [currentQty, livePrice, trades])
  let netResultText = '—'
  if (summary.netPnl !== null) {
    netResultText = `${summary.netPnl >= 0 ? '+' : ''}${formatPrice(summary.netPnl)}`
  }

  if (!activeSymbol.endsWith('USDT')) return null
  if (activeSymbol === 'USDT') return null

  return (
    <div className="mt-3 border-t border-panel-border pt-3">
      <div className="text-xs text-text-muted font-mono mb-2">{asset} Trade History</div>
      <div className="space-y-1 mb-3">
        <SummaryRow label="Current Qty" value={currentQty.toFixed(8)} />
        <SummaryRow label="Total Spent (Buys)" value={formatPrice(summary.spentUsdt)} />
        <SummaryRow label="Total Received (Sells)" value={formatPrice(summary.receivedUsdt)} />
        <SummaryRow label="Avg Buy Price" value={summary.avgBuyPrice > 0 ? formatPrice(summary.avgBuyPrice) : '—'} />
        <SummaryRow label="Current Value" value={summary.currentValue === null ? '—' : formatPrice(summary.currentValue)} />
        <SummaryRow
          label="Net Result"
          value={netResultText}
        />
      </div>

      {isLoading && <p className="text-[10px] text-text-muted animate-pulse">Loading {asset} trades…</p>}
      {error !== null && <p className="text-[10px] text-bear-red">{error}</p>}

      {!isLoading && error === null && trades.length === 0 && (
        <p className="text-[10px] text-text-muted">No {activeSymbol} trades found.</p>
      )}

      {!isLoading && error === null && trades.length > 0 && (
        <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
          {trades.map((t) => (
            <div key={t.id} className="bg-terminal-bg border border-panel-border rounded px-2 py-1">
              <div className="flex justify-between items-center text-[10px] font-mono">
                <span className={t.side === 'BUY' ? 'text-bull-green' : 'text-bear-red'}>{t.side}</span>
                <span className="text-text-muted">{new Date(t.time).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono mt-0.5">
                <span className="text-text-muted">Qty {t.qty.toFixed(8)}</span>
                <span className="text-text-primary">@ {formatPrice(t.price)}</span>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-text-muted">Total</span>
                <span className="text-text-primary">{formatPrice(t.quoteQty)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
