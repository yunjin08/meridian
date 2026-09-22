import type { CryptoAssetPnl } from '../../../src/types/pnl.ts'

const RESEND_API_URL = 'https://api.resend.com/emails'

// Single-user dashboard: sender and recipient are fixed, not secrets. Resend's
// free tier requires the resend.dev sender when no domain is verified, and in
// that case the recipient must match the Resend account's signup address.
const ALERT_EMAIL_FROM = 'onboarding@resend.dev'
const ALERT_EMAIL_TO = 'jed.donaire08@gmail.com'

// Same tokens as src/index.css's @theme block — the email is meant to look
// like it came from this dashboard, not a generic notification.
const COLOR = {
  bg: '#0d1117',
  panel: '#161b22',
  border: '#30363d',
  textPrimary: '#e6edf3',
  textMuted: '#8b949e',
  orange: '#f7931a',
  green: '#26a69a',
  red: '#ef5350',
} as const

const MONO = `'JetBrains Mono','Fira Code',ui-monospace,Menlo,Consolas,monospace`
const SANS = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif`

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

/** Plain-text fallback — some clients and every notification preview render this instead of the HTML. */
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

function statRow(label: string, value: string, valueColor: string = COLOR.textPrimary): string {
  return `<tr>
    <td style="padding:9px 0;border-top:1px solid ${COLOR.border};font-size:13px;color:${COLOR.textMuted};font-family:${SANS};">${escapeHtml(label)}</td>
    <td style="padding:9px 0;border-top:1px solid ${COLOR.border};font-size:13px;color:${valueColor};font-family:${MONO};text-align:right;">${escapeHtml(value)}</td>
  </tr>`
}

/** Branded HTML: matches the dashboard's dark terminal palette (src/index.css). Inline styles throughout — the one recipient is Gmail, but <style> blocks are still unreliable across clients. */
function buildEmailHtml(input: AlertEmailInput): string {
  const rows: string[] = []
  if (input.currentPrice !== null) rows.push(statRow('Current price', formatUsd(input.currentPrice)))

  let costBasisNote = ''
  if (input.pnl !== null && input.pnl.heldQty > 0) {
    const { asset, avgBuyPriceUsdt, netUsdt, heldQty, unknownCostQty, untrackedQty } = input.pnl
    rows.push(statRow('Held', `${heldQty.toLocaleString('en-US', { maximumFractionDigits: 8 })} ${asset}`))
    if (avgBuyPriceUsdt !== null) rows.push(statRow('Avg. bought at', formatUsd(avgBuyPriceUsdt)))
    if (netUsdt !== null) {
      const color = netUsdt >= 0 ? COLOR.green : COLOR.red
      rows.push(statRow('Est. profit', `${netUsdt >= 0 ? '+' : ''}${formatUsd(netUsdt)}`, color))
    }
    if (unknownCostQty > 0 || untrackedQty > 0) {
      costBasisNote = `<div style="margin-top:16px;padding:10px 12px;background:rgba(247,147,26,0.08);border:1px solid rgba(247,147,26,0.25);border-radius:6px;font-size:11.5px;line-height:1.5;color:${COLOR.textMuted};font-family:${SANS};">Cost basis only reflects spot trades — part of this position came from fiat, P2P, transfer, or convert, so the numbers above are incomplete.</div>`
    }
  }

  return `<div style="background:${COLOR.bg};padding:32px 16px;font-family:${SANS};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:${COLOR.panel};border:1px solid ${COLOR.border};border-radius:12px;">
    <tr><td style="padding:18px 24px;border-bottom:1px solid ${COLOR.border};">
      <span style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${COLOR.orange};font-family:${MONO};font-weight:600;">BTC Dashboard Alert</span>
    </td></tr>
    <tr><td style="padding:24px;">
      <div style="font-size:17px;font-weight:700;color:${COLOR.textPrimary};margin:0 0 8px;line-height:1.35;">${escapeHtml(input.label)}</div>
      <div style="font-size:13px;color:${COLOR.orange};font-family:${MONO};margin:0 0 20px;line-height:1.5;">${escapeHtml(input.detail)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${rows.join('')}</table>
      ${costBasisNote}
      <a href="${escapeHtml(input.tradeUrl)}" style="display:block;text-align:center;margin-top:22px;padding:13px 20px;background:${COLOR.orange};color:${COLOR.bg};font-weight:700;font-size:14px;font-family:${SANS};text-decoration:none;border-radius:8px;">Trade on Binance &rarr;</a>
    </td></tr>
  </table>
  <div style="max-width:480px;margin:14px auto 0;text-align:center;font-size:11px;color:${COLOR.textMuted};font-family:${SANS};">Automated alert from your BTC Dashboard.</div>
</div>`
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
      html: buildEmailHtml(input),
      text: buildBodyLines(input).join('\n'),
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new EmailError(`Resend responded ${res.status}: ${body}`)
  }
}
