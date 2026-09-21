import type { Config } from '@netlify/functions'
import { binancePublicFetch, BinanceError } from './utils/binance-client.ts'
import { fetchCandlesWithIndicators, EmptyKlinesError } from './utils/klines.ts'
import {
  clearTriggered,
  listActiveAlerts,
  markTriggered,
  updateLastPrice,
  type CronAlert,
} from './utils/alert-repo.ts'
import { sendAlertEmail } from './utils/email.ts'
import { buildBinanceTradeUrl, fetchSpotOnlyPnl } from './utils/alert-pnl.ts'
import { evaluateIndicatorAlert, evaluatePriceAlert, isPriceCondition } from '../../src/lib/alertEvaluation.ts'
import { ALERT_AUTO_RESET_COOLDOWN_MS, DEFAULT_TIMEFRAME, CANDLE_LIMIT } from '../../src/constants.ts'
import type { IndicatorData } from '../../src/types/candle.ts'
import type { CryptoAssetPnl } from '../../src/types/pnl.ts'

interface BinanceSpotPrice {
  symbol: string
  price: string
}

async function fetchPrice(symbol: string): Promise<number | null> {
  try {
    const { price } = await binancePublicFetch<BinanceSpotPrice>('/api/v3/ticker/price', { symbol })
    return Number.parseFloat(price)
  } catch (err) {
    console.error(`[alerts-cron] price fetch failed for ${symbol}:`, err instanceof BinanceError ? err.message : err)
    return null
  }
}

async function fetchIndicators(symbol: string): Promise<IndicatorData | null> {
  try {
    const { indicators } = await fetchCandlesWithIndicators(symbol, DEFAULT_TIMEFRAME, CANDLE_LIMIT)
    return indicators
  } catch (err) {
    if (err instanceof EmptyKlinesError) return null
    console.error(`[alerts-cron] indicator fetch failed for ${symbol}:`, err instanceof BinanceError ? err.message : err)
    return null
  }
}

async function processAlert(alert: CronAlert): Promise<void> {
  if (alert.triggered) {
    const cooledDown =
      alert.autoReset && alert.triggeredAt !== null && Date.now() - alert.triggeredAt > ALERT_AUTO_RESET_COOLDOWN_MS
    if (cooledDown) await clearTriggered(alert.id)
    return
  }

  if (isPriceCondition(alert)) {
    const price = await fetchPrice(alert.symbol)
    if (price === null) return
    const { triggered, detail } = evaluatePriceAlert(alert, price, alert.lastPrice)
    await updateLastPrice(alert.id, price)
    if (triggered) await fireAlert(alert, detail, price)
    return
  }

  const indicators = await fetchIndicators(alert.symbol)
  if (indicators === null) return
  const { triggered, detail } = evaluateIndicatorAlert(alert, indicators)
  if (triggered) await fireAlert(alert, detail)
}

async function fireAlert(alert: CronAlert, detail: string, knownPrice?: number): Promise<void> {
  await markTriggered(alert.id, new Date().toISOString())

  const currentPrice = knownPrice ?? (await fetchPrice(alert.symbol))
  let pnl: CryptoAssetPnl | null = null
  if (currentPrice !== null) {
    try {
      pnl = await fetchSpotOnlyPnl(alert.symbol, currentPrice)
    } catch (err) {
      // Cost basis is a nice-to-have on top of the trigger itself — a failed
      // lookup (rate limit, transient Binance error) should not block the email.
      console.error(`[alerts-cron] P&L lookup failed for ${alert.symbol}:`, err)
    }
  }

  try {
    await sendAlertEmail({
      label: alert.label,
      detail,
      currentPrice,
      pnl,
      tradeUrl: buildBinanceTradeUrl(alert.symbol),
    })
  } catch (err) {
    // The alert is already marked triggered — a bounced email doesn't undo that.
    // Logged for visibility; the owner still sees the trigger in the dashboard.
    console.error(`[alerts-cron] email send failed for alert ${alert.id}:`, err)
  }
}

export default async (): Promise<Response> => {
  const alerts = await listActiveAlerts()
  await Promise.all(alerts.map(processAlert))
  return Response.json({ evaluated: alerts.length })
}

// Every minute — matches the price alert cadence the browser evaluator gave you.
export const config: Config = { schedule: '* * * * *' }
