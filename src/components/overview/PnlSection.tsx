import { SkeletonBlock } from '@/components/ui/SkeletonBlock'
import { formatMoney, formatPercent } from '@/lib/formatters'
import type { CryptoPnl, EquitiesPnl, EquityPositionPnl, PnlSummary } from '@/lib/pnlSummary'
import type { CryptoAssetPnl } from '@/types/pnl'

interface PnlSectionProps {
  pnl: PnlSummary
  isLoading: boolean
  error: string | null
}

function tone(value: number | null): string {
  if (value === null) return 'text-text-muted'
  return value >= 0 ? 'text-bull-green' : 'text-bear-red'
}

function signed(value: number, currency: string): string {
  return `${value >= 0 ? '+' : ''}${formatMoney(value, currency)}`
}

function Stat({ label, value, currency, percent }: { label: string; value: number; currency: string; percent?: number | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-muted font-mono">{label}</div>
      <div className={`font-mono text-lg font-semibold tabular-nums ${tone(value)}`}>
        {signed(value, currency)}
        {percent !== undefined && percent !== null && (
          <span className="ml-2 text-xs">{formatPercent(percent)}</span>
        )}
      </div>
    </div>
  )
}

function CryptoRow({ a }: { a: CryptoAssetPnl }) {
  const percent = a.netUsdt !== null && a.spentUsdt > 0 ? (a.netUsdt / a.spentUsdt) * 100 : null
  return (
    <li className="flex items-center gap-3 py-1.5 font-mono text-xs">
      <span className="font-semibold text-text-primary w-14">{a.asset}</span>
      <span className="text-text-muted hidden sm:inline">
        cost {formatMoney(a.spentUsdt, 'USD')}
        {a.receivedUsdt > 0 && <> · sold {formatMoney(a.receivedUsdt, 'USD')}</>}
      </span>
      {a.untrackedQty > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-btc-orange/40 text-btc-orange" title="Held amount exceeds what Binance spot fills and fiat orders explain (transfer or Convert). Cost basis is partial.">
          partial
        </span>
      )}
      {a.unknownCostQty > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-panel-border text-text-muted" title="Some fiat purchases had no usable fiat to USDT rate.">
          cost?
        </span>
      )}
      <span className={`ml-auto tabular-nums ${tone(a.netUsdt)}`}>
        {a.netUsdt === null ? 'n/a' : signed(a.netUsdt, 'USD')}
      </span>
      <span className={`w-16 text-right tabular-nums text-[11px] ${tone(percent)}`}>
        {percent === null ? '' : formatPercent(percent)}
      </span>
    </li>
  )
}

function CryptoPanel({ crypto, isLoading, error }: { crypto: CryptoPnl | null; isLoading: boolean; error: string | null }) {
  return (
    <section className="bg-panel-bg border border-panel-border rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-2 w-2 rounded-full bg-btc-orange" />
        <span className="text-xs text-text-muted font-mono uppercase tracking-wider">Crypto</span>
        <span className="ml-auto text-[10px] text-text-muted font-mono">Binance · USDT terms</span>
      </div>

      {crypto === null ? (
        isLoading ? (
          <div className="space-y-2"><SkeletonBlock className="h-7 w-32" /><SkeletonBlock className="h-3 w-48" /></div>
        ) : (
          <p className="text-[11px] text-text-muted">{error ?? 'No crypto history yet.'}</p>
        )
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Net" value={crypto.net} currency="USD" percent={crypto.netPercent} />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted font-mono">Invested</div>
              <div className="font-mono text-lg text-text-primary tabular-nums">{formatMoney(crypto.spent, 'USD')}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted font-mono">Value now</div>
              <div className="font-mono text-lg text-text-primary tabular-nums">{formatMoney(crypto.currentValue, 'USD')}</div>
            </div>
          </div>

          {crypto.funding.length > 0 && (
            <p className="mt-2 text-[11px] text-text-muted font-mono">
              Fiat in: {crypto.funding.map((f) => `${formatMoney(f.totalIn, f.currency)}${f.totalOut > 0 ? ` (out ${formatMoney(f.totalOut, f.currency)})` : ''}`).join(' · ')}
            </p>
          )}

          <ul className="mt-3 divide-y divide-panel-border/60">
            {crypto.assets.map((a) => <CryptoRow key={a.asset} a={a} />)}
          </ul>

          {(crypto.hasUntracked || crypto.hasUnknownCost) && (
            <p className="mt-3 text-[11px] text-text-muted">
              Cost basis comes from Binance spot fills on USDT pairs and fiat Buy Crypto orders. Coins marked partial were also received another way (transfer, Convert), so their net is overstated.
            </p>
          )}
          {crypto.hasIgnoredFees && (
            <p className="mt-2 text-[11px] text-text-muted">
              Trading fees paid in another coin (BNB fee discount) are not priced into the cost, so nets are slightly overstated.
            </p>
          )}
          {crypto.warnings.map((w) => (
            <p key={w} className="mt-2 text-[11px] text-btc-orange font-mono">{w}</p>
          ))}
          {error !== null && <p className="mt-2 text-[11px] text-text-muted font-mono">Last refresh failed: {error}</p>}
        </>
      )}
    </section>
  )
}

function PositionRow({ p, currency }: { p: EquityPositionPnl; currency: string }) {
  return (
    <li className="flex items-center gap-3 py-1.5 font-mono text-xs">
      <span className="font-semibold text-text-primary w-14">{p.ticker}</span>
      <span className="text-text-muted hidden sm:inline">cost {formatMoney(p.totalCost, currency)}</span>
      <span className={`ml-auto tabular-nums ${tone(p.unrealized)}`}>{signed(p.unrealized, currency)}</span>
      <span className={`w-16 text-right tabular-nums text-[11px] ${tone(p.unrealizedPercent)}`}>
        {p.unrealizedPercent === null ? '' : formatPercent(p.unrealizedPercent)}
      </span>
    </li>
  )
}

function EquitiesPanel({ equities, isLoading, error }: { equities: EquitiesPnl | null; isLoading: boolean; error: string | null }) {
  return (
    <section className="bg-panel-bg border border-panel-border rounded-lg p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-2 w-2 rounded-full bg-bull-green" />
        <span className="text-xs text-text-muted font-mono uppercase tracking-wider">Stocks and REITs</span>
        <span className="ml-auto text-[10px] text-text-muted font-mono">Trading 212{equities === null ? '' : ` · ${equities.currency}`}</span>
      </div>

      {equities === null ? (
        isLoading ? (
          <div className="space-y-2"><SkeletonBlock className="h-7 w-32" /><SkeletonBlock className="h-3 w-48" /></div>
        ) : (
          <p className="text-[11px] text-text-muted">{error ?? 'Connect Trading 212 to see stock P&L.'}</p>
        )
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Net" value={equities.net} currency={equities.currency} />
            <Stat label="Unrealized" value={equities.unrealized} currency={equities.currency} />
            <Stat label="Realized" value={equities.realized} currency={equities.currency} />
          </div>

          {(['stocks', 'reits'] as const).map((key) => {
            const bucket = equities[key]
            if (bucket.positions.length === 0) return null
            return (
              <div key={key} className="mt-3">
                <div className="flex justify-between font-mono text-[11px] text-text-muted border-b border-panel-border pb-1">
                  <span>{key === 'stocks' ? 'Stocks' : 'REITs'}</span>
                  <span className={tone(bucket.unrealized)}>{signed(bucket.unrealized, equities.currency)} unrealized</span>
                </div>
                <ul className="divide-y divide-panel-border/60">
                  {bucket.positions.map((p) => <PositionRow key={p.ticker} p={p} currency={equities.currency} />)}
                </ul>
              </div>
            )
          })}
          <p className="mt-3 text-[11px] text-text-muted">Realized P&L is reported by Trading 212 for the whole account, so it is not split per position.</p>
        </>
      )}
    </section>
  )
}

export function PnlSection({ pnl, isLoading, error }: PnlSectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <section className="bg-panel-bg border border-panel-border rounded-lg p-4 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-text-muted font-mono">Profit and loss</div>
          {pnl.total === null ? (
            isLoading ? <SkeletonBlock className="mt-2 h-8 w-40" /> : <div className="mt-1 text-text-muted text-sm">No data yet.</div>
          ) : (
            <div className={`mt-1 font-mono text-3xl font-bold tabular-nums ${tone(pnl.total)}`}>
              {signed(pnl.total, pnl.totalCurrency)}
            </div>
          )}
        </div>
        {pnl.total !== null && (
          <div className="text-xs text-text-muted font-mono">
            {pnl.total >= 0 ? 'You are up overall.' : 'You are down overall.'}
            {pnl.isMixedCurrency && ` Crypto in USD plus stocks in ${pnl.equities?.currency ?? ''} at face value.`}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <CryptoPanel crypto={pnl.crypto} isLoading={isLoading} error={error} />
        <EquitiesPanel equities={pnl.equities} isLoading={isLoading} error={null} />
      </div>
    </div>
  )
}
