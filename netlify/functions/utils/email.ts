import type { CryptoAssetPnl } from '../../../src/types/pnl.ts'

const RESEND_API_URL = 'https://api.resend.com/emails'

// Single-user dashboard: sender and recipient are fixed, not secrets. Resend's
// free tier requires the resend.dev sender when no domain is verified, and in
// that case the recipient must match the Resend account's signup address.
const ALERT_EMAIL_FROM = 'onboarding@resend.dev'
const ALERT_EMAIL_TO = 'jed.donaire08@gmail.com'

export class EmailError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailError'
  }
}

export interface AlertEmailInput {
  label: string
  detail: string
  /** Null when the price lookup itself failed — the email still sends without it. */
  currentPrice: number | null
  /** Null when not held, symbol has no USDT pair, or the P&L lookup failed. */
  pnl: CryptoAssetPnl | null
  tradeUrl: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`
}

function buildBodyLines(input: AlertEmailInput): string[] {
  const lines = [input.detail]

  if (input.currentPrice !== null) {
    lines.push(`Current price: ${formatUsd(input.currentPrice)}`)
  }

  if (input.pnl !== null && input.pnl.heldQty > 0) {
    const { avgBuyPriceUsdt, netUsdt, heldQty, unknownCostQty, untrackedQty } = input.pnl
    lines.push(`Held: ${heldQty.toLocaleString('en-US', { maximumFractionDigits: 8 })} ${input.pnl.asset}`)
    if (avgBuyPriceUsdt !== null) lines.push(`Avg. bought at (spot trades only): ${formatUsd(avgBuyPriceUsdt)}`)
    if (netUsdt !== null) lines.push(`Est. profit (spot trades only): ${netUsdt >= 0 ? '+' : ''}${formatUsd(netUsdt)}`)
    if (unknownCostQty > 0 || untrackedQty > 0) {
      lines.push('Note: part of this position was not acquired via spot trading (fiat purchase, P2P, transfer, or convert) — the cost basis above is incomplete.')
    }
  }

  lines.push(`Trade on Binance: ${input.tradeUrl}`)
  return lines
}

/**
 * Sends one alert-triggered email via Resend. Silently no-ops when the API
 * key is missing so a misconfigured mailer never breaks the cron's in-app
 * trigger bookkeeping — the alert still shows as triggered in the UI.
 */
export async function sendAlertEmail(input: AlertEmailInput): Promise<void> {
  const apiKey = process.env['RESEND_API_KEY']
  if (!apiKey) {
    console.error('[email] RESEND_API_KEY must be set — skipping send')
    return
  }

  const lines = buildBodyLines(input)

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: ALERT_EMAIL_FROM,
      to: ALERT_EMAIL_TO,
      subject: `BTC Dashboard alert: ${input.label}`,
      html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(''),
      text: lines.join('\n'),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new EmailError(`Resend responded ${res.status}: ${body}`)
  }
}
