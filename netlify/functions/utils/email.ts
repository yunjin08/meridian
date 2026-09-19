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
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
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
      html: `<p>${escapeHtml(input.detail)}</p>`,
      text: input.detail,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new EmailError(`Resend responded ${res.status}: ${body}`)
  }
}
